import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { api, setAccessToken } from '../api/client';
import { disconnectSocket } from '../realtime/socket';

export type UserRole = 'ADMIN' | 'PROJECT_MANAGER' | 'DEVELOPER';

export type AuthUser = {
  id: string;
  name: string;
  role: UserRole;
};

type AuthContext = {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const Context = createContext<AuthContext | null>(null);

type AuthResponse = {
  data: {
    accessToken: string;
    user: AuthUser;
  };
};

function applyAuth(data: AuthResponse['data'], setUser: (u: AuthUser) => void, setToken: (t: string) => void) {
  setToken(data.accessToken);
  setAccessToken(data.accessToken);
  setUser(data.user);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Silent refresh on mount to restore session from HttpOnly cookie
  useEffect(() => {
    api
      .post<AuthResponse>('/auth/refresh')
      .then((r) => applyAuth(r.data.data, setUser, (t) => setToken(t)))
      .catch(() => {
        /* No cookie or expired — stay logged out */
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string): Promise<void> => {
    const r = await api.post<AuthResponse>('/auth/login', { email, password });
    applyAuth(r.data.data, setUser, (t) => setToken(t));
  };

  const logout = async (): Promise<void> => {
    await api.post('/auth/logout').catch(() => {/* best-effort */});
    disconnectSocket();
    setUser(null);
    setToken(null);
    setAccessToken(null);
  };

  return (
    <Context.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </Context.Provider>
  );
}

export function useAuth(): AuthContext {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
