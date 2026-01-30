import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { apiJson } from './apiClient';

const TOKEN_KEY = 'nnc_token';
const EXPIRES_KEY = 'nnc_token_expires';

type AuthContextValue = {
  token: string;
  devMode: boolean;
  ready: boolean;
  isAuthenticated: boolean;
  signIn: (user: string, pass: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function loadStoredToken() {
  const [token, expiresAt] = await Promise.all([
    SecureStore.getItemAsync(TOKEN_KEY),
    SecureStore.getItemAsync(EXPIRES_KEY),
  ]);
  if (!token) {
    return { token: '', expiresAt: null };
  }
  const expires = expiresAt ? Number(expiresAt) : null;
  if (expires && Number.isFinite(expires) && expires <= Date.now()) {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(EXPIRES_KEY);
    return { token: '', expiresAt: null };
  }
  return { token, expiresAt: expires };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState('');
  const [devMode, setDevMode] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const stored = await loadStoredToken();
      const health = await apiJson('/api/health');
      if (!active) {
        return;
      }
      setDevMode(Boolean(health.ok ? health.data?.devMode : false));
      setToken(stored.token || '');
      setReady(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  const signIn = async (user: string, pass: string) => {
    const result = await apiJson('/api/login', {
      method: 'POST',
      body: { user, pass },
    });
    if (!result.ok) {
      return { ok: false, error: result.error?.message || 'Login failed' };
    }
    const nextToken = result.data?.token || '';
    const expiresAt = result.data?.expiresAt ? String(result.data.expiresAt) : '';
    setToken(nextToken);
    if (nextToken) {
      await SecureStore.setItemAsync(TOKEN_KEY, nextToken);
      if (expiresAt) {
        await SecureStore.setItemAsync(EXPIRES_KEY, expiresAt);
      }
    }
    return { ok: true };
  };

  const signOut = async () => {
    if (token) {
      await apiJson('/api/logout', { method: 'POST', token });
    }
    setToken('');
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(EXPIRES_KEY);
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      devMode,
      ready,
      isAuthenticated: devMode || Boolean(token),
      signIn,
      signOut,
    }),
    [token, devMode, ready]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
