import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import PrivateRoute from './components/PrivateRoute';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import MapPage from './pages/MapPage';
import StartPage from './pages/StartPage';
import EmployersPage from './pages/EmployersPage';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
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
            path="/map"
            element={
              <PrivateRoute>
                <MapPage />
              </PrivateRoute>
            }
          />
          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/start" replace />} />
          <Route path="*" element={<Navigate to="/start" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
