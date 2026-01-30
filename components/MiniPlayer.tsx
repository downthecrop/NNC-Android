import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { usePlayer } from '@/lib/player';

export default function MiniPlayer() {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const { current, playing, loading, setPlayerOpen, togglePlay } = usePlayer();

  if (!current) {
    return null;
  }

  const cardBackground = colorScheme === 'dark' ? '#171A20' : '#FFFFFF';
  const metaColor = colorScheme === 'dark' ? '#9AA3B2' : '#7D8390';

  return (
    <Pressable style={[styles.bar, { backgroundColor: cardBackground }]} onPress={() => setPlayerOpen(true)}>
      <View style={styles.meta}>
        <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>
          {current.title || current.name}
        </Text>
        <Text style={[styles.subtitle, { color: metaColor }]} numberOfLines={1}>
          {current.artist || 'Unknown Artist'}
        </Text>
      </View>
      <Pressable style={[styles.button, { backgroundColor: palette.tint }]} onPress={togglePlay}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <FontAwesome name={playing ? 'pause' : 'play'} size={16} color="#fff" />
        )}
      </Pressable>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
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
});
