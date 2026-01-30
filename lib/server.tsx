import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiJson } from './api';
import { useAuth } from './auth';

export type RootInfo = { id: string; name?: string; path: string };
export type ServerInfo = {
  apiVersion?: number;
  serverVersion?: string;
  devMode?: boolean;
  auth?: { required?: boolean; sessionTtlHours?: number; queryToken?: boolean };
  capabilities?: Record<string, any>;
};
export type IndexStatus = {
  lastScanAt?: number | null;
  scanInProgress?: boolean;
  scanIntervalSeconds?: number;
  fullScanIntervalHours?: number;
  progress?: any;
};

type ServerContextValue = {
  roots: RootInfo[];
  info: ServerInfo | null;
  status: IndexStatus | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const ServerContext = createContext<ServerContextValue | null>(null);

export function ServerProvider({ children }: { children: React.ReactNode }) {
  const { token, devMode, isAuthenticated } = useAuth();
  const [roots, setRoots] = useState<RootInfo[]>([]);
  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [status, setStatus] = useState<IndexStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    if (!isAuthenticated && !devMode) {
      return;
    }
    setLoading(true);
    const result = await apiJson('/api/bootstrap', { token: token || undefined });
    if (result.ok) {
      setRoots(Array.isArray(result.data?.roots) ? result.data.roots : []);
      setInfo(result.data?.info || null);
      setStatus(result.data?.status || null);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!isAuthenticated && !devMode) {
      setRoots([]);
      setInfo(null);
      setStatus(null);
      return;
    }
    refresh();
  }, [token, devMode, isAuthenticated]);

  const value = useMemo<ServerContextValue>(
    () => ({
      roots,
      info,
      status,
      loading,
      refresh,
    }),
    [roots, info, status, loading]
  );

  return <ServerContext.Provider value={value}>{children}</ServerContext.Provider>;
}

export function useServer() {
  const ctx = useContext(ServerContext);
  if (!ctx) {
    throw new Error('useServer must be used within ServerProvider');
  }
  return ctx;
}
