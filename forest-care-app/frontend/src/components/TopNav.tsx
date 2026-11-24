import { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import BackButton from './BackButton';
import HelpMenu from './HelpMenu';
import NotificationsBell from './NotificationsBell';
import ChatsIcon from './ChatsIcon';

// Top navigation bar shared by the start and employer pages
export default function TopNav() {
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
    <nav className={`map-nav ${pathname.startsWith('/chat') ? 'chat-route' : ''}`}>
      <div className="map-nav-left">
        {pathname !== '/start' && <BackButton alwaysNavigateToFallback={pathname.startsWith('/foorumi')} />}
        <Link to="/start" className="map-nav-title nav-home-link" aria-label="Metsuri – aloitusnäkymä">
          <img className="nav-logo-wordmark" src="/media/white_wordmark.png" alt="Metsuri" />
          <img className="nav-logo-symbol" src="/media/white_symbol.png" alt="" aria-hidden="true" />
        </Link>
      </div>
      <div className="map-nav-right">
        {!isGuest && <NotificationsBell />}
        {!isGuest && !pathname.startsWith('/chat') && <ChatsIcon />}
        <HelpMenu />
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
            <button className="btn btn-small logout-button" onClick={handleLogout} aria-label="Kirjaudu ulos" title="Kirjaudu ulos">
              <span className="logout-label">Kirjaudu ulos</span>
              <svg className="logout-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 17l5-5-5-5" />
                <path d="M15 12H3" />
                <path d="M21 19V5a2 2 0 0 0-2-2h-5" />
              </svg>
            </button>
          </>
        )}
      </div>
    </nav>
  );
}
