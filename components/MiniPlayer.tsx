import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { buildUrl } from '@/lib/apiClient';
import { usePlayer } from '@/lib/player';

export default function MiniPlayer() {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const { current, playing, loading, setPlayerOpen, togglePlay, durationMs, positionMs, authHeaders } =
    usePlayer();
  const [albumArtOk, setAlbumArtOk] = useState(true);
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
  const fallbackDurationMs =
    current?.duration && Number.isFinite(current.duration) ? Math.round(current.duration * 1000) : 0;
  const effectiveDurationMs = durationMs || fallbackDurationMs;

  useEffect(() => {
    setAlbumArtOk(true);
  }, [albumArtUrl]);

  if (!current) {
    return null;
  }

  const cardBackground = colorScheme === 'dark' ? '#171A20' : '#FFFFFF';
  const metaColor = colorScheme === 'dark' ? '#9AA3B2' : '#7D8390';

  return (
    <Pressable
      style={[styles.bar, { backgroundColor: cardBackground }]}
      onPress={() => setPlayerOpen(true)}
    >
      <View style={styles.artWrap}>
        {albumArtUrl && albumArtOk ? (
          <Image
            source={{ uri: albumArtUrl, headers: authHeaders }}
            style={styles.art}
            onError={() => setAlbumArtOk(false)}
          />
        ) : (
          <View style={styles.artPlaceholder}>
            <FontAwesome name="compact-disc" size={18} color={palette.tint} />
          </View>
        )}
      </View>
      <View style={styles.meta}>
        <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>
          {current.title || current.name}
        </Text>
        <Text style={[styles.subtitle, { color: metaColor }]} numberOfLines={1}>
          {(current.artist || 'Unknown Artist') +
            (current.album ? ` · ${current.album}` : ' · Unknown Album')}
        </Text>
      </View>
      <Pressable
        style={[styles.button, { backgroundColor: palette.tint }]}
        onPress={(event) => {
          event.stopPropagation?.();
          togglePlay();
        }}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <FontAwesome name={playing ? 'pause' : 'play'} size={16} color="#fff" />
        )}
      </Pressable>
      <View style={styles.progressTrack}>
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
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 18,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  artWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    marginRight: 12,
    overflow: 'hidden',
    backgroundColor: '#0B0F14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  art: {
    width: '100%',
    height: '100%',
  },
  artPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 4,
    height: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#3B82F6',
  },
});
