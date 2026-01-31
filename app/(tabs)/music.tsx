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
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faCompactDisc } from '@fortawesome/free-solid-svg-icons';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { buildUrl, useApi } from '@/lib/api';
import { useServer } from '@/lib/server';
import { usePlayer } from '@/lib/player';
import MiniPlayer from '@/components/MiniPlayer';
import PlayerModal from '@/components/PlayerModal';

const PAGE_LIMIT = 60;

type TrackEntry = {
  rootId: string;
  path: string;
  name: string;
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  albumKey?: string | null;
  duration?: number | null;
};

type AlbumItem = {
  albumKey: string | null;
  album: string;
  artist: string;
  tracks: number;
  latest: number;
  coverKey: string | null;
};

type ArtistItem = {
  artist: string;
  tracks: number;
  albums: number;
  latest: number;
};

type MusicView = 'albums' | 'artists' | 'tracks';

function formatDuration(value?: number | null) {
  if (!value && value !== 0) {
    return '--:--';
  }
  const totalSeconds = Math.round(value);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export default function MusicScreen() {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const { apiJson, authHeaders } = useApi();
  const { playTrack, setPlayerOpen } = usePlayer();
  const { roots, refresh } = useServer();
  const [view, setView] = useState<MusicView>('albums');
  const [albums, setAlbums] = useState<AlbumItem[]>([]);
  const [albumsOffset, setAlbumsOffset] = useState(0);
  const [albumsHasMore, setAlbumsHasMore] = useState(true);
  const [albumsLoadingMore, setAlbumsLoadingMore] = useState(false);
  const [artists, setArtists] = useState<ArtistItem[]>([]);
  const [artistsOffset, setArtistsOffset] = useState(0);
  const [artistsHasMore, setArtistsHasMore] = useState(true);
  const [artistsLoadingMore, setArtistsLoadingMore] = useState(false);
  const [tracks, setTracks] = useState<TrackEntry[]>([]);
  const [tracksOffset, setTracksOffset] = useState(0);
  const [tracksHasMore, setTracksHasMore] = useState(true);
  const [tracksLoadingMore, setTracksLoadingMore] = useState(false);
  const [trackSearchResults, setTrackSearchResults] = useState<TrackEntry[]>([]);
  const [trackSearchOffset, setTrackSearchOffset] = useState(0);
  const [trackSearchHasMore, setTrackSearchHasMore] = useState(true);
  const [trackSearching, setTrackSearching] = useState(false);
  const [trackSearchLoadingMore, setTrackSearchLoadingMore] = useState(false);
  const [detailTracks, setDetailTracks] = useState<TrackEntry[]>([]);
  const [albumDetail, setAlbumDetail] = useState<AlbumItem | null>(null);
  const [artistDetail, setArtistDetail] = useState<ArtistItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const rootId = useMemo(() => {
    if (!roots.length) {
      return '';
    }
    return roots.length > 1 ? '__all__' : roots[0].id;
  }, [roots]);

  const isDetail = Boolean(albumDetail || artistDetail);

  const loadAlbums = async ({ reset = true } = {}) => {
    if (!rootId) {
      return;
    }
    const query = searchQuery.trim();
    if (reset) {
      setLoading(true);
      setAlbumsOffset(0);
      setAlbumsHasMore(true);
    } else {
      setAlbumsLoadingMore(true);
    }
    setError('');
    const pageOffset = reset ? 0 : albumsOffset;
    const url = buildUrl('/api/music/albums', {
      root: rootId,
      limit: PAGE_LIMIT,
      offset: pageOffset,
      q: query || undefined,
    });
    const result = await apiJson(url);
    if (!result.ok) {
      setError(result.error?.message || 'Failed to load albums');
      if (reset) {
        setAlbums([]);
        setAlbumsOffset(0);
        setAlbumsHasMore(false);
      }
      setLoading(false);
      setAlbumsLoadingMore(false);
      return;
    }
    const newItems = Array.isArray(result.data?.items) ? result.data.items : [];
    setAlbums((prev) => (reset ? newItems : [...prev, ...newItems]));
    setAlbumsOffset(pageOffset + newItems.length);
    setAlbumsHasMore(newItems.length === PAGE_LIMIT);
    setLoading(false);
    setAlbumsLoadingMore(false);
  };

  const loadArtists = async ({ reset = true } = {}) => {
    if (!rootId) {
      return;
    }
    const query = searchQuery.trim();
    if (reset) {
      setLoading(true);
      setArtistsOffset(0);
      setArtistsHasMore(true);
    } else {
      setArtistsLoadingMore(true);
    }
    setError('');
    const pageOffset = reset ? 0 : artistsOffset;
    const url = buildUrl('/api/music/artists', {
      root: rootId,
      limit: PAGE_LIMIT,
      offset: pageOffset,
      q: query || undefined,
    });
    const result = await apiJson(url);
    if (!result.ok) {
      setError(result.error?.message || 'Failed to load artists');
      if (reset) {
        setArtists([]);
        setArtistsOffset(0);
        setArtistsHasMore(false);
      }
      setLoading(false);
      setArtistsLoadingMore(false);
      return;
    }
    const newItems = Array.isArray(result.data?.items) ? result.data.items : [];
    setArtists((prev) => (reset ? newItems : [...prev, ...newItems]));
    setArtistsOffset(pageOffset + newItems.length);
    setArtistsHasMore(newItems.length === PAGE_LIMIT);
    setLoading(false);
    setArtistsLoadingMore(false);
  };

  const loadTracks = async ({ reset = true } = {}) => {
    if (!rootId) {
      return;
    }
    if (reset) {
      setLoading(true);
      setTracksOffset(0);
      setTracksHasMore(true);
    } else {
      setTracksLoadingMore(true);
    }
    setError('');
    const pageOffset = reset ? 0 : tracksOffset;
    const url = buildUrl('/api/media', {
      root: rootId,
      type: 'music',
      limit: PAGE_LIMIT,
      offset: pageOffset,
    });
    const result = await apiJson(url);
    if (!result.ok) {
      setError(result.error?.message || 'Failed to load music');
      if (reset) {
        setTracks([]);
        setTracksOffset(0);
        setTracksHasMore(false);
      }
      setLoading(false);
      setTracksLoadingMore(false);
      return;
    }
    const newItems = Array.isArray(result.data?.items) ? result.data.items : [];
    setTracks((prev) => (reset ? newItems : [...prev, ...newItems]));
    setTracksOffset(pageOffset + newItems.length);
    setTracksHasMore(newItems.length === PAGE_LIMIT);
    setLoading(false);
    setTracksLoadingMore(false);
  };

  const runTrackSearch = async ({ reset = true } = {}) => {
    if (!rootId) {
      return;
    }
    const query = searchQuery.trim();
    if (!query) {
      setTrackSearchResults([]);
      setTrackSearchOffset(0);
      setTrackSearchHasMore(true);
      setTrackSearching(false);
      return;
    }
    if (reset) {
      setTrackSearching(true);
      setTrackSearchOffset(0);
      setTrackSearchHasMore(true);
    } else {
      setTrackSearchLoadingMore(true);
    }
    setError('');
    const pageOffset = reset ? 0 : trackSearchOffset;
    const url = buildUrl('/api/search', {
      root: rootId,
      q: query,
      type: 'music',
      limit: PAGE_LIMIT,
      offset: pageOffset,
    });
    const result = await apiJson(url);
    if (!result.ok) {
      setError(result.error?.message || 'Failed to search');
      if (reset) {
        setTrackSearchResults([]);
        setTrackSearchOffset(0);
        setTrackSearchHasMore(false);
      }
      setTrackSearching(false);
      setTrackSearchLoadingMore(false);
      return;
    }
    const newItems = Array.isArray(result.data?.items) ? result.data.items : [];
    setTrackSearchResults((prev) => (reset ? newItems : [...prev, ...newItems]));
    setTrackSearchOffset(pageOffset + newItems.length);
    setTrackSearchHasMore(newItems.length === PAGE_LIMIT);
    setTrackSearching(false);
    setTrackSearchLoadingMore(false);
  };

  const loadAlbumTracks = async (album: AlbumItem) => {
    if (!rootId || !album.albumKey) {
      return;
    }
    setDetailLoading(true);
    setError('');
    const url = buildUrl('/api/music/album', {
      root: rootId,
      key: album.albumKey,
    });
    const result = await apiJson(url);
    if (!result.ok) {
      setError(result.error?.message || 'Failed to load album');
      setDetailTracks([]);
      setDetailLoading(false);
      return;
    }
    setDetailTracks(Array.isArray(result.data?.items) ? result.data.items : []);
    setDetailLoading(false);
  };

  const loadArtistTracks = async (artist: ArtistItem) => {
    if (!rootId || !artist.artist) {
      return;
    }
    setDetailLoading(true);
    setError('');
    const url = buildUrl('/api/music/artist', {
      root: rootId,
      artist: artist.artist,
    });
    const result = await apiJson(url);
    if (!result.ok) {
      setError(result.error?.message || 'Failed to load artist');
      setDetailTracks([]);
      setDetailLoading(false);
      return;
    }
    setDetailTracks(Array.isArray(result.data?.items) ? result.data.items : []);
    setDetailLoading(false);
  };

  useEffect(() => {
    if (!rootId) {
      return;
    }
    setView('albums');
    setAlbumDetail(null);
    setArtistDetail(null);
    setDetailTracks([]);
    setSearchQuery('');
    setTrackSearchResults([]);
    setTrackSearchOffset(0);
    setTrackSearchHasMore(true);
    loadAlbums({ reset: true });
  }, [rootId]);

  useEffect(() => {
    if (!rootId || isDetail) {
      return;
    }
    if (view === 'albums') {
      loadAlbums({ reset: true });
    } else if (view === 'artists') {
      loadArtists({ reset: true });
    } else if (!searchQuery.trim()) {
      loadTracks({ reset: true });
    }
  }, [view, rootId, isDetail]);

  useEffect(() => {
    if (!rootId || isDetail) {
      return;
    }
    const query = searchQuery.trim();
    if (!query) {
      if (view === 'tracks') {
        setTrackSearchResults([]);
        setTrackSearchOffset(0);
        setTrackSearchHasMore(true);
        loadTracks({ reset: true });
      } else if (view === 'albums') {
        loadAlbums({ reset: true });
      } else if (view === 'artists') {
        loadArtists({ reset: true });
      }
      return;
    }
    if (view === 'tracks') {
      runTrackSearch({ reset: true });
    } else if (view === 'albums') {
      loadAlbums({ reset: true });
    } else if (view === 'artists') {
      loadArtists({ reset: true });
    }
  }, [searchQuery, rootId, view, isDetail]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    if (isDetail && albumDetail) {
      await loadAlbumTracks(albumDetail);
    } else if (isDetail && artistDetail) {
      await loadArtistTracks(artistDetail);
    } else if (view === 'albums') {
      await loadAlbums({ reset: true });
    } else if (view === 'artists') {
      await loadArtists({ reset: true });
    } else {
      if (searchQuery.trim()) {
        await runTrackSearch({ reset: true });
      } else {
        await loadTracks({ reset: true });
      }
    }
    setRefreshing(false);
  };

  const loadMoreAlbums = async () => {
    if (loading || albumsLoadingMore || !albumsHasMore || isDetail) {
      return;
    }
    await loadAlbums({ reset: false });
  };

  const loadMoreArtists = async () => {
    if (loading || artistsLoadingMore || !artistsHasMore || isDetail) {
      return;
    }
    await loadArtists({ reset: false });
  };

  const loadMoreTracks = async () => {
    if (loading || tracksLoadingMore || !tracksHasMore || isDetail || isTrackSearch) {
      return;
    }
    await loadTracks({ reset: false });
  };

  const loadMoreTrackSearch = async () => {
    if (trackSearching || trackSearchLoadingMore || !trackSearchHasMore || !isTrackSearch) {
      return;
    }
    await runTrackSearch({ reset: false });
  };

  const cardBackground = colorScheme === 'dark' ? '#171A20' : '#FFFFFF';
  const metaColor = colorScheme === 'dark' ? '#9AA3B2' : '#7D8390';
  const subtitleColor = colorScheme === 'dark' ? '#9AA3B2' : '#7D8390';
  const inputBackground = colorScheme === 'dark' ? '#12161C' : '#FFFFFF';
  const inputBorder = colorScheme === 'dark' ? '#252A33' : '#E3E7EF';

  const query = searchQuery.trim().toLowerCase();
  const isTrackSearch = view === 'tracks' && !isDetail && Boolean(searchQuery.trim());
  const filteredAlbums = useMemo(() => {
    if (!query) {
      return albums;
    }
    return albums.filter((item) => {
      return (
        item.album.toLowerCase().includes(query) ||
        item.artist.toLowerCase().includes(query)
      );
    });
  }, [albums, query]);

  const filteredArtists = useMemo(() => {
    if (!query) {
      return artists;
    }
    return artists.filter((item) => item.artist.toLowerCase().includes(query));
  }, [artists, query]);

  const filteredTracks = useMemo(() => {
    if (!isTrackSearch) {
      return tracks;
    }
    return trackSearchResults;
  }, [tracks, trackSearchResults, isTrackSearch]);

  const filteredDetailTracks = useMemo(() => {
    if (!query) {
      return detailTracks;
    }
    return detailTracks.filter((item) => {
      const title = item.title || item.name || '';
      const artist = item.artist || '';
      const album = item.album || '';
      return (
        title.toLowerCase().includes(query) ||
        artist.toLowerCase().includes(query) ||
        album.toLowerCase().includes(query)
      );
    });
  }, [detailTracks, query]);

  if (!rootId) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
        <View style={styles.center}>
          <Text style={styles.emptyText}>No storage roots configured.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const searchPlaceholder = isDetail
    ? 'Search tracks'
    : view === 'albums'
    ? 'Search albums'
    : view === 'artists'
    ? 'Search artists'
    : 'Search tracks';

  const renderTrackRow = ({ item }: { item: TrackEntry }) => (
    <Pressable
      style={[styles.row, { backgroundColor: cardBackground }]}
      onPress={() => {
        const listItems = isDetail ? filteredDetailTracks : filteredTracks;
        playTrack(item, listItems.length ? listItems : undefined);
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
      <Text style={[styles.duration, { color: metaColor }]}>
        {formatDuration(item.duration)}
      </Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
      <View style={styles.header}>
        {isDetail ? (
          <Pressable
            style={styles.backButton}
            onPress={() => {
              setAlbumDetail(null);
              setArtistDetail(null);
              setDetailTracks([]);
            }}
          >
            <FontAwesome name="chevron-left" size={16} color={palette.tint} />
            <Text style={[styles.backLabel, { color: palette.tint }]}>Back</Text>
          </Pressable>
        ) : null}
        <View>
          <Text style={[styles.headerTitle, { color: palette.text }]}>Music</Text>
          <Text style={[styles.headerSubtitle, { color: subtitleColor }]}>
            {isDetail
              ? albumDetail
                ? albumDetail.album
                : artistDetail?.artist || 'Tracks'
              : view === 'albums'
              ? 'Albums'
              : view === 'artists'
              ? 'Artists'
              : 'Tracks'}
          </Text>
        </View>
      </View>

      {!isDetail ? (
        <View style={styles.segmented}>
          {([
            { key: 'albums', label: 'Albums' },
            { key: 'artists', label: 'Artists' },
            { key: 'tracks', label: 'Tracks' },
          ] as { key: MusicView; label: string }[]).map((tab) => {
            const active = view === tab.key;
            return (
              <Pressable
                key={tab.key}
                style={[
                  styles.segmentButton,
                  { backgroundColor: active ? palette.tint : 'transparent' },
                ]}
                onPress={() => setView(tab.key)}
              >
                <Text style={[styles.segmentLabel, { color: active ? '#fff' : palette.text }]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={styles.searchRow}>
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={searchPlaceholder}
          placeholderTextColor={metaColor}
          style={[
            styles.searchInput,
            { backgroundColor: inputBackground, borderColor: inputBorder, color: palette.text },
          ]}
        />
      </View>

      {loading || detailLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : isDetail ? (
        <FlatList
          data={filteredDetailTracks}
          keyExtractor={(item, index) =>
            `${item.rootId || 'root'}:${item.path || item.name || 'track'}:${index}`
          }
          renderItem={renderTrackRow}
          contentContainerStyle={filteredDetailTracks.length ? styles.list : styles.listEmpty}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {searchQuery.trim() ? 'No matches found.' : 'No tracks found.'}
            </Text>
          }
        />
      ) : view === 'albums' ? (
        <FlatList
          key="albums-grid-2"
          data={filteredAlbums}
          keyExtractor={(item, index) => `${item.albumKey || item.album || 'album'}:${index}`}
          numColumns={2}
          columnWrapperStyle={styles.albumRow}
          contentContainerStyle={filteredAlbums.length ? styles.albumGrid : styles.listEmpty}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          onEndReached={loadMoreAlbums}
          onEndReachedThreshold={0.4}
          renderItem={({ item }) => (
            <Pressable
              style={[styles.albumCard, { backgroundColor: cardBackground }]}
              onPress={() => {
                setAlbumDetail(item);
                setArtistDetail(null);
                setDetailTracks([]);
                loadAlbumTracks(item);
              }}
            >
              {item.coverKey ? (
                <Image
                  source={{
                    uri: buildUrl('/api/album-art', { root: rootId, key: item.coverKey }),
                    headers: authHeaders,
                  }}
                  style={styles.albumArt}
                />
              ) : (
                <View style={[styles.albumArt, styles.albumArtFallback]}>
                  <FontAwesomeIcon icon={faCompactDisc} size={32} color="#9AA3B2" />
                </View>
              )}
              <Text style={[styles.albumTitle, { color: palette.text }]} numberOfLines={1}>
                {item.album}
              </Text>
              <Text style={[styles.albumMeta, { color: metaColor }]} numberOfLines={1}>
                {item.artist} · {item.tracks} tracks
              </Text>
            </Pressable>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {searchQuery.trim() ? 'No matches found.' : 'No albums yet.'}
            </Text>
          }
        />
      ) : view === 'artists' ? (
        <FlatList
          data={filteredArtists}
          keyExtractor={(item, index) => `${item.artist || 'artist'}:${index}`}
          renderItem={({ item }) => (
            <Pressable
              style={[styles.row, { backgroundColor: cardBackground }]}
              onPress={() => {
                setArtistDetail(item);
                setAlbumDetail(null);
                setDetailTracks([]);
                loadArtistTracks(item);
              }}
            >
              <View style={styles.icon}>
                <FontAwesome name="user" size={18} color={palette.tint} />
              </View>
              <View style={styles.rowText}>
                <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>
                  {item.artist}
                </Text>
                <Text style={[styles.subtitle, { color: metaColor }]} numberOfLines={1}>
                  {item.albums} albums · {item.tracks} tracks
                </Text>
              </View>
            </Pressable>
          )}
          contentContainerStyle={filteredArtists.length ? styles.list : styles.listEmpty}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          onEndReached={loadMoreArtists}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {searchQuery.trim() ? 'No matches found.' : 'No artists yet.'}
            </Text>
          }
        />
      ) : (
        <FlatList
          data={filteredTracks}
          keyExtractor={(item, index) =>
            `${item.rootId || 'root'}:${item.path || item.name || 'track'}:${index}`
          }
          renderItem={renderTrackRow}
          contentContainerStyle={filteredTracks.length ? styles.list : styles.listEmpty}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          onEndReached={() => {
            if (isTrackSearch) {
              loadMoreTrackSearch();
            } else {
              loadMoreTracks();
            }
          }}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {searchQuery.trim() ? 'No matches found.' : 'No tracks yet.'}
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
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  backLabel: {
    marginLeft: 6,
    fontSize: 14,
    fontWeight: '600',
  },
  segmented: {
    flexDirection: 'row',
    marginHorizontal: 16,
    padding: 4,
    borderRadius: 16,
    backgroundColor: '#0B0F14',
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: 'center',
  },
  segmentLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  searchRow: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    paddingTop: 8,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 120,
  },
  listEmpty: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 120,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    marginBottom: 12,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    marginRight: 12,
  },
  rowText: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
  },
  duration: {
    fontSize: 12,
  },
  albumGrid: {
    paddingHorizontal: 12,
    paddingBottom: 120,
  },
  albumRow: {
    gap: 12,
    marginBottom: 12,
  },
  albumCard: {
    flex: 1,
    borderRadius: 16,
    padding: 12,
  },
  albumArt: {
    width: '100%',
    height: 120,
    borderRadius: 12,
    marginBottom: 8,
    resizeMode: 'cover',
  },
  albumArtFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B0F14',
  },
  albumTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  albumMeta: {
    marginTop: 2,
    fontSize: 12,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    color: '#EF4444',
  },
  emptyText: {
    color: '#9AA3B2',
  },
});
