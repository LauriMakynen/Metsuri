import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import type { ReactNode } from 'react';

// Protects routes that require authentication or guest access
export default function PrivateRoute({
  children,
  authenticatedOnly = false,
}: {
  children: ReactNode;
  authenticatedOnly?: boolean;
}) {
  const { isAuthenticated, isGuest } = useAuth();
  return isAuthenticated || (!authenticatedOnly && isGuest)
    ? <>{children}</>
    : <Navigate to="/login" replace />;
}
