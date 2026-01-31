import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  Event,
  RepeatMode,
  State,
  Track as TrackPlayerTrack,
  usePlaybackState,
  useProgress,
  useTrackPlayerEvents,
} from 'react-native-track-player';
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
  duration?: number | null;
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

const trackId = (track: Track) => `${track.rootId}:${track.path}`;
const placeholderArtwork = require('../assets/images/icon.png');

const normalizePlaybackState = (value: unknown): State | undefined => {
  if (value && typeof value === 'object' && 'state' in value) {
    return (value as { state?: State }).state;
  }
  return value as State | undefined;
};

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
  const playerReadyRef = useRef(false);
  const queueRef = useRef<Track[]>([]);

  const authHeaders = token ? { Authorization: `Bearer ${token}` } : undefined;
  const playbackState = usePlaybackState();
  const progress = useProgress(1000);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  const ensurePlayer = async () => {
    if (playerReadyRef.current) {
      return;
    }
    await TrackPlayer.setupPlayer();
    await TrackPlayer.updateOptions({
      android: {
        appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback,
        alwaysPauseOnInterruption: false,
      },
      capabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.Stop,
        Capability.SeekTo,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
      ],
      compactCapabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext],
      notificationCapabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
        Capability.SeekTo,
        Capability.Stop,
      ],
      progressUpdateEventInterval: 1,
    });
    await TrackPlayer.setRepeatMode(RepeatMode.Off);
    playerReadyRef.current = true;
  };

  useEffect(() => {
    ensurePlayer().catch(() => {});

    return () => {
      TrackPlayer.destroy().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const state = normalizePlaybackState(playbackState);
    setPlaying(state === State.Playing);
    setLoading(state === State.Connecting || state === State.Buffering);
  }, [playbackState]);

  useEffect(() => {
    if (!current) {
      setPositionMs(0);
      setDurationMs(0);
      return;
    }
    const nextPosition = Math.floor(progress.position * 1000);
    if (Number.isFinite(nextPosition)) {
      setPositionMs(nextPosition);
    }
    const nextDuration = Math.floor(progress.duration * 1000);
    if (Number.isFinite(nextDuration) && nextDuration > 0) {
      setDurationMs(nextDuration);
    }
  }, [progress.position, progress.duration, current?.path]);

  useTrackPlayerEvents([Event.PlaybackActiveTrackChanged], () => {
    TrackPlayer.getActiveTrack()
      .then((activeTrack) => {
        if (!activeTrack?.id) {
          setCurrent(null);
          setCurrentIndex(-1);
          return;
        }
        const id = String(activeTrack.id);
        const nextIndex = queueRef.current.findIndex((track) => trackId(track) === id);
        if (nextIndex >= 0) {
          setCurrent(queueRef.current[nextIndex]);
          setCurrentIndex(nextIndex);
          const rawDuration = queueRef.current[nextIndex].duration;
          const fallbackDuration = Number(rawDuration);
          if (Number.isFinite(fallbackDuration) && fallbackDuration > 0) {
            setDurationMs(Math.round(fallbackDuration * 1000));
          }
          TrackPlayer.updateNowPlayingMetadata({
            title: queueRef.current[nextIndex].title || queueRef.current[nextIndex].name || 'Unknown Title',
            artist: queueRef.current[nextIndex].artist || 'Unknown Artist',
            album: queueRef.current[nextIndex].album || 'Unknown Album',
            artwork: placeholderArtwork,
            duration: Number.isFinite(fallbackDuration) && fallbackDuration > 0 ? fallbackDuration : undefined,
          }).catch(() => {});
        }
      })
      .catch(() => {});
  });

  const toPlayerTrack = (track: Track): TrackPlayerTrack => {
    const durationValue = Number(track.duration);
    const duration = Number.isFinite(durationValue) && durationValue > 0 ? durationValue : undefined;

    return {
      id: trackId(track),
      url: buildUrl('/api/file', { root: track.rootId, path: track.path }),
      headers: authHeaders,
      title: track.title || track.name || 'Unknown Title',
      artist: track.artist || 'Unknown Artist',
      album: track.album || 'Unknown Album',
      artwork: placeholderArtwork,
      duration,
    };
  };

  const playTrack = async (track: Track, nextQueue?: Track[]) => {
    if (!track?.rootId || !track?.path) {
      return;
    }
    setLoading(true);
    try {
      await ensurePlayer();
      const nextList = nextQueue && nextQueue.length ? nextQueue : null;
      if (nextList) {
        const items = nextList.map(toPlayerTrack);
        await TrackPlayer.reset();
        await TrackPlayer.add(items);
        setQueue(nextList);
        queueRef.current = nextList;
      } else if (!queueRef.current.length) {
        const items = [toPlayerTrack(track)];
        await TrackPlayer.reset();
        await TrackPlayer.add(items);
        setQueue([track]);
        queueRef.current = [track];
      } else if (!queueRef.current.some((item) => trackId(item) === trackId(track))) {
        await TrackPlayer.add([toPlayerTrack(track)]);
        const updatedQueue = [...queueRef.current, track];
        setQueue(updatedQueue);
        queueRef.current = updatedQueue;
      }

      const nextIndex = queueRef.current.findIndex((item) => trackId(item) === trackId(track));
      setCurrentIndex(nextIndex);
      setCurrent(track);
      const durationValue = Number(track.duration);
      setDurationMs(Number.isFinite(durationValue) && durationValue > 0 ? Math.round(durationValue * 1000) : 0);
      setPositionMs(0);

      if (nextIndex >= 0) {
        await TrackPlayer.skip(nextIndex);
      }
      await TrackPlayer.play();
    } catch {
      setPlaying(false);
    } finally {
      setLoading(false);
    }
  };

  const togglePlay = async () => {
    try {
      await ensurePlayer();
      if (!current) {
        return;
      }
      const state = normalizePlaybackState(await TrackPlayer.getPlaybackState());
      if (state === State.Playing) {
        await TrackPlayer.pause();
        setPlaying(false);
      } else {
        await TrackPlayer.play();
        setPlaying(true);
      }
    } catch {
      // ignore toggle errors
    }
  };

  const next = () => {
    TrackPlayer.skipToNext()
      .then(() => TrackPlayer.play())
      .catch(() => {});
  };

  const prev = () => {
    TrackPlayer.skipToPrevious()
      .then(() => TrackPlayer.play())
      .catch(() => {});
  };

  const seekTo = async (ms: number) => {
    const clamped = Number.isFinite(ms) ? Math.max(0, ms) : 0;
    try {
      await TrackPlayer.seekTo(clamped / 1000);
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
