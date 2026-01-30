import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { buildUrl, useApi } from '@/lib/api';
import { useServer } from '@/lib/server';
import { usePlayer } from '@/lib/player';
import MiniPlayer from '@/components/MiniPlayer';
import PlayerModal from '@/components/PlayerModal';

const PAGE_LIMIT = 60;

type Entry = {
  rootId: string;
  path: string;
  name: string;
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  albumKey?: string | null;
};

export default function MusicScreen() {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const { apiJson } = useApi();
  const { playTrack, setPlayerOpen } = usePlayer();
  const { roots, refresh } = useServer();
  const [items, setItems] = useState<Entry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Entry[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const rootId = useMemo(() => {
    if (!roots.length) {
      return '';
    }
    return roots.length > 1 ? '__all__' : roots[0].id;
  }, [roots]);

  const loadMusic = async () => {
    if (!rootId) {
      return;
    }
    setLoading(true);
    setError('');
    const url = buildUrl('/api/media', {
      root: rootId,
      type: 'music',
      limit: PAGE_LIMIT,
      includeTotal: false,
    });
    const result = await apiJson(url);
    if (!result.ok) {
      setError(result.error?.message || 'Failed to load music');
      setItems([]);
      setLoading(false);
      return;
    }
    setItems(Array.isArray(result.data?.items) ? result.data.items : []);
    setLoading(false);
  };

  useEffect(() => {
    loadMusic();
  }, [rootId]);

  useEffect(() => {
    if (!rootId) {
      return;
    }
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const handle = setTimeout(async () => {
      const url = buildUrl('/api/search', {
        root: rootId,
        q: query,
        type: 'music',
        limit: PAGE_LIMIT,
        includeTotal: false,
      });
      const result = await apiJson(url);
      if (result.ok) {
        setSearchResults(Array.isArray(result.data?.items) ? result.data.items : []);
        setError('');
      } else {
        setSearchResults([]);
        setError(result.error?.message || 'Failed to search');
      }
      setSearching(false);
    }, 250);
    return () => clearTimeout(handle);
  }, [searchQuery, rootId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    await loadMusic();
    setRefreshing(false);
  };

  const cardBackground = colorScheme === 'dark' ? '#171A20' : '#FFFFFF';
  const metaColor = colorScheme === 'dark' ? '#9AA3B2' : '#7D8390';
  const subtitleColor = colorScheme === 'dark' ? '#9AA3B2' : '#7D8390';
  const inputBackground = colorScheme === 'dark' ? '#12161C' : '#FFFFFF';
  const inputBorder = colorScheme === 'dark' ? '#252A33' : '#E3E7EF';

  const renderItem = ({ item }: { item: Entry }) => (
    <Pressable
      style={[styles.row, { backgroundColor: cardBackground }]}
      onPress={() => {
        const listItems = searchQuery.trim() ? searchResults : items;
        playTrack(item, listItems);
        setPlayerOpen(true);
      }}
    >
      <View style={styles.icon}>
        <FontAwesome name="music" size={18} color={palette.tint} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>
          {item.title || item.name}
        </Text>
        <Text style={[styles.subtitle, { color: metaColor }]} numberOfLines={1}>
          {item.artist || 'Unknown Artist'} · {item.album || 'Unknown Album'}
        </Text>
      </View>
    </Pressable>
  );

  if (!rootId) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
        <View style={styles.center}>
          <Text style={styles.emptyText}>No storage roots configured.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const listItems = searchQuery.trim() ? searchResults : items;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: palette.text }]}>Music</Text>
        <Text style={[styles.headerSubtitle, { color: subtitleColor }]}>Your tracks, ready to play</Text>
      </View>
      <View style={styles.searchRow}>
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search music"
          placeholderTextColor={metaColor}
          style={[
            styles.searchInput,
            { backgroundColor: inputBackground, borderColor: inputBorder, color: palette.text },
          ]}
        />
      </View>
      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={listItems}
          keyExtractor={(item) => `${item.rootId}:${item.path}`}
          renderItem={renderItem}
          contentContainerStyle={listItems.length ? styles.list : styles.listEmpty}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {searchQuery.trim()
                ? searching
                  ? 'Searching...'
                  : 'No matches found.'
                : 'No tracks found.'}
            </Text>
          }
        />
      )}
      <MiniPlayer />
      <PlayerModal />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  headerSubtitle: {
    marginTop: 4,
  },
  list: {
    paddingHorizontal: 12,
    paddingBottom: 90,
  },
  searchRow: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  listEmpty: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginBottom: 10,
  },
  icon: {
    width: 32,
    alignItems: 'center',
  },
  rowText: {
    flex: 1,
    marginLeft: 6,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    color: '#C03D3D',
  },
  emptyText: {
    color: '#7D8390',
  },
});
