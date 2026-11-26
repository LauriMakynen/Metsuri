import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import type { User } from '../types';
import { DEMO_USER, setDemoActive } from '../demo/demoMode';
import { resetDemoState } from '../demo/demoStore';

interface AuthContextType {
  token: string | null;
  user: User | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  /** Logged in, or using the demo (which works like a logged-in forest owner) */
  isAuthenticated: boolean;
  /** Using the demo: example data in this browser tab, nothing is saved on the server */
  isGuest: boolean;
  loginAsGuest: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Provides authentication state throughout the app
export function AuthProvider({ children }: { children: ReactNode }) {
  // Restore session synchronously so PrivateRoute doesn't redirect before it is known
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem('user') ? localStorage.getItem('token') : null
  );
  const [user, setUser] = useState<User | null>(() => {
    const storedUser = localStorage.getItem('user');
    return storedUser && localStorage.getItem('token') ? JSON.parse(storedUser) : null;
  });
  const [isGuest, setIsGuest] = useState(
    () => !token && sessionStorage.getItem('guest') === 'true'
  );

  const login = (newToken: string, newUser: User) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    setDemoActive(false);
    setToken(newToken);
    setUser(newUser);
    setIsGuest(false);
  };

  // Every new demo starts from the example data
  const loginAsGuest = () => {
    resetDemoState();
    setDemoActive(true);
    setIsGuest(true);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setDemoActive(false);
    resetDemoState();
    setToken(null);
    setUser(null);
    setIsGuest(false);
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user: token ? user : isGuest ? DEMO_USER : null,
        login,
        logout,
        isAuthenticated: !!token || isGuest,
        isGuest,
        loginAsGuest,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
