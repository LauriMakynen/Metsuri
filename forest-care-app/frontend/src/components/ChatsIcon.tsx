import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { chatsService } from '../services/forestService';
import type { ChatSummary } from '../types';

export default function ChatsIcon() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const isChatViewOpen = pathname === '/chat' || pathname.startsWith('/chat/');

  const load = async () => {
    try {
      setChats(await chatsService.getAll());
    } catch {
      // The chat page displays the detailed error if the list cannot be loaded.
    }
  };

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    const interval = window.setInterval(() => void load(), 10_000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
    };
  }, []);

  return (
    <div className="chats-nav">
      <button
        type="button"
        className="chats-icon"
        aria-label="Avaa chatit"
        onClick={() => navigate('/chat')}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H8l-4 3v-6.1A7.5 7.5 0 1 1 20 11.5Z" />
          <path d="M8 11h.01M12 11h.01M16 11h.01" />
        </svg>
        {!isChatViewOpen && chats.some((chat) => chat.unread_count > 0) && <span className="chats-badge">!</span>}
      </button>
    </div>
  );
}
