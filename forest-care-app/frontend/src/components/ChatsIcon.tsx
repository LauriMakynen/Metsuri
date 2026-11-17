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
        <span aria-hidden="true">💬</span>
        {!isChatViewOpen && chats.some((chat) => chat.unread_count > 0) && <span className="chats-badge">!</span>}
      </button>
    </div>
  );
}
