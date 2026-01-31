import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { buildUrl, useApi } from '@/lib/api';
import { formatBytes } from '@/lib/format';
import { useServer } from '@/lib/server';
import { usePlayer } from '@/lib/player';
import MiniPlayer from '@/components/MiniPlayer';
import PlayerModal from '@/components/PlayerModal';
import PhotoViewerModal from '@/components/PhotoViewerModal';

const PAGE_LIMIT = 50;

type Entry = {
  rootId: string;
  path: string;
  name: string;
  size: number;
  mtime: number;
  mime?: string | null;
  isDir: boolean;
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  duration?: number | null;
  albumKey?: string | null;
};

export default function FilesScreen() {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const { apiJson, authHeaders } = useApi();
  const { playTrack, setPlayerOpen } = usePlayer();
  const { roots, refresh } = useServer();
  const [rootId, setRootId] = useState('');
  const [path, setPath] = useState('');
  const [items, setItems] = useState<Entry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Entry[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOffset, setSearchOffset] = useState(0);
  const [searchHasMore, setSearchHasMore] = useState(true);
  const [searchLoadingMore, setSearchLoadingMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [mediaIndex, setMediaIndex] = useState<number | null>(null);
  const cardBackground = colorScheme === 'dark' ? '#171A20' : '#FFFFFF';
  const chipBackground = colorScheme === 'dark' ? '#1F232B' : '#E9EDF5';
  const metaColor = colorScheme === 'dark' ? '#9AA3B2' : '#7D8390';
  const inputBackground = colorScheme === 'dark' ? '#12161C' : '#FFFFFF';
  const inputBorder = colorScheme === 'dark' ? '#252A33' : '#E3E7EF';
  const isSearchMode = Boolean(searchQuery.trim());
  const listItems = useMemo(
    () => (isSearchMode ? searchResults : items),
    [isSearchMode, searchResults, items]
  );
  const mediaItems = useMemo(
    () =>
      listItems.filter(
        (entry) => entry.mime?.startsWith('image/') || entry.mime?.startsWith('video/')
      ),
    [listItems]
  );
  const audioItems = useMemo(
    () => listItems.filter((entry) => entry.mime?.startsWith('audio/')),
    [listItems]
  );

  const activeRoot = useMemo(
    () => roots.find((root) => root.id === rootId) || roots[0] || null,
    [roots, rootId]
  );

  useEffect(() => {
    if (!rootId && roots.length) {
      setRootId(roots[0].id);
      setPath('');
    }
  }, [roots, rootId]);

  const loadList = async () => {
    if (!activeRoot) {
      return;
    }
    setLoading(true);
    setError('');
    const url = buildUrl('/api/list', {
      root: activeRoot.id,
      path,
      limit: PAGE_LIMIT,
      includeTotal: false,
    });
    const result = await apiJson(url);
    if (!result.ok) {
      setError(result.error?.message || 'Failed to load files');
      setItems([]);
      setLoading(false);
      return;
    }
    const nextItems = Array.isArray(result.data?.items) ? result.data.items : [];
    setItems(nextItems);
    setLoading(false);
  };

  useEffect(() => {
    loadList();
  }, [activeRoot?.id, path]);

  const resetSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setSearchOffset(0);
    setSearchHasMore(true);
    setSearchLoadingMore(false);
    setSearching(false);
  };

  const runSearch = async ({ reset = true } = {}) => {
    if (!activeRoot) {
      return;
    }
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      setSearchOffset(0);
      setSearchHasMore(true);
      setSearchLoadingMore(false);
      setSearching(false);
      return;
    }
    if (reset) {
      setSearching(true);
      setSearchOffset(0);
      setSearchHasMore(true);
    } else {
      setSearchLoadingMore(true);
    }
    setError('');
    const pageOffset = reset ? 0 : searchOffset;
    const url = buildUrl('/api/search', {
      root: activeRoot.id,
      q: query,
      type: 'all',
      limit: PAGE_LIMIT,
      offset: pageOffset,
      includeTotal: false,
    });
    const result = await apiJson(url);
    if (result.ok) {
      const newItems = Array.isArray(result.data?.items) ? result.data.items : [];
      setSearchResults((prev) => (reset ? newItems : [...prev, ...newItems]));
      setSearchOffset(pageOffset + newItems.length);
      setSearchHasMore(newItems.length === PAGE_LIMIT);
      setError('');
    } else {
      setSearchResults([]);
      setSearchOffset(0);
      setSearchHasMore(false);
      setError(result.error?.message || 'Failed to search');
    }
    setSearching(false);
    setSearchLoadingMore(false);
  };

  useEffect(() => {
    if (!activeRoot) {
      return;
    }
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      setSearchOffset(0);
      setSearchHasMore(true);
      setSearchLoadingMore(false);
      setSearching(false);
      return;
    }
    runSearch({ reset: true });
  }, [searchQuery, activeRoot?.id]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    await loadList();
    setRefreshing(false);
  };

  const handleRootSelect = (id: string) => {
    if (id === rootId) {
      return;
    }
    setRootId(id);
    setPath('');
    setItems([]);
    resetSearch();
  };

  const goUp = () => {
    if (!path) {
      return;
    }
    const parts = path.split('/');
    parts.pop();
    setPath(parts.join('/'));
    resetSearch();
  };

  const iconFor = (entry: Entry) => {
    if (entry.isDir) {
      return 'folder';
    }
    if (entry.mime?.startsWith('image/')) {
      return 'image';
    }
    if (entry.mime?.startsWith('video/')) {
      return 'film';
    }
    if (entry.mime?.startsWith('audio/')) {
      return 'music';
    }
    return 'file';
  };

  const renderItem = ({ item }: { item: Entry }) => (
    <Pressable
      style={[styles.row, { backgroundColor: cardBackground }]}
      onPress={() => {
        if (item.isDir) {
          setPath(item.path);
          resetSearch();
        } else if (item.mime?.startsWith('image/') || item.mime?.startsWith('video/')) {
          const index = mediaItems.findIndex(
            (entry) => entry.rootId === item.rootId && entry.path === item.path
          );
          setMediaIndex(index >= 0 ? index : 0);
        } else if (item.mime?.startsWith('audio/')) {
          playTrack(item, audioItems.length ? audioItems : undefined);
          setPlayerOpen(true);
        }
      }}
    >
      <View style={styles.rowIcon}>
        <FontAwesome name={iconFor(item)} size={18} color={palette.tint} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: palette.text }]} numberOfLines={1}>
          {item.name || item.path}
        </Text>
        <Text style={[styles.rowMeta, { color: metaColor }]} numberOfLines={1}>
          {item.isDir ? 'Folder' : formatBytes(item.size)}
        </Text>
      </View>
      {item.isDir && <FontAwesome name="chevron-right" size={14} color="#A0A4AC" />}
    </Pressable>
  );

  if (!roots.length) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
        <View style={styles.center}>
          <Text style={styles.emptyText}>No storage roots configured.</Text>
        </View>
      </SafeAreaView>
    );
  }
  const emptyLabel = searchQuery.trim()
    ? searching
      ? 'Searching...'
      : 'No matches found.'
    : 'No files found in this folder.';

  const loadMoreSearch = async () => {
    if (!searchHasMore || searchLoadingMore || searching || !isSearchMode) {
      return;
    }
    await runSearch({ reset: false });
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: palette.text }]}>Files</Text>
          <Text style={styles.pathLabel} numberOfLines={1}>
            {path || '/'}
          </Text>
        </View>
        {path ? (
          <Pressable style={styles.upButton} onPress={goUp}>
            <FontAwesome name="arrow-left" size={14} color={palette.tint} />
            <Text style={[styles.upLabel, { color: palette.tint }]}>Up</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.searchRow}>
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search files"
          placeholderTextColor={metaColor}
          style={[
            styles.searchInput,
            { backgroundColor: inputBackground, borderColor: inputBorder, color: palette.text },
          ]}
        />
      </View>
      <View style={styles.rootRow}>
        {roots.map((root) => (
          <Pressable
            key={root.id}
            onPress={() => handleRootSelect(root.id)}
            style={[
              styles.rootChip,
              { backgroundColor: chipBackground },
              root.id === activeRoot?.id && { backgroundColor: palette.tint },
            ]}
          >
            <Text
              style={[
                styles.rootLabel,
                { color: root.id === activeRoot?.id ? '#fff' : palette.text },
              ]}
            >
              {root.name || root.id}
            </Text>
          </Pressable>
        ))}
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
          onEndReached={isSearchMode ? loadMoreSearch : undefined}
          onEndReachedThreshold={isSearchMode ? 0.4 : undefined}
          ListEmptyComponent={
            <Text style={styles.emptyText}>{emptyLabel}</Text>
          }
        />
      )}
      <PhotoViewerModal
        visible={mediaIndex !== null}
        items={mediaItems}
        activeIndex={mediaIndex ?? 0}
        onClose={() => setMediaIndex(null)}
        authHeaders={authHeaders}
      />
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  pathLabel: {
    marginTop: 4,
    color: '#7D8390',
    maxWidth: 220,
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
  upButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  upLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  rootRow: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: 8,
  },
  rootChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#E9EDF5',
  },
  rootLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  list: {
    paddingHorizontal: 12,
    paddingBottom: 90,
  },
  listEmpty: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    marginBottom: 10,
  },
  rowIcon: {
    width: 32,
    alignItems: 'center',
  },
  rowText: {
    flex: 1,
    marginLeft: 6,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  rowMeta: {
    fontSize: 12,
    color: '#7D8390',
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
