import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Audio } from 'expo-av';
import { buildUrl } from './apiClient';
import { useAuth } from './auth';

export type Track = {
  rootId: string;
  path: string;
  name: string;
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  albumKey?: string | null;
};

type PlayerContextValue = {
  queue: Track[];
  current: Track | null;
  playing: boolean;
  loading: boolean;
  durationMs: number;
  positionMs: number;
  playerOpen: boolean;
  queueOpen: boolean;
  setPlayerOpen: (value: boolean) => void;
  setQueueOpen: (value: boolean) => void;
  playTrack: (track: Track, queue?: Track[]) => Promise<void>;
  togglePlay: () => Promise<void>;
  next: () => void;
  prev: () => void;
  seekTo: (ms: number) => Promise<void>;
  authHeaders: Record<string, string> | undefined;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [queue, setQueue] = useState<Track[]>([]);
  const [current, setCurrent] = useState<Track | null>(null);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const [positionMs, setPositionMs] = useState(0);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  const authHeaders = token ? { Authorization: `Bearer ${token}` } : undefined;

  useEffect(() => {
    Audio.setAudioModeAsync({
      staysActiveInBackground: true,
      playsInSilentModeIOS: true,
    }).catch(() => {});

    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
    };
  }, []);

  const loadSound = async (track: Track) => {
    if (soundRef.current) {
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }
    const source = {
      uri: buildUrl('/api/file', { root: track.rootId, path: track.path }),
      headers: authHeaders,
    };
    const { sound } = await Audio.Sound.createAsync(source, { shouldPlay: true });
    sound.setOnPlaybackStatusUpdate((status) => {
      if (!status.isLoaded) {
        return;
      }
      setPlaying(status.isPlaying);
      setPositionMs(status.positionMillis ?? 0);
      setDurationMs(status.durationMillis ?? 0);
      if (status.didJustFinish) {
        setPlaying(false);
      }
    });
    const status = await sound.getStatusAsync();
    if (status.isLoaded) {
      setDurationMs(status.durationMillis ?? 0);
      setPositionMs(status.positionMillis ?? 0);
    }
    soundRef.current = sound;
  };

  const playTrack = async (track: Track, nextQueue?: Track[]) => {
    if (!track?.rootId || !track?.path) {
      return;
    }
    setLoading(true);
    try {
      if (nextQueue && nextQueue.length) {
        setQueue(nextQueue);
        const index = nextQueue.findIndex(
          (item) => item.rootId === track.rootId && item.path === track.path
        );
        setCurrentIndex(index);
      }
      await loadSound(track);
      setCurrent(track);
      setPlaying(true);
      setPositionMs(0);
    } catch {
      setPlaying(false);
    } finally {
      setLoading(false);
    }
  };

  const togglePlay = async () => {
    if (!soundRef.current) {
      if (current) {
        await playTrack(current, queue);
      }
      return;
    }
    const status = await soundRef.current.getStatusAsync();
    if (!status.isLoaded) {
      return;
    }
    if (status.isPlaying) {
      await soundRef.current.pauseAsync();
      setPlaying(false);
    } else {
      await soundRef.current.playAsync();
      setPlaying(true);
    }
  };

  const next = () => {
    if (!queue.length) {
      return;
    }
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % queue.length : 0;
    setCurrentIndex(nextIndex);
    playTrack(queue[nextIndex], queue);
  };

  const prev = () => {
    if (!queue.length) {
      return;
    }
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : Math.max(queue.length - 1, 0);
    setCurrentIndex(prevIndex);
    playTrack(queue[prevIndex], queue);
  };

  const seekTo = async (ms: number) => {
    if (!soundRef.current || !durationMs) {
      return;
    }
    const clamped = Math.max(0, Math.min(durationMs, ms));
    try {
      await soundRef.current.setPositionAsync(clamped);
      setPositionMs(clamped);
    } catch {
      // ignore seek errors
    }
  };

  const value = useMemo<PlayerContextValue>(
    () => ({
      queue,
      current,
      playing,
      loading,
      durationMs,
      positionMs,
      playerOpen,
      queueOpen,
      setPlayerOpen,
      setQueueOpen,
      playTrack,
      togglePlay,
      next,
      prev,
      seekTo,
      authHeaders,
    }),
    [
      queue,
      current,
      playing,
      loading,
      durationMs,
      positionMs,
      playerOpen,
      queueOpen,
      authHeaders,
    ]
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) {
    throw new Error('usePlayer must be used within PlayerProvider');
  }
  return ctx;
}
