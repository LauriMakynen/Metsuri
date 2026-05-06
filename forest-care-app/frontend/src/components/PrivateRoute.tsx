import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import type { ReactNode } from 'react';

// Protects routes that require authentication or guest access
export default function PrivateRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isGuest } = useAuth();
  return isAuthenticated || isGuest ? <>{children}</> : <Navigate to="/login" replace />;
}
