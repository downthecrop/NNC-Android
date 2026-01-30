import { useAuth } from './auth';
import { apiJson, buildQuery, buildUrl } from './apiClient';

export { apiJson, buildQuery, buildUrl };

export function useApi() {
  const { token } = useAuth();

  const apiJsonWithAuth = (
    path: string,
    options: Omit<Parameters<typeof apiJson>[1], 'token'> = {}
  ) => apiJson(path, { ...options, token: token || undefined });

  const authHeaders = token ? { Authorization: `Bearer ${token}` } : undefined;

  return {
    apiJson: apiJsonWithAuth,
    authHeaders,
    buildUrl,
  };
}
