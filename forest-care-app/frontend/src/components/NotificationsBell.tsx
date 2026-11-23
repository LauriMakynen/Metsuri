import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { notificationsService } from '../services/forestService';
import type { Notification } from '../types';

function relativeTime(value: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'juuri nyt';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min sitten`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h sitten`;
  const days = Math.floor(hours / 24);
  return `${days} vrk sitten`;
}

export default function NotificationsBell() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const isChatViewOpen = pathname === '/chat' || pathname.startsWith('/chat/');

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      const data = await notificationsService.getAll();
      const visibleNotifications = isChatViewOpen
        ? data.notifications.filter((notification) => notification.type !== 'chat_message')
        : data.notifications;
      setNotifications(visibleNotifications);
      setUnreadCount(visibleNotifications.filter((notification) => !notification.read_at).length);
      setError('');
    } catch {
      setError('Ilmoitusten lataaminen epäonnistui.');
    }
  }, [isChatViewOpen]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadNotifications(), 0);
    const interval = window.setInterval(() => void loadNotifications(), 60_000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
    };
  }, [loadNotifications]);

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.read_at) {
      try {
        await notificationsService.markRead(notification.id);
        setNotifications((current) =>
          current.map((item) => item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item)
        );
        setUnreadCount((count) => Math.max(0, count - 1));
      } catch {
        setError('Ilmoituksen kuittaaminen epäonnistui.');
        return;
      }
    }
    setOpen(false);
    navigate(notification.link);
  };

  const markAllRead = async () => {
    try {
      await notificationsService.markAllRead();
      setNotifications((current) => current.map((notification) => ({
        ...notification,
        read_at: notification.read_at ?? new Date().toISOString(),
      })));
      setUnreadCount(0);
    } catch {
      setError('Ilmoitusten kuittaaminen epäonnistui.');
    }
  };

  return (
    <div ref={containerRef} className="notifications">
      <button
        type="button"
        className="notifications-bell"
        aria-label={`Ilmoitukset${unreadCount ? `, ${unreadCount} lukematonta` : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" />
          <path d="M10 21h4" />
        </svg>
        {unreadCount > 0 && <span className="notifications-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>
      {open && (
        <section className="notifications-panel" aria-label="Ilmoitukset">
          <div className="notifications-header">
            <strong>Ilmoitukset</strong>
            <button type="button" className="notifications-read-all" onClick={() => void markAllRead()} disabled={!unreadCount}>
              Merkitse kaikki luetuiksi
            </button>
          </div>
          {error && <p className="notifications-error">{error}</p>}
          {notifications.length === 0 && !error && <p className="notifications-empty">Ei ilmoituksia.</p>}
          <div className="notifications-list">
            {notifications.map((notification) => (
              <button
                type="button"
                className={`notification-item ${notification.read_at ? '' : 'unread'}`}
                key={notification.id}
                onClick={() => void handleNotificationClick(notification)}
              >
                <span className="notification-title">{notification.title}</span>
                <span className="notification-body">{notification.body}</span>
                <span className="notification-time">{relativeTime(notification.created_at)}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
