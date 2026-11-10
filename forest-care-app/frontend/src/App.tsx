import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import PrivateRoute from './components/PrivateRoute';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import MapPage from './pages/MapPage';
import StartPage from './pages/StartPage';
import EmployersPage from './pages/EmployersPage';
import ForestOverviewPage from './pages/ForestOverviewPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import HelpPage from './pages/HelpPage';
import AddForestPage from './pages/AddForestPage';
import ForumPage from './pages/ForumPage';

function AppLayout() {
  return <Outlet />;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/ohje" element={<HelpPage />} />
            <Route
              path="/start"
              element={
                <PrivateRoute>
                  <StartPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/tyontarjoajat"
              element={
                <PrivateRoute>
                  <EmployersPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/omat-metsat"
              element={
                <PrivateRoute authenticatedOnly>
                  <ForestOverviewPage />
                </PrivateRoute>
              }
            />
            {/* Guests may read the forum; writing needs an account */}
            {['/foorumi', '/foorumi/:id'].map((path) => (
              <Route
                key={path}
                path={path}
                element={
                  <PrivateRoute>
                    <ForumPage />
                  </PrivateRoute>
                }
              />
            ))}
            <Route
              path="/lisaa-metsa"
              element={
                <PrivateRoute authenticatedOnly>
                  <AddForestPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/map"
              element={
                <PrivateRoute>
                  <MapPage />
                </PrivateRoute>
              }
            />
            <Route path="/" element={<Navigate to="/start" replace />} />
            <Route path="*" element={<Navigate to="/start" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
