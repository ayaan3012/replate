import {
  createContext, useContext, useEffect, useState,
  type ReactNode,
} from "react";
import { call, type SessionUser } from "@/lib/api";

interface AuthState {
  user:    SessionUser | null;
  loading: boolean;
  /** Replace local user state after login / register */
  setUser: (u: SessionUser | null) => void;
  /** Clear cookie + local state */
  logout:  () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,    setUser]    = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    call<{ user: SessionUser | null }>("auth", "me")
      .then(r => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const logout = async () => {
    await call("auth", "logout").catch(() => {});
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, setUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

/** Access auth state anywhere inside <AuthProvider>. */
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
