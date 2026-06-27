import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: string;
  slug?: string | null;
  avatarUrl?: string | null;
  isActive: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem("crm_token");
    const storedUser = localStorage.getItem("crm_user");
    if (!storedToken) {
      setIsLoading(false);
      return;
    }
    setToken(storedToken);
    if (storedUser) {
      try { setUser(JSON.parse(storedUser)); } catch {}
    }
    // Re-fetch the current profile so role/permission changes propagate
    // without requiring the user to log out and back in.
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${storedToken}` } })
      .then(async (res) => {
        if (res.status === 401) {
          setToken(null);
          setUser(null);
          localStorage.removeItem("crm_token");
          localStorage.removeItem("crm_user");
          return;
        }
        if (!res.ok) return;
        const fresh = (await res.json()) as AuthUser;
        setUser(fresh);
        localStorage.setItem("crm_user", JSON.stringify(fresh));
      })
      .catch(() => { /* keep cached user on network error */ })
      .finally(() => setIsLoading(false));
  }, []);

  const login = (t: string, u: AuthUser) => {
    setToken(t);
    setUser(u);
    localStorage.setItem("crm_token", t);
    localStorage.setItem("crm_user", JSON.stringify(u));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("crm_token");
    localStorage.removeItem("crm_user");
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
