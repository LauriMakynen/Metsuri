import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import type { User } from '../types';

interface AuthContextType {
  token: string | null;
  user: User | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  isAuthenticated: boolean;
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
    sessionStorage.removeItem('guest');
    setToken(newToken);
    setUser(newUser);
    setIsGuest(false);
  };

  const loginAsGuest = () => {
    sessionStorage.setItem('guest', 'true');
    setIsGuest(true);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.removeItem('guest');
    setToken(null);
    setUser(null);
    setIsGuest(false);
  };

  return (
    <AuthContext.Provider
      value={{ token, user, login, logout, isAuthenticated: !!token, isGuest, loginAsGuest }}
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
