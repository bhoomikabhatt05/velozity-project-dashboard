import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';

export const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
});

let accessToken: string | null = null;

export const setAccessToken = (token: string | null): void => {
  accessToken = token;
};

// Attach Bearer token to every outgoing request
api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// On 401: attempt a silent token refresh and retry the original request once.
// If the refresh itself fails, clear the token so AuthContext logs the user out.
let refreshing: Promise<string> | null = null;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    if (
      error.response?.status === 401 &&
      !original._retried &&
      // Don't retry auth endpoints to avoid infinite loops
      !original.url?.startsWith('/auth/')
    ) {
      original._retried = true;

      try {
        // Coalesce concurrent 401s into a single refresh call
        if (!refreshing) {
          refreshing = axios
            .post(`${BASE_URL}/auth/refresh`, {}, { withCredentials: true })
            .then((r) => {
              const token: string = r.data.data.accessToken;
              setAccessToken(token);
              return token;
            })
            .finally(() => {
              refreshing = null;
            });
        }

        const newToken = await refreshing;
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch {
        // Refresh failed — clear token so the UI redirects to login
        setAccessToken(null);
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  },
);
