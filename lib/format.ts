export function formatBytes(bytes?: number | null) {
  if (!bytes || bytes <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const size = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, size);
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[size]}`;
}

export function formatDate(timestamp?: number | null) {
  if (!timestamp) {
    return '—';
  }
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return '—';
  }
}
