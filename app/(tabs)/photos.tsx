import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { buildUrl, useApi } from '@/lib/api';
import { useServer } from '@/lib/server';
import PhotoViewerModal from '@/components/PhotoViewerModal';

const PAGE_LIMIT = 60;

type Entry = {
  rootId: string;
  path: string;
  name: string;
  mtime: number;
  mime?: string | null;
};

export default function PhotosScreen() {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const { apiJson, authHeaders } = useApi();
  const { roots, refresh } = useServer();
  const [items, setItems] = useState<Entry[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Entry[]>([]);
  const [searchOffset, setSearchOffset] = useState(0);
  const [searchHasMore, setSearchHasMore] = useState(true);
  const [searchLoadingMore, setSearchLoadingMore] = useState(false);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const rootId = useMemo(() => {
    if (!roots.length) {
      return '';
    }
    return roots.length > 1 ? '__all__' : roots[0].id;
  }, [roots]);

  const loadPhotos = async ({ reset = true } = {}) => {
    if (!rootId) {
      return;
    }
    if (reset) {
      setLoading(true);
      setOffset(0);
      setHasMore(true);
    } else {
      setLoadingMore(true);
    }
    setError('');
    const pageOffset = reset ? 0 : offset;
    const url = buildUrl('/api/media', {
      root: rootId,
      type: 'photos',
      limit: PAGE_LIMIT,
      offset: pageOffset,
    });
    const result = await apiJson(url);
    if (!result.ok) {
      setError(result.error?.message || 'Failed to load photos');
      if (reset) {
        setItems([]);
        setOffset(0);
        setHasMore(false);
      }
      setLoading(false);
      setLoadingMore(false);
      return;
    }
    const newItems = Array.isArray(result.data?.items) ? result.data.items : [];
    setItems((prev) => (reset ? newItems : [...prev, ...newItems]));
    setOffset(pageOffset + newItems.length);
    setHasMore(newItems.length === PAGE_LIMIT);
    setLoading(false);
    setLoadingMore(false);
  };

  useEffect(() => {
    loadPhotos({ reset: true });
  }, [rootId]);

  useEffect(() => {
    if (!rootId) {
      return;
    }
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      setSearchOffset(0);
      setSearchHasMore(true);
      setSearching(false);
      return;
    }
    setSearching(true);
    const handle = setTimeout(async () => {
      setSearchOffset(0);
      setSearchHasMore(true);
      const url = buildUrl('/api/search', {
        root: rootId,
        q: query,
        type: 'photos',
        limit: PAGE_LIMIT,
      });
      const result = await apiJson(url);
      if (result.ok) {
        const newItems = Array.isArray(result.data?.items) ? result.data.items : [];
        setSearchResults(newItems);
        setSearchOffset(newItems.length);
        setSearchHasMore(newItems.length === PAGE_LIMIT);
        setError('');
      } else {
        setSearchResults([]);
        setError(result.error?.message || 'Failed to search');
      }
      setSearching(false);
    }, 250);
    return () => clearTimeout(handle);
  }, [searchQuery, rootId]);

  const loadMorePhotos = async () => {
    if (loading || loadingMore || !hasMore || searchQuery.trim()) {
      return;
    }
    await loadPhotos({ reset: false });
  };

  const loadMoreSearch = async () => {
    if (
      searching ||
      searchLoadingMore ||
      !searchHasMore ||
      !searchQuery.trim() ||
      !rootId
    ) {
      return;
    }
    setSearchLoadingMore(true);
    const pageOffset = searchOffset;
    const url = buildUrl('/api/search', {
      root: rootId,
      q: searchQuery.trim(),
      type: 'photos',
      limit: PAGE_LIMIT,
      offset: pageOffset,
    });
    const result = await apiJson(url);
    if (result.ok) {
      const newItems = Array.isArray(result.data?.items) ? result.data.items : [];
      setSearchResults((prev) => [...prev, ...newItems]);
      setSearchOffset(pageOffset + newItems.length);
      setSearchHasMore(newItems.length === PAGE_LIMIT);
    }
    setSearchLoadingMore(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    await loadPhotos({ reset: true });
    setRefreshing(false);
  };

  const cardBackground = colorScheme === 'dark' ? '#171A20' : '#FFFFFF';
  const subtitleColor = colorScheme === 'dark' ? '#9AA3B2' : '#7D8390';
  const inputBackground = colorScheme === 'dark' ? '#12161C' : '#FFFFFF';
  const inputBorder = colorScheme === 'dark' ? '#252A33' : '#E3E7EF';

  if (!rootId) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}> 
        <View style={styles.center}>
          <Text style={styles.emptyText}>No storage roots configured.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isSearchMode = Boolean(searchQuery.trim());
  const listItems = isSearchMode ? searchResults : items;
  const emptyLabel = searchQuery.trim()
    ? searching
      ? 'Searching...'
      : 'No matches found.'
    : 'No photos yet.';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}> 
      <View style={styles.header}>
        <Text style={[styles.title, { color: palette.text }]}>Photos</Text>
        <Text style={[styles.subtitle, { color: subtitleColor }]}>
          Latest moments across your library
        </Text>
      </View>
      <View style={styles.searchRow}>
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search photos"
          placeholderTextColor={subtitleColor}
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
          key="photos-grid-3"
          data={listItems}
          keyExtractor={(item) => `${item.rootId}:${item.path}`}
          numColumns={3}
          columnWrapperStyle={styles.column}
          contentContainerStyle={listItems.length ? styles.grid : styles.gridEmpty}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          onEndReached={() => {
            if (isSearchMode) {
              loadMoreSearch();
            } else {
              loadMorePhotos();
            }
          }}
          onEndReachedThreshold={0.4}
          renderItem={({ item }) => (
            <Pressable
              style={[styles.tile, { backgroundColor: cardBackground }]}
              onPress={() => {
                const index = listItems.findIndex(
                  (entry) => entry.rootId === item.rootId && entry.path === item.path
                );
                setActiveIndex(index >= 0 ? index : 0);
              }}
            >
              <Image
                source={{
                  uri: buildUrl('/api/preview', { root: item.rootId, path: item.path }),
                  headers: authHeaders,
                }}
                style={styles.image}
              />
            </Pressable>
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>{emptyLabel}</Text>}
        />
      )}
      <PhotoViewerModal
        visible={activeIndex !== null}
        items={listItems}
        activeIndex={activeIndex ?? 0}
        onClose={() => setActiveIndex(null)}
        authHeaders={authHeaders}
      />
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
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 4,
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
  grid: {
    paddingHorizontal: 12,
    paddingBottom: 24,
  },
  gridEmpty: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  column: {
    gap: 8,
    marginBottom: 8,
  },
  tile: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    height: 110,
  },
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
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
