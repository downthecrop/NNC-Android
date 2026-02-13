import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import * as MediaLibrary from 'expo-media-library';
import { Directory as FsDirectory, File as FsFile } from 'expo-file-system';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { API_BASE_URL } from '@/lib/config';
import { useAuth } from '@/lib/auth';
import { useServer } from '@/lib/server';
import { buildUrl, useApi } from '@/lib/api';
import { formatBytes, formatDate } from '@/lib/format';

const CAMERA_SYNC_ROOT_KEY = 'nnc_camera_sync_root';
const CAMERA_SYNC_PATH_KEY = 'nnc_camera_sync_path';
const CAMERA_SYNC_INCLUDE_VIDEOS_KEY = 'nnc_camera_sync_include_videos';
const CAMERA_SYNC_SOURCE_KEY = 'nnc_camera_sync_source';
const CAMERA_SYNC_FOLDER_URI_KEY = 'nnc_camera_sync_folder_uri';
const CAMERA_SYNC_MIRROR_KEY = 'nnc_camera_sync_mirror';
const CAMERA_SYNC_CONFLICT_POLICY_KEY = 'nnc_camera_sync_conflict_policy';
const SCAN_PAGE_SIZE = 150;
const MIN_CHUNK_BYTES = 256 * 1024;
const MAX_CHUNK_BYTES = 2 * 1024 * 1024;
const DELETE_BATCH_SIZE = 100;
const LIST_PAGE_SIZE = 200;
const STATUS_BATCH_SIZE = 60;
const MAX_RENAME_ATTEMPTS = 50;

type SyncStage = 'idle' | 'planning' | 'uploading' | 'mirroring' | 'done' | 'error' | 'cancelled';
type SyncSource = 'camera' | 'folder';
type SyncConflictPolicy = 'skip' | 'overwrite' | 'rename';

type SyncProgress = {
  stage: SyncStage;
  discovered: number;
  planned: number;
  skipped: number;
  failed: number;
  uploaded: number;
  plannedBytes: number;
  uploadedBytes: number;
  remoteDeleted: number;
  remoteDeleteFailed: number;
  currentFileName: string;
  currentFileBytes: number;
  currentFileUploaded: number;
  message: string;
  error: string;
  startedAt: number | null;
  finishedAt: number | null;
};

type UploadCandidate = {
  kind: 'camera' | 'folder';
  displayName: string;
  localUri: string;
  size: number;
  initialOffset: number;
  remoteTarget: string;
  monthBucket: string;
  capturedAtIso: string;
  overwrite: boolean;
};

type LocalFolderFile = {
  localUri: string;
  relativePath: string;
  displayName: string;
  size: number;
};

function normalizeUploadPath(value: string) {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

function joinUploadPath(...parts: string[]) {
  const segments: string[] = [];
  for (const part of parts) {
    const normalized = normalizeUploadPath(part);
    if (!normalized) {
      continue;
    }
    for (const segment of normalized.split('/')) {
      if (!segment || segment === '.') {
        continue;
      }
      segments.push(segment);
    }
  }
  return segments.join('/');
}

function normalizeTimestamp(value: number | null | undefined) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return Date.now();
  }
  return numeric < 1e12 ? numeric * 1000 : numeric;
}

function monthBucketFromTime(timestamp: number) {
  const value = normalizeTimestamp(timestamp);
  const date = new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${month}`;
}

function sanitizeFileName(name: string, fallbackId: string) {
  const normalized = String(name || '').trim().replace(/[\\/:*?"<>|]+/g, '_');
  if (normalized) {
    return normalized;
  }
  return `${fallbackId}.jpg`;
}

function splitNameAndExt(fileName: string) {
  const raw = String(fileName || '');
  const lastDot = raw.lastIndexOf('.');
  if (lastDot <= 0) {
    return { name: raw, ext: '' };
  }
  return {
    name: raw.slice(0, lastDot),
    ext: raw.slice(lastDot),
  };
}

function addConflictSuffix(fileName: string, attempt: number) {
  if (!Number.isFinite(attempt) || attempt <= 0) {
    return fileName;
  }
  const { name, ext } = splitNameAndExt(fileName);
  return `${name} (${attempt})${ext}`;
}

function renameRemoteTarget(remoteTarget: string, attempt: number) {
  const normalized = normalizeUploadPath(remoteTarget);
  if (!normalized) {
    return normalized;
  }
  const parts = normalized.split('/');
  const fileName = parts.pop() || '';
  const nextName = addConflictSuffix(fileName, attempt);
  return parts.length ? `${parts.join('/')}/${nextName}` : nextName;
}

function renameCandidateForAttempt(candidate: UploadCandidate, attempt: number): UploadCandidate {
  if (attempt <= 0) {
    return candidate;
  }
  if (candidate.kind === 'camera') {
    const nextName = addConflictSuffix(candidate.displayName, attempt);
    return {
      ...candidate,
      displayName: nextName,
      overwrite: false,
    };
  }
  const nextTarget = renameRemoteTarget(candidate.remoteTarget, attempt);
  return {
    ...candidate,
    remoteTarget: nextTarget,
    displayName: nextTarget,
    overwrite: false,
  };
}

function toErrorMessage(error: any, fallback: string) {
  const message = error?.message;
  if (typeof message === 'string' && message.trim()) {
    return message.trim();
  }
  return fallback;
}

function syncProgressBase(): SyncProgress {
  return {
    stage: 'idle',
    discovered: 0,
    planned: 0,
    skipped: 0,
    failed: 0,
    uploaded: 0,
    plannedBytes: 0,
    uploadedBytes: 0,
    remoteDeleted: 0,
    remoteDeleteFailed: 0,
    currentFileName: '',
    currentFileBytes: 0,
    currentFileUploaded: 0,
    message: '',
    error: '',
    startedAt: null,
    finishedAt: null,
  };
}

async function postUploadChunk({
  token,
  url,
  bytes,
}: {
  token: string;
  url: string;
  bytes: Uint8Array;
}) {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/octet-stream',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const body = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body,
  });

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (payload?.ok) {
    return { ok: true as const, data: payload.data };
  }

  return {
    ok: false as const,
    status: response.status,
    error: payload?.error || { message: 'Chunk upload failed' },
  };
}

function makeStatusUrl({
  rootId,
  uploadBasePath,
  candidate,
  overwrite,
}: {
  rootId: string;
  uploadBasePath: string;
  candidate: UploadCandidate;
  overwrite: boolean;
}) {
  if (candidate.kind === 'camera') {
    return buildUrl('/api/upload/status', {
      root: rootId,
      path: uploadBasePath,
      file: candidate.displayName,
      size: candidate.size,
      overwrite: overwrite ? 1 : 0,
      camera: 1,
      cameraMonth: candidate.monthBucket,
      capturedAt: candidate.capturedAtIso,
    });
  }
  return buildUrl('/api/upload/status', {
    root: rootId,
    target: candidate.remoteTarget,
    size: candidate.size,
    overwrite: overwrite ? 1 : 0,
  });
}

function makeChunkUrl({
  rootId,
  uploadBasePath,
  candidate,
  offset,
  overwrite,
}: {
  rootId: string;
  uploadBasePath: string;
  candidate: UploadCandidate;
  offset: number;
  overwrite: boolean;
}) {
  if (candidate.kind === 'camera') {
    return buildUrl('/api/upload/chunk', {
      root: rootId,
      path: uploadBasePath,
      file: candidate.displayName,
      size: candidate.size,
      offset,
      overwrite: overwrite ? 1 : 0,
      camera: 1,
      cameraMonth: candidate.monthBucket,
      capturedAt: candidate.capturedAtIso,
    });
  }
  return buildUrl('/api/upload/chunk', {
    root: rootId,
    target: candidate.remoteTarget,
    size: candidate.size,
    offset,
    overwrite: overwrite ? 1 : 0,
  });
}

function buildStatusPayload({
  uploadBasePath,
  candidate,
  overwrite,
}: {
  uploadBasePath: string;
  candidate: UploadCandidate;
  overwrite: boolean;
}) {
  if (candidate.kind === 'camera') {
    return {
      path: uploadBasePath,
      file: candidate.displayName,
      size: candidate.size,
      overwrite: overwrite ? 1 : 0,
      camera: 1,
      cameraMonth: candidate.monthBucket,
      capturedAt: candidate.capturedAtIso,
    };
  }
  return {
    target: candidate.remoteTarget,
    size: candidate.size,
    overwrite: overwrite ? 1 : 0,
  };
}

function normalizeBatchStatusItems(rawItems: any, expected: number) {
  const byIndex: Array<any | null> = Array.from({ length: expected }, () => null);
  if (!Array.isArray(rawItems)) {
    return byIndex;
  }
  for (const entry of rawItems) {
    const index = Number(entry?.index);
    if (!Number.isInteger(index) || index < 0 || index >= expected) {
      continue;
    }
    byIndex[index] = entry;
  }
  return byIndex;
}

function buildFolderCandidates({
  files,
  uploadBasePath,
}: {
  files: LocalFolderFile[];
  uploadBasePath: string;
}) {
  return files.map((file) => {
    const remoteTarget = joinUploadPath(uploadBasePath, file.relativePath);
    return {
      kind: 'folder' as const,
      displayName: file.relativePath,
      localUri: file.localUri,
      size: file.size,
      initialOffset: 0,
      remoteTarget,
      monthBucket: '',
      capturedAtIso: '',
      overwrite: false,
    };
  });
}

function safeCloseHandle(handle: { close: () => void } | null) {
  if (!handle) {
    return;
  }
  try {
    handle.close();
  } catch {
    // no-op
  }
}

async function collectLocalFolderFiles(rootUri: string) {
  const root = new FsDirectory(rootUri);
  const stack: Array<{ dir: FsDirectory; relPath: string }> = [{ dir: root, relPath: '' }];
  const files: LocalFolderFile[] = [];
  let discovered = 0;
  let failed = 0;

  while (stack.length) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    let entries: Array<FsDirectory | FsFile>;
    try {
      entries = current.dir.list() as Array<FsDirectory | FsFile>;
    } catch {
      failed += 1;
      continue;
    }

    for (const entry of entries) {
      if (entry instanceof FsDirectory) {
        const nextRel = joinUploadPath(current.relPath, entry.name || '');
        stack.push({ dir: entry, relPath: nextRel });
        continue;
      }

      if (!(entry instanceof FsFile)) {
        continue;
      }

      discovered += 1;
      const relativePath = joinUploadPath(current.relPath, entry.name || '');
      const size = Number(entry.size || 0);
      if (!relativePath || !Number.isFinite(size) || size < 0) {
        failed += 1;
        continue;
      }

      files.push({
        localUri: entry.uri,
        relativePath,
        displayName: relativePath,
        size,
      });
    }
  }

  return { files, discovered, failed };
}

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const { signOut, token } = useAuth();
  const { info, status, roots, refresh } = useServer();
  const { apiJson } = useApi();

  const [syncRootId, setSyncRootId] = useState('');
  const [syncPath, setSyncPath] = useState('');
  const [includeVideos, setIncludeVideos] = useState(false);
  const [syncSource, setSyncSource] = useState<SyncSource>('camera');
  const [localFolderUri, setLocalFolderUri] = useState('');
  const [mirrorRemote, setMirrorRemote] = useState(false);
  const [conflictPolicy, setConflictPolicy] = useState<SyncConflictPolicy>('skip');
  const [syncRunning, setSyncRunning] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress>(syncProgressBase());
  const cancelRef = useRef(false);

  const cardBackground = colorScheme === 'dark' ? '#171A20' : '#FFFFFF';
  const metaColor = colorScheme === 'dark' ? '#9AA3B2' : '#7D8390';
  const inputBackground = colorScheme === 'dark' ? '#12161C' : '#FFFFFF';
  const inputBorder = colorScheme === 'dark' ? '#252A33' : '#E3E7EF';
  const chipBackground = colorScheme === 'dark' ? '#1F232B' : '#E9EDF5';

  const uploadEnabled = info?.capabilities?.upload?.enabled !== false;
  const chunkBytes = useMemo(() => {
    const serverChunk = Number(info?.capabilities?.upload?.chunkBytes || 0);
    if (!Number.isFinite(serverChunk) || serverChunk <= 0) {
      return MAX_CHUNK_BYTES;
    }
    return Math.max(MIN_CHUNK_BYTES, Math.min(MAX_CHUNK_BYTES, serverChunk));
  }, [info?.capabilities?.upload?.chunkBytes]);

  const uploadPathNormalized = useMemo(() => normalizeUploadPath(syncPath), [syncPath]);
  const selectedRoot = useMemo(
    () => roots.find((root) => root.id === syncRootId) || null,
    [roots, syncRootId]
  );

  const setSyncStage = (patch: Partial<SyncProgress>) => {
    setSyncProgress((prev) => ({
      ...prev,
      ...patch,
    }));
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [
        savedRoot,
        savedPath,
        savedIncludeVideos,
        savedSource,
        savedFolderUri,
        savedMirror,
        savedConflictPolicy,
      ] = await Promise.all([
        SecureStore.getItemAsync(CAMERA_SYNC_ROOT_KEY),
        SecureStore.getItemAsync(CAMERA_SYNC_PATH_KEY),
        SecureStore.getItemAsync(CAMERA_SYNC_INCLUDE_VIDEOS_KEY),
        SecureStore.getItemAsync(CAMERA_SYNC_SOURCE_KEY),
        SecureStore.getItemAsync(CAMERA_SYNC_FOLDER_URI_KEY),
        SecureStore.getItemAsync(CAMERA_SYNC_MIRROR_KEY),
        SecureStore.getItemAsync(CAMERA_SYNC_CONFLICT_POLICY_KEY),
      ]);

      if (!mounted) {
        return;
      }

      if (savedRoot) {
        setSyncRootId(savedRoot);
      }
      if (savedPath) {
        setSyncPath(savedPath);
      }
      if (savedIncludeVideos === '1') {
        setIncludeVideos(true);
      }
      if (savedSource === 'folder') {
        setSyncSource('folder');
      }
      if (savedFolderUri) {
        setLocalFolderUri(savedFolderUri);
      }
      if (savedMirror === '1') {
        setMirrorRemote(true);
      }
      if (
        savedConflictPolicy === 'skip' ||
        savedConflictPolicy === 'overwrite' ||
        savedConflictPolicy === 'rename'
      ) {
        setConflictPolicy(savedConflictPolicy);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!syncRootId && roots.length) {
      setSyncRootId(roots[0].id);
    }
  }, [roots, syncRootId]);

  useEffect(() => {
    if (!roots.length || !syncRootId) {
      return;
    }
    if (!roots.some((root) => root.id === syncRootId)) {
      const fallbackRoot = roots[0].id;
      setSyncRootId(fallbackRoot);
      SecureStore.setItemAsync(CAMERA_SYNC_ROOT_KEY, fallbackRoot).catch(() => {});
    }
  }, [roots, syncRootId]);

  const persistRoot = async (nextRoot: string) => {
    setSyncRootId(nextRoot);
    await SecureStore.setItemAsync(CAMERA_SYNC_ROOT_KEY, nextRoot);
  };

  const persistPath = async () => {
    await SecureStore.setItemAsync(CAMERA_SYNC_PATH_KEY, syncPath.trim());
  };

  const persistIncludeVideos = async (nextValue: boolean) => {
    setIncludeVideos(nextValue);
    await SecureStore.setItemAsync(CAMERA_SYNC_INCLUDE_VIDEOS_KEY, nextValue ? '1' : '0');
  };

  const persistSyncSource = async (nextValue: SyncSource) => {
    setSyncSource(nextValue);
    await SecureStore.setItemAsync(CAMERA_SYNC_SOURCE_KEY, nextValue);
  };

  const persistMirrorRemote = async (nextValue: boolean) => {
    setMirrorRemote(nextValue);
    await SecureStore.setItemAsync(CAMERA_SYNC_MIRROR_KEY, nextValue ? '1' : '0');
  };

  const persistConflictPolicy = async (nextValue: SyncConflictPolicy) => {
    setConflictPolicy(nextValue);
    await SecureStore.setItemAsync(CAMERA_SYNC_CONFLICT_POLICY_KEY, nextValue);
  };

  const pickSyncFolder = async () => {
    try {
      const selected = await FsDirectory.pickDirectoryAsync(localFolderUri || undefined);
      if (!selected?.uri) {
        return;
      }
      setLocalFolderUri(selected.uri);
      await SecureStore.setItemAsync(CAMERA_SYNC_FOLDER_URI_KEY, selected.uri);
    } catch (error: any) {
      const message = String(error?.message || '');
      if (message.toLowerCase().includes('cancel')) {
        return;
      }
      setSyncProgress((prev) => ({
        ...prev,
        stage: 'error',
        error: toErrorMessage(error, 'Failed to pick folder.'),
      }));
    }
  };

  const fetchUploadStatusBatch = async ({
    rootId,
    uploadBasePath,
    candidates,
    overwrite,
  }: {
    rootId: string;
    uploadBasePath: string;
    candidates: UploadCandidate[];
    overwrite: boolean;
  }) => {
    if (!candidates.length) {
      return [];
    }
    const batchResult = await apiJson('/api/upload/status/batch', {
      method: 'POST',
      body: {
        root: rootId,
        items: candidates.map((candidate) =>
          buildStatusPayload({
            uploadBasePath,
            candidate,
            overwrite,
          })
        ),
      },
    });
    if (!batchResult.ok) {
      throw new Error(batchResult.error?.message || 'Failed to check upload status');
    }
    return normalizeBatchStatusItems(batchResult.data?.items, candidates.length);
  };

  const fetchRemoteFilesForMirror = async (rootId: string, basePath: string) => {
    const remoteFiles = new Set<string>();
    const queue: string[] = [basePath || ''];

    while (queue.length && !cancelRef.current) {
      const currentPath = queue.pop() || '';
      let offset = 0;
      while (!cancelRef.current) {
        const listUrl = buildUrl('/api/list', {
          root: rootId,
          path: currentPath,
          limit: LIST_PAGE_SIZE,
          offset,
          includeTotal: false,
        });
        const listResult = await apiJson(listUrl);
        if (!listResult.ok) {
          throw new Error(listResult.error?.message || 'Failed to list remote files for mirror mode');
        }
        const items = Array.isArray(listResult.data?.items) ? listResult.data.items : [];
        for (const item of items) {
          if (!item?.path || !item?.rootId) {
            continue;
          }
          if (item.isDir) {
            queue.push(item.path);
          } else {
            remoteFiles.add(String(item.path));
          }
        }
        if (items.length < LIST_PAGE_SIZE) {
          break;
        }
        offset += items.length;
      }
    }

    return remoteFiles;
  };

  const runSync = async () => {
    if (syncRunning) {
      return;
    }
    if (!selectedRoot) {
      setSyncProgress({
        ...syncProgressBase(),
        stage: 'error',
        error: 'Choose a destination root before syncing.',
      });
      return;
    }
    if (!uploadEnabled) {
      setSyncProgress({
        ...syncProgressBase(),
        stage: 'error',
        error: 'Uploads are disabled on the server.',
      });
      return;
    }
    if (syncSource === 'folder' && !localFolderUri) {
      setSyncProgress({
        ...syncProgressBase(),
        stage: 'error',
        error: 'Pick a local folder to sync first.',
      });
      return;
    }
    const effectiveConflictPolicy: SyncConflictPolicy =
      syncSource === 'folder' && mirrorRemote && conflictPolicy === 'rename'
        ? 'overwrite'
        : conflictPolicy;
    const overwriteUploads = effectiveConflictPolicy === 'overwrite';

    cancelRef.current = false;
    setSyncRunning(true);
    setSyncProgress({
      ...syncProgressBase(),
      stage: 'planning',
      startedAt: Date.now(),
      message:
        syncSource === 'camera'
          ? 'Checking media library access...'
          : 'Scanning selected folder...',
    });

    try {
      const candidates: UploadCandidate[] = [];
      const localMirrorTargets = new Set<string>();
      let discovered = 0;
      let plannedBytes = 0;
      let skipped = 0;
      let failed = 0;

      const addReadyCandidate = (candidate: UploadCandidate, rawOffset: number, overwrite: boolean) => {
        const offset = Math.max(0, Math.min(Number(rawOffset || 0), candidate.size));
        candidate.initialOffset = offset;
        candidate.overwrite = overwrite;
        plannedBytes += Math.max(0, candidate.size - offset);
        candidates.push(candidate);
      };

      const resolveRenameCandidate = async (candidate: UploadCandidate) => {
        for (let attempt = 1; attempt <= MAX_RENAME_ATTEMPTS && !cancelRef.current; attempt += 1) {
          const renamedCandidate = renameCandidateForAttempt(candidate, attempt);
          const statusUrl = makeStatusUrl({
            rootId: selectedRoot.id,
            uploadBasePath: uploadPathNormalized,
            candidate: renamedCandidate,
            overwrite: false,
          });
          const statusResult = await apiJson(statusUrl);
          if (!statusResult.ok) {
            if (statusResult.error?.code === 'exists') {
              continue;
            }
            return { type: 'failed' as const };
          }
          const uploadStatus = String(statusResult.data?.status || 'ready');
          const offset = Math.max(0, Number(statusResult.data?.offset || 0));
          if (uploadStatus === 'complete' || offset >= renamedCandidate.size) {
            return { type: 'skipped' as const };
          }
          return { type: 'ready' as const, candidate: renamedCandidate, offset };
        }
        return { type: 'failed' as const };
      };

      const applyStatusBatch = async (batchCandidates: UploadCandidate[]) => {
        if (!batchCandidates.length) {
          return;
        }
        const statusItems = await fetchUploadStatusBatch({
          rootId: selectedRoot.id,
          uploadBasePath: uploadPathNormalized,
          candidates: batchCandidates,
          overwrite: overwriteUploads,
        });
        for (let index = 0; index < batchCandidates.length && !cancelRef.current; index += 1) {
          const candidate = batchCandidates[index];
          const statusItem = statusItems[index];
          if (!statusItem) {
            failed += 1;
            continue;
          }
          const uploadStatus = String(
            statusItem?.status || (statusItem?.ok ? 'ready' : statusItem?.error?.code || 'error')
          );
          const offset = Math.max(0, Number(statusItem?.offset || 0));

          if (uploadStatus === 'ready') {
            addReadyCandidate(candidate, offset, overwriteUploads);
            continue;
          }
          if (uploadStatus === 'complete' || offset >= candidate.size) {
            skipped += 1;
            continue;
          }
          if (uploadStatus === 'exists') {
            if (effectiveConflictPolicy === 'skip') {
              skipped += 1;
              continue;
            }
            if (effectiveConflictPolicy === 'rename') {
              const renamed = await resolveRenameCandidate(candidate);
              if (renamed.type === 'ready') {
                addReadyCandidate(renamed.candidate, renamed.offset, false);
              } else if (renamed.type === 'skipped') {
                skipped += 1;
              } else {
                failed += 1;
              }
              continue;
            }
            failed += 1;
            continue;
          }
          failed += 1;
        }
      };

      if (syncSource === 'camera') {
        const permission = await MediaLibrary.requestPermissionsAsync();
        if (!permission.granted) {
          setSyncProgress({
            ...syncProgressBase(),
            stage: 'error',
            error: 'Media library permission is required for camera sync.',
            finishedAt: Date.now(),
          });
          return;
        }

        const mediaTypes: MediaLibrary.MediaTypeValue[] = includeVideos
          ? [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video]
          : [MediaLibrary.MediaType.photo];

        let pageCursor: string | null = null;
        let hasNext = true;
        const pendingCandidates: UploadCandidate[] = [];

        while (hasNext && !cancelRef.current) {
          const page = await MediaLibrary.getAssetsAsync({
            first: SCAN_PAGE_SIZE,
            after: pageCursor || undefined,
            sortBy: [MediaLibrary.SortBy.creationTime],
            mediaType: mediaTypes,
          });

          hasNext = page.hasNextPage;
          pageCursor = page.endCursor;

          for (const asset of page.assets) {
            if (cancelRef.current) {
              break;
            }
            discovered += 1;
            if (discovered % 10 === 0) {
              setSyncStage({
                stage: 'planning',
                discovered,
                planned: candidates.length,
                skipped,
                failed,
                plannedBytes,
                message: `Planning uploads (${discovered} inspected)...`,
              });
            }

            let assetInfo: MediaLibrary.AssetInfo;
            try {
              assetInfo = await MediaLibrary.getAssetInfoAsync(asset.id);
            } catch {
              failed += 1;
              continue;
            }

            const localUri = assetInfo.localUri || assetInfo.uri || asset.uri;
            if (!localUri) {
              failed += 1;
              continue;
            }

            const localFile = new FsFile(localUri);
            const size = Number(localFile.size || 0);
            if (!Number.isFinite(size) || size < 0) {
              failed += 1;
              continue;
            }

            const createdAt = normalizeTimestamp(assetInfo.creationTime || asset.creationTime);
            const monthBucket = monthBucketFromTime(createdAt);
            const fileName = sanitizeFileName(assetInfo.filename || asset.filename, asset.id);
            const capturedAtIso = new Date(createdAt).toISOString();

            const candidate: UploadCandidate = {
              kind: 'camera',
              displayName: fileName,
              localUri,
              size,
              initialOffset: 0,
              remoteTarget: '',
              monthBucket,
              capturedAtIso,
              overwrite: false,
            };
            pendingCandidates.push(candidate);
            if (pendingCandidates.length >= STATUS_BATCH_SIZE) {
              const batch = pendingCandidates.splice(0, pendingCandidates.length);
              await applyStatusBatch(batch);
            }
          }
        }
        if (!cancelRef.current && pendingCandidates.length) {
          await applyStatusBatch(pendingCandidates.splice(0, pendingCandidates.length));
        }
      } else {
        const scanned = await collectLocalFolderFiles(localFolderUri);
        discovered = scanned.discovered;
        failed += scanned.failed;

        const folderCandidates = buildFolderCandidates({
          files: scanned.files,
          uploadBasePath: uploadPathNormalized,
        });
        const pendingCandidates: UploadCandidate[] = [];

        for (let index = 0; index < folderCandidates.length && !cancelRef.current; index += 1) {
          const candidate = folderCandidates[index];
          localMirrorTargets.add(candidate.remoteTarget);
          pendingCandidates.push(candidate);

          if ((index + 1) % 10 === 0) {
            setSyncStage({
              stage: 'planning',
              discovered,
              planned: candidates.length,
              skipped,
              failed,
              plannedBytes,
              message: `Planning folder sync (${index + 1}/${folderCandidates.length})...`,
            });
          }
          if (pendingCandidates.length >= STATUS_BATCH_SIZE) {
            const batch = pendingCandidates.splice(0, pendingCandidates.length);
            await applyStatusBatch(batch);
          }
        }
        if (!cancelRef.current && pendingCandidates.length) {
          await applyStatusBatch(pendingCandidates.splice(0, pendingCandidates.length));
        }
      }

      if (cancelRef.current) {
        setSyncProgress((prev) => ({
          ...prev,
          stage: 'cancelled',
          message: 'Sync cancelled.',
          finishedAt: Date.now(),
        }));
        return;
      }

      setSyncProgress((prev) => ({
        ...prev,
        stage: 'uploading',
        discovered,
        planned: candidates.length,
        skipped,
        failed,
        plannedBytes,
        uploadedBytes: 0,
        uploaded: 0,
        currentFileName: '',
        currentFileBytes: 0,
        currentFileUploaded: 0,
        message: candidates.length
          ? `Uploading ${candidates.length} file(s)...`
          : 'No new files to upload.',
      }));

      let uploaded = 0;
      let uploadedBytes = 0;

      for (const candidate of candidates) {
        if (cancelRef.current) {
          break;
        }

        let offset = Math.max(0, Math.min(candidate.initialOffset, candidate.size));
        let handle: ReturnType<FsFile['open']> | null = null;

        try {
          const localFile = new FsFile(candidate.localUri);
          handle = localFile.open();
          handle.offset = offset;

          setSyncStage({
            stage: 'uploading',
            currentFileName: candidate.displayName,
            currentFileBytes: candidate.size,
            currentFileUploaded: offset,
            uploaded,
            uploadedBytes,
          });

          while (offset < candidate.size && !cancelRef.current) {
            const nextChunkBytes = Math.min(chunkBytes, candidate.size - offset);
            const chunk = handle.readBytes(nextChunkBytes);
            if (!chunk?.length) {
              throw new Error('Failed to read file chunk');
            }

            const chunkUrl = makeChunkUrl({
              rootId: selectedRoot.id,
              uploadBasePath: uploadPathNormalized,
              candidate,
              offset,
              overwrite: candidate.overwrite,
            });

            const chunkResult = await postUploadChunk({ token, url: chunkUrl, bytes: chunk });
            if (!chunkResult.ok) {
              if (chunkResult.error?.code === 'offset_mismatch') {
                const statusUrl = makeStatusUrl({
                  rootId: selectedRoot.id,
                  uploadBasePath: uploadPathNormalized,
                  candidate,
                  overwrite: candidate.overwrite,
                });
                const statusResult = await apiJson(statusUrl);
                if (!statusResult.ok) {
                  throw new Error(statusResult.error?.message || 'Failed to recover upload offset');
                }
                const serverOffset = Math.max(0, Number(statusResult.data?.offset || 0));
                if (serverOffset <= offset) {
                  throw new Error('Upload offset mismatch could not be resolved');
                }
                const advanced = serverOffset - offset;
                offset = serverOffset;
                handle.offset = offset;
                uploadedBytes += advanced;
                setSyncStage({
                  uploadedBytes,
                  currentFileUploaded: offset,
                });
                continue;
              }
              throw new Error(chunkResult.error?.message || 'Chunk upload failed');
            }

            const nextOffset = Math.max(offset + chunk.length, Number(chunkResult.data?.offset || 0));
            const advanced = Math.max(0, nextOffset - offset);
            offset = nextOffset;
            handle.offset = offset;
            uploadedBytes += advanced;
            setSyncStage({
              uploadedBytes,
              currentFileUploaded: offset,
            });
          }

          if (offset >= candidate.size) {
            uploaded += 1;
            setSyncStage({
              uploaded,
              currentFileUploaded: candidate.size,
            });
          }
        } finally {
          safeCloseHandle(handle);
        }
      }

      let remoteDeleted = 0;
      let remoteDeleteFailed = 0;

      if (!cancelRef.current && syncSource === 'folder' && mirrorRemote) {
        setSyncStage({
          stage: 'mirroring',
          message: 'Mirror sync (prune): pruning remote files not in local folder...',
        });

        const remoteFiles = await fetchRemoteFilesForMirror(selectedRoot.id, uploadPathNormalized);

        const toDelete = Array.from(remoteFiles).filter((remotePath) => !localMirrorTargets.has(remotePath));
        for (let index = 0; index < toDelete.length && !cancelRef.current; index += DELETE_BATCH_SIZE) {
          const batch = toDelete.slice(index, index + DELETE_BATCH_SIZE);
          const deleteResult = await apiJson('/api/delete', {
            method: 'POST',
            body: {
              root: selectedRoot.id,
              paths: batch,
            },
          });
          if (deleteResult.ok) {
            remoteDeleted += batch.length;
          } else {
            remoteDeleteFailed += batch.length;
          }
          setSyncStage({
            remoteDeleted,
            remoteDeleteFailed,
            message: `Mirror sync (prune): pruning remote files (${Math.min(index + DELETE_BATCH_SIZE, toDelete.length)}/${toDelete.length})...`,
          });
        }
      }

      if (cancelRef.current) {
        setSyncProgress((prev) => ({
          ...prev,
          stage: 'cancelled',
          uploaded,
          uploadedBytes,
          remoteDeleted,
          remoteDeleteFailed,
          message: 'Sync cancelled.',
          finishedAt: Date.now(),
        }));
      } else {
        const mirrorSummary =
          syncSource === 'folder' && mirrorRemote
            ? ` Mirror sync (prune) removed ${remoteDeleted} file(s).`
            : '';
        setSyncProgress((prev) => ({
          ...prev,
          stage: 'done',
          uploaded,
          uploadedBytes,
          remoteDeleted,
          remoteDeleteFailed,
          currentFileName: '',
          currentFileBytes: 0,
          currentFileUploaded: 0,
          message: `Sync complete. Uploaded ${uploaded}/${candidates.length} file(s).${mirrorSummary}`,
          finishedAt: Date.now(),
        }));
      }

      await refresh();
    } catch (error: any) {
      setSyncProgress((prev) => ({
        ...prev,
        stage: 'error',
        error: toErrorMessage(error, 'Sync failed.'),
        finishedAt: Date.now(),
      }));
    } finally {
      setSyncRunning(false);
    }
  };

  const cancelSync = () => {
    cancelRef.current = true;
    setSyncStage({
      message: 'Stopping sync...',
    });
  };

  const overallPercent =
    syncProgress.plannedBytes > 0
      ? Math.max(0, Math.min(1, syncProgress.uploadedBytes / syncProgress.plannedBytes))
      : 0;
  const currentPercent =
    syncProgress.currentFileBytes > 0
      ? Math.max(0, Math.min(1, syncProgress.currentFileUploaded / syncProgress.currentFileBytes))
      : 0;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}> 
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={[styles.title, { color: palette.text }]}>Settings</Text>

        <View style={[styles.card, { backgroundColor: cardBackground }]}> 
          <Text style={styles.sectionTitle}>Server</Text>
          <Text style={[styles.label, { color: metaColor }]}>Base URL</Text>
          <Text style={[styles.value, { color: palette.text }]}>{API_BASE_URL}</Text>
          <Text style={[styles.label, { color: metaColor }]}>API Version</Text>
          <Text style={[styles.value, { color: palette.text }]}>{info?.apiVersion ?? '—'}</Text>
          <Text style={[styles.label, { color: metaColor }]}>Server Version</Text>
          <Text style={[styles.value, { color: palette.text }]}>{info?.serverVersion ?? '—'}</Text>
        </View>

        <View style={[styles.card, { backgroundColor: cardBackground }]}> 
          <Text style={styles.sectionTitle}>Indexer</Text>
          <Text style={[styles.label, { color: metaColor }]}>Last Scan</Text>
          <Text style={[styles.value, { color: palette.text }]}>{formatDate(status?.lastScanAt || null)}</Text>
          <Text style={[styles.label, { color: metaColor }]}>Status</Text>
          <Text style={[styles.value, { color: palette.text }]}>
            {status?.scanInProgress ? 'Running' : 'Idle'}
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: cardBackground }]}> 
          <Text style={styles.sectionTitle}>Media Sync</Text>

          <Text style={[styles.label, { color: metaColor }]}>Source</Text>
          <View style={styles.rootRow}>
            <Pressable
              onPress={() => persistSyncSource('camera')}
              style={[
                styles.rootChip,
                { backgroundColor: chipBackground },
                syncSource === 'camera' && { backgroundColor: palette.tint },
              ]}
            >
              <Text
                style={[
                  styles.rootChipLabel,
                  { color: syncSource === 'camera' ? '#fff' : palette.text },
                ]}
              >
                Camera Library
              </Text>
            </Pressable>
            <Pressable
              onPress={() => persistSyncSource('folder')}
              style={[
                styles.rootChip,
                { backgroundColor: chipBackground },
                syncSource === 'folder' && { backgroundColor: palette.tint },
              ]}
            >
              <Text
                style={[
                  styles.rootChipLabel,
                  { color: syncSource === 'folder' ? '#fff' : palette.text },
                ]}
              >
                Specific Folder
              </Text>
            </Pressable>
          </View>

          <Text style={[styles.label, { color: metaColor }]}>Destination root</Text>
          <View style={styles.rootRow}>
            {roots.map((root) => (
              <Pressable
                key={root.id}
                onPress={() => persistRoot(root.id)}
                style={[
                  styles.rootChip,
                  { backgroundColor: chipBackground },
                  root.id === syncRootId && { backgroundColor: palette.tint },
                ]}
              >
                <Text
                  style={[
                    styles.rootChipLabel,
                    { color: root.id === syncRootId ? '#fff' : palette.text },
                  ]}
                >
                  {root.name || root.id}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.label, { color: metaColor }]}>Base folder (optional)</Text>
          <TextInput
            value={syncPath}
            onChangeText={setSyncPath}
            onBlur={persistPath}
            placeholder={syncSource === 'camera' ? 'Camera Uploads' : 'Folder Sync'}
            placeholderTextColor={metaColor}
            autoCapitalize="none"
            autoCorrect={false}
            style={[
              styles.input,
              {
                color: palette.text,
                backgroundColor: inputBackground,
                borderColor: inputBorder,
              },
            ]}
          />

          {syncSource === 'camera' ? (
            <>
              <Text style={[styles.hint, { color: metaColor }]}> 
                Uploads are grouped into YYYY-MM folders under this base path.
              </Text>
              <View style={styles.toggleRow}>
                <View style={styles.toggleTextWrap}>
                  <Text style={[styles.toggleTitle, { color: palette.text }]}>Include videos</Text>
                  <Text style={[styles.hint, { color: metaColor }]}> 
                    Off is faster and avoids large uploads.
                  </Text>
                </View>
                <Pressable
                  onPress={() => persistIncludeVideos(!includeVideos)}
                  style={[
                    styles.toggleBtn,
                    {
                      backgroundColor: includeVideos ? palette.tint : chipBackground,
                    },
                  ]}
                >
                  <Text style={[styles.toggleBtnLabel, { color: includeVideos ? '#fff' : palette.text }]}> 
                    {includeVideos ? 'On' : 'Off'}
                  </Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <Text style={[styles.hint, { color: metaColor }]}> 
                Sync all files in the selected local folder (recursive).
              </Text>
              <View style={styles.folderPickerWrap}>
                <Pressable
                  style={[styles.folderBtn, { borderColor: inputBorder, backgroundColor: inputBackground }]}
                  onPress={pickSyncFolder}
                >
                  <Text style={[styles.folderBtnLabel, { color: palette.text }]}>Pick local folder</Text>
                </Pressable>
                <Text style={[styles.folderUri, { color: metaColor }]} numberOfLines={2}>
                  {localFolderUri || 'No folder selected'}
                </Text>
              </View>

              <View style={styles.toggleRow}>
                <View style={styles.toggleTextWrap}>
                  <Text style={[styles.toggleTitle, { color: palette.text }]}>Mirror sync (prune)</Text>
                  <Text style={[styles.hint, { color: metaColor }]}> 
                    Move remote files to trash when they are no longer in this folder.
                  </Text>
                </View>
                <Pressable
                  onPress={() => persistMirrorRemote(!mirrorRemote)}
                  style={[
                    styles.toggleBtn,
                    {
                      backgroundColor: mirrorRemote ? palette.tint : chipBackground,
                    },
                  ]}
                >
                  <Text style={[styles.toggleBtnLabel, { color: mirrorRemote ? '#fff' : palette.text }]}> 
                    {mirrorRemote ? 'On' : 'Off'}
                  </Text>
                </Pressable>
              </View>
            </>
          )}

          <Text style={[styles.label, { color: metaColor }]}>Conflict policy</Text>
          <View style={styles.rootRow}>
            <Pressable
              onPress={() => persistConflictPolicy('skip')}
              style={[
                styles.rootChip,
                { backgroundColor: chipBackground },
                conflictPolicy === 'skip' && { backgroundColor: palette.tint },
              ]}
            >
              <Text
                style={[
                  styles.rootChipLabel,
                  { color: conflictPolicy === 'skip' ? '#fff' : palette.text },
                ]}
              >
                Skip
              </Text>
            </Pressable>
            <Pressable
              onPress={() => persistConflictPolicy('overwrite')}
              style={[
                styles.rootChip,
                { backgroundColor: chipBackground },
                conflictPolicy === 'overwrite' && { backgroundColor: palette.tint },
              ]}
            >
              <Text
                style={[
                  styles.rootChipLabel,
                  { color: conflictPolicy === 'overwrite' ? '#fff' : palette.text },
                ]}
              >
                Overwrite
              </Text>
            </Pressable>
            <Pressable
              onPress={() => persistConflictPolicy('rename')}
              style={[
                styles.rootChip,
                { backgroundColor: chipBackground },
                conflictPolicy === 'rename' && { backgroundColor: palette.tint },
              ]}
            >
              <Text
                style={[
                  styles.rootChipLabel,
                  { color: conflictPolicy === 'rename' ? '#fff' : palette.text },
                ]}
              >
                Rename
              </Text>
            </Pressable>
          </View>
          <Text style={[styles.hint, { color: metaColor }]}>
            Skip keeps existing files, overwrite replaces them, rename uploads as "name (1).ext".
          </Text>
          {syncSource === 'folder' && mirrorRemote && conflictPolicy === 'rename' ? (
            <Text style={[styles.hint, { color: metaColor }]}>
              Mirror sync uses overwrite to keep remote paths aligned with your folder.
            </Text>
          ) : null}

          <View style={styles.syncActions}>
            <Pressable
              style={[
                styles.syncBtn,
                {
                  backgroundColor:
                    uploadEnabled && selectedRoot && (syncSource === 'camera' || localFolderUri)
                      ? palette.tint
                      : '#8D93A1',
                },
              ]}
              onPress={runSync}
              disabled={
                !uploadEnabled ||
                !selectedRoot ||
                (syncSource === 'folder' && !localFolderUri) ||
                syncRunning
              }
            >
              {syncRunning ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.syncBtnLabel}>Sync now</Text>
              )}
            </Pressable>
            {syncRunning ? (
              <Pressable style={[styles.cancelBtn, { borderColor: '#C03D3D' }]} onPress={cancelSync}>
                <Text style={styles.cancelBtnLabel}>Cancel</Text>
              </Pressable>
            ) : null}
          </View>

          {!uploadEnabled ? (
            <Text style={styles.errorText}>Uploads are disabled by server configuration.</Text>
          ) : null}

          <View style={styles.progressCard}>
            <Text style={[styles.progressTitle, { color: palette.text }]}>
              {syncProgress.stage === 'uploading'
                ? 'Uploading'
                : syncProgress.stage === 'planning'
                ? 'Planning'
                : syncProgress.stage === 'mirroring'
                ? 'Mirroring'
                : syncProgress.stage === 'done'
                ? 'Last run'
                : syncProgress.stage === 'cancelled'
                ? 'Cancelled'
                : syncProgress.stage === 'error'
                ? 'Sync error'
                : 'Idle'}
            </Text>
            {syncProgress.message ? (
              <Text style={[styles.progressMessage, { color: metaColor }]}>{syncProgress.message}</Text>
            ) : null}
            {syncProgress.error ? <Text style={styles.errorText}>{syncProgress.error}</Text> : null}

            <Text style={[styles.progressMeta, { color: metaColor }]}>
              Discovered: {syncProgress.discovered}  Planned: {syncProgress.planned}  Skipped:{' '}
              {syncProgress.skipped}  Failed: {syncProgress.failed}
            </Text>
            <Text style={[styles.progressMeta, { color: metaColor }]}>
              Uploaded files: {syncProgress.uploaded}/{syncProgress.planned || 0}
            </Text>
            <Text style={[styles.progressMeta, { color: metaColor }]}>
              Uploaded bytes: {formatBytes(syncProgress.uploadedBytes)} / {formatBytes(syncProgress.plannedBytes)}
            </Text>

            {syncSource === 'folder' ? (
              <Text style={[styles.progressMeta, { color: metaColor }]}> 
                Mirror deleted: {syncProgress.remoteDeleted}  Mirror failed: {syncProgress.remoteDeleteFailed}
              </Text>
            ) : null}

            <View style={[styles.progressTrack, { backgroundColor: inputBorder }]}>
              <View
                style={[
                  styles.progressFill,
                  { backgroundColor: palette.tint, width: `${overallPercent * 100}%` },
                ]}
              />
            </View>

            {syncProgress.currentFileName ? (
              <>
                <Text style={[styles.currentFile, { color: palette.text }]} numberOfLines={1}>
                  {syncProgress.currentFileName}
                </Text>
                <Text style={[styles.progressMeta, { color: metaColor }]}> 
                  {formatBytes(syncProgress.currentFileUploaded)} / {formatBytes(syncProgress.currentFileBytes)}
                </Text>
                <View style={[styles.progressTrackSmall, { backgroundColor: inputBorder }]}>
                  <View
                    style={[
                      styles.progressFillSmall,
                      { backgroundColor: '#4BA3FF', width: `${currentPercent * 100}%` },
                    ]}
                  />
                </View>
              </>
            ) : null}

            {syncProgress.startedAt ? (
              <Text style={[styles.progressMeta, { color: metaColor }]}>Started: {formatDate(syncProgress.startedAt)}</Text>
            ) : null}
            {syncProgress.finishedAt ? (
              <Text style={[styles.progressMeta, { color: metaColor }]}>Finished: {formatDate(syncProgress.finishedAt)}</Text>
            ) : null}
            <Text style={[styles.progressMeta, { color: metaColor }]}> 
              Chunk size: {formatBytes(chunkBytes)}  Root: {selectedRoot?.name || selectedRoot?.id || '—'}
            </Text>
            <Text style={[styles.progressMeta, { color: metaColor }]}> 
              Path: {uploadPathNormalized || '(server default)'}
            </Text>
          </View>
        </View>

        <Pressable style={[styles.signOut, { backgroundColor: palette.tint }]} onPress={signOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  container: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 16,
  },
  card: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#7D8390',
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    marginTop: 6,
  },
  value: {
    fontSize: 15,
    fontWeight: '600',
  },
  rootRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 6,
  },
  rootChip: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  rootChipLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  hint: {
    fontSize: 12,
    marginTop: 6,
  },
  folderPickerWrap: {
    marginTop: 10,
  },
  folderBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderBtnLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  folderUri: {
    marginTop: 8,
    fontSize: 12,
  },
  toggleRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  toggleTextWrap: {
    flex: 1,
  },
  toggleTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  toggleBtn: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  toggleBtnLabel: {
    fontWeight: '700',
    fontSize: 13,
  },
  syncActions: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  syncBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncBtnLabel: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  cancelBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnLabel: {
    color: '#C03D3D',
    fontWeight: '700',
    fontSize: 13,
  },
  progressCard: {
    marginTop: 14,
    borderRadius: 12,
    padding: 12,
    backgroundColor: 'rgba(125,131,144,0.08)',
  },
  progressTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  progressMessage: {
    marginTop: 4,
    fontSize: 12,
  },
  progressMeta: {
    marginTop: 6,
    fontSize: 12,
  },
  progressTrack: {
    marginTop: 8,
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
  currentFile: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
  },
  progressTrackSmall: {
    marginTop: 4,
    height: 6,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFillSmall: {
    height: '100%',
  },
  errorText: {
    marginTop: 8,
    color: '#C03D3D',
    fontSize: 12,
    fontWeight: '600',
  },
  signOut: {
    marginTop: 12,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  signOutText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
});
