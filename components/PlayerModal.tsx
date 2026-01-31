import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faCompactDisc } from '@fortawesome/free-solid-svg-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { buildUrl } from '@/lib/apiClient';
import { usePlayer } from '@/lib/player';

function formatTime(valueMs: number) {
  if (!valueMs || valueMs < 0) {
    return '0:00';
  }
  const totalSeconds = Math.floor(valueMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export default function PlayerModal() {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const {
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
    togglePlay,
    next,
    prev,
    seekTo,
    playTrack,
    authHeaders,
  } = usePlayer();
  const screen = Dimensions.get('window');
  const [progressWidth, setProgressWidth] = useState(0);
  const [albumArtOk, setAlbumArtOk] = useState(true);
  const fallbackDurationMs =
    current?.duration && Number.isFinite(current.duration) ? Math.round(current.duration * 1000) : 0;
  const effectiveDurationMs = durationMs || fallbackDurationMs;
  const albumArtParams =
    current?.rootId && (current.albumKey || current.album || current.artist)
      ? {
          root: current.rootId,
          key: current.albumKey || undefined,
          album: current.albumKey ? undefined : current.album || undefined,
          artist: current.albumKey ? undefined : current.artist || undefined,
        }
      : null;
  const albumArtUrl = albumArtParams ? buildUrl('/api/album-art', albumArtParams) : null;

  useEffect(() => {
    setAlbumArtOk(true);
  }, [albumArtUrl]);

  if (!current) {
    return null;
  }

  return (
    <Modal
      visible={playerOpen}
      transparent
      animationType="fade"
      onRequestClose={() => {
        setQueueOpen(false);
        setPlayerOpen(false);
      }}
    >
      <View
        style={[
          styles.backdrop,
          { paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 32) },
        ]}
      >
        <View style={styles.topRow}>
          <Pressable
            style={styles.topButton}
            onPress={() => {
              setQueueOpen(false);
              setPlayerOpen(false);
            }}
          >
            <FontAwesome name="chevron-down" size={20} color="#fff" />
          </Pressable>
          <Text style={styles.topTitle}>Now Playing</Text>
          <Pressable style={styles.topButton} onPress={() => setQueueOpen(!queueOpen)}>
            <FontAwesome name="list" size={20} color="#fff" />
          </Pressable>
        </View>
        <View style={styles.artWrap}>
          {albumArtUrl && albumArtOk ? (
            <Image
              source={{ uri: albumArtUrl, headers: authHeaders }}
              style={[styles.art, { width: screen.width * 0.72, height: screen.width * 0.72 }]}
              onError={() => setAlbumArtOk(false)}
            />
          ) : (
            <View
              style={[
                styles.art,
                styles.artPlaceholder,
                { width: screen.width * 0.72, height: screen.width * 0.72 },
              ]}
            >
              <FontAwesomeIcon icon={faCompactDisc} size={56} color="#9AA3B2" />
            </View>
          )}
        </View>
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={2}>
            {current.title || current.name}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {current.artist || 'Unknown Artist'} · {current.album || 'Unknown Album'}
          </Text>
        </View>
        <View style={styles.progressWrap}>
          <Pressable
            style={styles.progressTrack}
            onLayout={(event) => setProgressWidth(event.nativeEvent.layout.width)}
            onPress={(event) => {
              if (!effectiveDurationMs || !progressWidth) {
                return;
              }
              const ratio = Math.max(
                0,
                Math.min(1, event.nativeEvent.locationX / progressWidth)
              );
              seekTo(ratio * effectiveDurationMs);
            }}
            onPressIn={(event) => {
              if (!effectiveDurationMs || !progressWidth) {
                return;
              }
              const ratio = Math.max(
                0,
                Math.min(1, event.nativeEvent.locationX / progressWidth)
              );
              seekTo(ratio * effectiveDurationMs);
            }}
          >
            <View
              style={[
                styles.progressFill,
                {
                  width: effectiveDurationMs
                    ? `${Math.min(100, (positionMs / effectiveDurationMs) * 100)}%`
                    : '0%',
                },
              ]}
            />
          </Pressable>
          <View style={styles.progressMeta}>
            <Text style={styles.progressLabel}>{formatTime(positionMs)}</Text>
            <Text style={styles.progressLabel}>{formatTime(effectiveDurationMs)}</Text>
          </View>
        </View>
        <View style={styles.controls}>
          <Pressable style={styles.control} onPress={prev}>
            <FontAwesome name="backward" size={22} color="#fff" />
          </Pressable>
          <Pressable style={[styles.primary, { backgroundColor: palette.tint }]} onPress={togglePlay}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <FontAwesome name={playing ? 'pause' : 'play'} size={22} color="#fff" />
            )}
          </Pressable>
          <Pressable style={styles.control} onPress={next}>
            <FontAwesome name="forward" size={22} color="#fff" />
          </Pressable>
        </View>
        {queueOpen ? (
          <View style={styles.queueSheet}>
            <Text style={styles.queueTitle}>Up Next</Text>
            <FlatList
              data={queue}
              keyExtractor={(item) => `${item.rootId}:${item.path}`}
              renderItem={({ item }) => {
                const isCurrent =
                  current.rootId === item.rootId && current.path === item.path;
                return (
                  <Pressable
                    style={[styles.queueRow, isCurrent && styles.queueRowActive]}
                    onPress={() => playTrack(item, queue)}
                  >
                    <View style={styles.queueIcon}>
                      <FontAwesome name={isCurrent ? 'play' : 'music'} size={14} color="#fff" />
                    </View>
                    <View style={styles.queueText}>
                      <Text style={styles.queueTrack} numberOfLines={1}>
                        {item.title || item.name}
                      </Text>
                      <Text style={styles.queueMeta} numberOfLines={1}>
                        {item.artist || 'Unknown Artist'}
                      </Text>
                    </View>
                  </Pressable>
                );
              }}
            />
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#0B0F14',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 32,
    justifyContent: 'space-between',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    color: '#E6EAF0',
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  artWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  art: {
    borderRadius: 24,
    backgroundColor: '#0F1720',
  },
  artPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#F5F7FB',
    textAlign: 'center',
  },
  meta: {
    fontSize: 13,
    color: '#9AA3B2',
    textAlign: 'center',
  },
  progressWrap: {
    width: '100%',
    paddingHorizontal: 8,
    marginTop: 6,
    marginBottom: 6,
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#3B82F6',
  },
  progressMeta: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressLabel: {
    color: '#9AA3B2',
    fontSize: 11,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
  },
  control: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '42%',
    backgroundColor: 'rgba(9, 12, 18, 0.98)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  queueTitle: {
    color: '#E6EAF0',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 12,
    letterSpacing: 0.6,
  },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginBottom: 8,
  },
  queueRowActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.18)',
  },
  queueIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  queueText: {
    flex: 1,
  },
  queueTrack: {
    color: '#F5F7FB',
    fontSize: 13,
    fontWeight: '600',
  },
  queueMeta: {
    color: '#9AA3B2',
    fontSize: 11,
    marginTop: 2,
  },
});
