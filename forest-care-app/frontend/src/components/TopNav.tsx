import { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import BackButton from './BackButton';

// Top navigation bar shared by the start and employer pages
export default function TopNav({ showBackButton = false }: { showBackButton?: boolean }) {
  const { user, logout, isGuest } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Start each page from the top instead of keeping the previous page's scroll position
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <>
      <nav className="map-nav">
        <div className="map-nav-left">
          <Link to="/start" className="map-nav-title nav-home-link">🌲 Metsuri</Link>
        </div>
        <div className="map-nav-right">
          {isGuest ? (
            <>
              <span className="user-email guest-label">Vierailija</span>
              <button className="btn btn-small btn-primary" onClick={handleLogout}>
                Kirjaudu sisään
              </button>
            </>
          ) : (
            <>
              <span className="user-email">{user?.email}</span>
              <button className="btn btn-small" onClick={handleLogout}>
                Kirjaudu ulos
              </button>
            </>
          )}
        </div>
      </nav>
      {showBackButton && <BackButton />}
    </>
  );
}
