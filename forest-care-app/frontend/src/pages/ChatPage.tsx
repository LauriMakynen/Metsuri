import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import TopNav from '../components/TopNav';
import Avatar from '../components/Avatar';
import { chatsService, workRequestsService } from '../services/forestService';
import { useAuth } from '../hooks/useAuth';
import type { ChatMessage, ChatSummary } from '../types';
import { TreePine } from 'lucide-react';
import { MARKING_COLORS, MARKING_TYPE_LABELS } from '../utils/markingTypes';
import { TARGET_PRICE_LABEL } from '../utils/bids';
import { formatArea } from '../utils/measurement';
import SpruceForestBackdrop from '../components/SpruceForestBackdrop';

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

function readImage(file: File): Promise<{ image_base64: string; image_type: string }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Kuvan käsittely epäonnistui'));
        return;
      }

      let width = image.naturalWidth;
      let height = image.naturalHeight;
      let quality = 0.85;
      let blob: Blob | null = null;

      const createBlob = () => new Promise<Blob | null>((resolveBlob) => {
        canvas.toBlob(resolveBlob, 'image/jpeg', quality);
      });

      const compress = async () => {
        for (let attempt = 0; attempt < 8; attempt += 1) {
          canvas.width = width;
          canvas.height = height;
          context.drawImage(image, 0, 0, width, height);
          blob = await createBlob();
          if (blob && blob.size <= MAX_IMAGE_BYTES) break;
          if (quality > 0.5) quality -= 0.1;
          else {
            width = Math.round(width * 0.8);
            height = Math.round(height * 0.8);
          }
        }
        if (!blob || blob.size > MAX_IMAGE_BYTES) {
          reject(new Error('Kuvan pienentäminen epäonnistui'));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve({
          image_base64: String(reader.result).split(',')[1] || '',
          image_type: 'image/jpeg',
        });
        reader.onerror = () => reject(new Error('Kuvan lukeminen epäonnistui'));
        reader.readAsDataURL(blob);
      };

      void compress();
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Kuvan lukeminen epäonnistui'));
    };
    image.src = objectUrl;
  });
}

/** Nickname if the other party has one, else the part of the email before @ (like a username) */
function chatName(chat: Pick<ChatSummary, 'other_name' | 'other_email'>): string {
  return chat.other_name?.trim() || chat.other_email.split('@')[0];
}

/** The work request's first photo, or a tile in the work type's colour */
function RequestThumb({ chat, size = 'md' }: { chat: ChatSummary; size?: 'md' | 'lg' }) {
  const type = chat.request_type ?? 'muu_tyo';
  return chat.request_photo_id ? (
    <img className={`chat-thumb chat-thumb-${size}`} src={workRequestsService.photoUrl(chat.request_photo_id)} alt="" loading="lazy" />
  ) : (
    <span className={`chat-thumb chat-thumb-${size} chat-thumb-tile`} style={{ ['--thumb-tone' as string]: MARKING_COLORS[type] }} aria-hidden="true">
      <TreePine size={size === 'lg' ? 30 : 20} strokeWidth={1.75} />
    </span>
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;
function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}
/** "Tänään", "Eilen" or a date: separates the messages by day */
function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  if (dayKey(date) === dayKey(today)) return 'Tänään';
  if (dayKey(date) === dayKey(new Date(today.getTime() - DAY_MS))) return 'Eilen';
  return date.toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'numeric' });
}
/** List time: "nyt", "15 min" or "3 t" today, weekday this week, otherwise the date */
function listTime(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const age = Date.now() - date.getTime();
  if (age < 60_000) return 'nyt';
  if (age < 60 * 60_000) return `${Math.floor(age / 60_000)} min`;
  if (dayKey(date) === dayKey(new Date())) return `${Math.floor(age / (60 * 60_000))} t`;
  if (age < 6 * DAY_MS) return date.toLocaleDateString('fi-FI', { weekday: 'short' });
  return date.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' });
}
/** Preview line in the list: the text, or what kind of message it was */
function lastMessagePreview(chat: ChatSummary): string {
  if (chat.last_message) return chat.last_message;
  if (chat.last_counter_offer_eur != null) return `Vastatarjous ${formatEuro(chat.last_counter_offer_eur)}`;
  if (chat.last_has_image) return 'Kuva';
  return 'Tarjous tehty, ei vielä viestejä';
}
function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });
}
function formatEuro(value: number | string | null | undefined): string {
  return `${Number(value ?? 0).toLocaleString('fi-FI')} €`;
}

function isOfferAcceptedMessage(message: ChatMessage): boolean {
  return Boolean(message.body?.match(/^Tarjous .+ € (hyväksytty|peruttu)\.$/));
}

function isOfferCancelledMessage(message: ChatMessage): boolean {
  return Boolean(message.body?.match(/^Tarjous .+ € peruttu\.$/));
}

export default function ChatPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [selected, setSelected] = useState<ChatSummary | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [body, setBody] = useState('');
  const [counterOffer, setCounterOffer] = useState('');
  const [counterOfferMessageId, setCounterOfferMessageId] = useState<number | null>(null);
  const [newOfferAmount, setNewOfferAmount] = useState('');
  const composeRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const shouldScrollToBottomRef = useRef(true);
  const resizeCompose = (textarea: HTMLTextAreaElement) => {
    textarea.style.height = '46px';
    const height = Math.min(textarea.scrollHeight, 70);
    textarea.style.height = `${height}px`;
    textarea.style.overflowY = textarea.scrollHeight > 70 ? 'auto' : 'hidden';
  };
  const [image, setImage] = useState<{ image_base64: string; image_type: string } | null>(null);
  const [error, setError] = useState('');
  const [offerAction, setOfferAction] = useState<'accept' | 'delete' | 'edit' | 'counter' | 'cancel' | 'new' | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [openChatMenuId, setOpenChatMenuId] = useState<number | null>(null);
  const chatListRef = useRef<HTMLElement>(null);
  const [isChatListOpen, setIsChatListOpen] = useState(
    () => typeof window === 'undefined' || window.matchMedia('(min-width: 601px)').matches
  );
  const isNarrowScreen = typeof window !== 'undefined' && window.matchMedia('(max-width: 600px)').matches;

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 601px)');
    const handleViewportChange = (event: MediaQueryListEvent) => setIsChatListOpen(event.matches);
    mediaQuery.addEventListener('change', handleViewportChange);
    return () => mediaQuery.removeEventListener('change', handleViewportChange);
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!chatListRef.current?.contains(event.target as Node)) setOpenChatMenuId(null);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  const loadChats = useCallback(async () => {
    try {
      const list = await chatsService.getAll();
      setChats(list);
      if (list.length === 0) {
        setIsChatListOpen(false);
      } else if (!id && list[0]) {
        setIsChatListOpen(true);
        navigate(`/chat/${list[0].id}`, { replace: true });
      }
    } catch {
      setError('Chatien lataaminen epäonnistui.');
    }
  }, [id, navigate]);

  const loadMessages = useCallback(async (chatId: number) => {
    try {
      const result = await chatsService.getMessages(chatId);
      const messagesElement = messagesRef.current;
      const isNearBottom = !messagesElement
        || messagesElement.scrollHeight - messagesElement.scrollTop - messagesElement.clientHeight < 120;
      shouldScrollToBottomRef.current = isNearBottom;
      setSelected(result.chat);
      setMessages(result.messages);
      setError('');
    } catch {
      setError('Viestien lataaminen epäonnistui.');
    }
  }, []);

  useEffect(() => {
    if (!shouldScrollToBottomRef.current) return;
    const messagesElement = messagesRef.current;
    if (messagesElement) messagesElement.scrollTop = messagesElement.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadChats(), 0);
    const interval = window.setInterval(() => void loadChats(), 10_000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
    };
  }, [loadChats, id]);
  useEffect(() => {
    if (!id) return;
    const initialLoad = window.setTimeout(() => void loadMessages(Number(id)), 0);
    const interval = window.setInterval(() => void loadMessages(Number(id)), 10_000);
    const presenceInterval = window.setInterval(() => void chatsService.updatePresence(Number(id)), 10_000);
    void chatsService.updatePresence(Number(id));
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
      window.clearInterval(presenceInterval);
      void chatsService.clearPresence(Number(id));
    };
  }, [id, loadMessages]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!id || (!body.trim() && !image)) return;
    try {
      const message = await chatsService.sendMessage(Number(id), {
        body: body.trim() || undefined,
        ...(image || {}),
      });
      setMessages((current) => [...current, message]);
      setBody('');
      if (composeRef.current) {
        composeRef.current.style.height = '46px';
        composeRef.current.style.overflowY = 'hidden';
      }
      setCounterOffer('');
      setImage(null);
      setError('');
    } catch (err: unknown) {
      const errorResponse = err as { response?: { data?: { error?: string } } };
      setError(errorResponse.response?.data?.error || 'Viestin lähettäminen epäonnistui.');
    }
  };

  const chooseImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Valitse kuvatiedosto.');
      return;
    }
    try { setImage(await readImage(file)); } catch { setError('Kuvan lukeminen epäonnistui.'); }
  };

  const removeImage = () => {
    setImage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const sendCounterOffer = async () => {
    if (!id) return;
    const amount = Number(counterOffer.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Anna kelvollinen vastatarjous euroina.');
      return;
    }
    try {
      const message = await chatsService.sendMessage(Number(id), { counter_offer_eur: amount });
      setMessages((current) => [...current, message]);
      setCounterOffer('');
      setCounterOfferMessageId(null);
      setOfferAction(null);
      setError('');
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Vastatarjouksen lähettäminen epäonnistui.');
    }
  };

  const refreshOffer = async () => {
    if (id) await loadMessages(Number(id));
    await loadChats();
  };

  const deleteChat = async (chatId: number) => {
    try {
      await chatsService.delete(chatId);
      setChats((current) => current.filter((chat) => chat.id !== chatId));
      if (chatId === Number(id)) {
        setSelected(null);
        navigate('/chat');
      }
    } catch {
      setError('Chatin poistaminen epäonnistui.');
    }
  };

  const acceptOffer = async () => {
    if (!id) return;
    try {
      await chatsService.acceptOffer(Number(id));
      await refreshOffer();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Tarjouksen hyväksyminen epäonnistui.');
    }
  };

  const cancelOffer = async () => {
    if (!id) return;
    try {
      await chatsService.cancelOffer(Number(id));
      setOfferAction(null);
      await refreshOffer();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Tarjouksen peruminen epäonnistui.');
    }
  };

  const createNewOffer = async () => {
    if (!id) return;
    const amount = Number(newOfferAmount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Anna kelvollinen tarjous euroina.');
      return;
    }
    try {
      const message = await chatsService.createNewOffer(Number(id), amount);
      setMessages((current) => [...current, message]);
      setNewOfferAmount('');
      setOfferAction(null);
      await refreshOffer();
      setError('');
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Uuden tarjouksen lähettäminen epäonnistui.');
    }
  };

  const deleteOffer = async () => {
    if (!selected) return;
    try {
      await workRequestsService.deleteBid(selected.work_request_id);
      setOfferAction(null);
      await refreshOffer();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Tarjouksen peruminen epäonnistui.');
    }
  };

  const updateOffer = async () => {
    if (!selected) return;
    const amount = Number(editAmount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Anna kelvollinen tarjous euroina.');
      return;
    }
    try {
      await workRequestsService.updateBid(selected.work_request_id, amount);
      setOfferAction(null);
      await refreshOffer();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Tarjouksen muokkaus epäonnistui.');
    }
  };

  return (
    <div className="start-page forest-page chat-page-wrapper">
      <SpruceForestBackdrop />
      <TopNav />
      <main className={`chat-page ${isChatListOpen ? 'chat-list-open' : 'chat-list-closed'}`}>
        {chats.length > 0 && (!isNarrowScreen || !isChatListOpen) && <button
          type="button"
          className="chat-sidebar-toggle"
          onClick={() => setIsChatListOpen((open) => !open)}
          aria-expanded={isChatListOpen}
          aria-label={isChatListOpen ? 'Piilota chatit' : 'Avaa chatit'}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {isNarrowScreen && isChatListOpen
              ? <path d="m15 6-6 6 6 6" />
              : isNarrowScreen
                ? <path d="m9 6 6 6-6 6" />
                : <path d="M4 6h16M4 12h16M4 18h16" />}
          </svg>
        </button>}
        {chats.length > 0 && (
        <aside ref={chatListRef} className="chat-list">
          <h1>Viestit</h1>
          {chats.map((chat) => {
            const unread = chat.unread_count > 0 && chat.id !== Number(id);
            return (
            <div key={chat.id} className={`chat-list-item ${chat.id === Number(id) ? 'active' : ''} ${unread ? 'unread' : ''}`}>
              <Link to={`/chat/${chat.id}`} onClick={() => { if (isNarrowScreen) setIsChatListOpen(false); }}>
                <span className="chat-list-visual">
                  <Avatar name={chatName(chat)} size="xl" />
                  <RequestThumb chat={chat} />
                </span>
                <span className="chat-list-text">
                  <span className="chat-list-top">
                    <strong>{chatName(chat)}</strong>
                    <time>{listTime(chat.last_message_at ?? chat.created_at)}</time>
                  </span>
                  <span className="chat-list-title">{chat.title}</span>
                  <span className="chat-list-bottom">
                    <small>{lastMessagePreview(chat)}</small>
                    {unread && (
                      <em aria-label={`${chat.unread_count} lukematonta viestiä`}>
                        {chat.unread_count > 9 ? '9+' : chat.unread_count}
                      </em>
                    )}
                  </span>
                </span>
              </Link>
              <div className="chat-list-menu">
                <button
                  type="button"
                  className="chat-list-menu-toggle"
                  aria-label={`Keskustelun ${chatName(chat)} valikko`}
                  aria-expanded={openChatMenuId === chat.id}
                  onClick={() => setOpenChatMenuId((current) => current === chat.id ? null : chat.id)}
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="5" cy="12" r="2" />
                    <circle cx="12" cy="12" r="2" />
                    <circle cx="19" cy="12" r="2" />
                  </svg>
                </button>
                {openChatMenuId === chat.id && (
                  <div className="chat-list-menu-panel">
                    <button type="button" onClick={() => { setOpenChatMenuId(null); void deleteChat(chat.id); }}>
                      Poista chat
                    </button>
                  </div>
                )}
              </div>
            </div>
            );
          })}
        </aside>)}
        {/* With no conversations the list is hidden and the explanation card is shown alone */}
        <section className={`chat-conversation ${!selected && chats.length === 0 ? 'chat-conversation-empty' : ''}`}>
          {selected ? <><header className="chat-head">
              <Avatar name={chatName(selected)} size="lg" />
              <div>
                <h2>{chatName(selected)}</h2>
                <p>{selected.owner_id === user?.id ? 'Työn tarjoaja' : 'Metsänomistaja'}</p>
              </div>
            </header>
            {/* The work request as the conversation's item, like a product card */}
            <div className="chat-item-card">
            <Link
              className="chat-item"
              to={selected.owner_id === user?.id
                ? `/map?workRequest=${selected.work_request_id}`
                : `/tyontarjoajat?workRequest=${selected.work_request_id}`}
            >
              <RequestThumb chat={selected} size="lg" />
              <span className="chat-item-text">
                <strong>{selected.title}</strong>
                <small>
                  {MARKING_TYPE_LABELS[selected.request_type ?? 'muu_tyo']}
                  {selected.request_area_ha ? `, ${formatArea(Number(selected.request_area_ha))}` : ''}
                  {selected.request_status === 'closed' ? ', suljettu' : ''}
                </small>
                {selected.request_target_price_eur != null && selected.pricing && (
                  <small>{TARGET_PRICE_LABEL[selected.pricing]}: {formatEuro(selected.request_target_price_eur)}</small>
                )}
              </span>
            </Link>
            {selected.bid_id && <div className="chat-offer-card">
              <div className="chat-offer-summary">
                <span className="chat-offer-label">Tarjous</span>
                <strong>{formatEuro(selected.bid_amount_eur)}</strong>
                <span className={`chat-offer-status ${selected.bid_status}`}>{selected.bid_status === 'accepted' ? 'Hyväksytty' : selected.bid_status === 'withdrawn' ? 'Peruttu' : 'Odottaa vastausta'}</span>
              </div>
              {selected.bid_status === 'pending' && selected.owner_id === user?.id && offerAction === null && <div className="chat-offer-actions">
                <button type="button" onClick={() => void acceptOffer()}>Hyväksy tarjous</button>
                <button type="button" className="secondary" onClick={() => setOfferAction('counter')}>Tee vastatarjous</button>
              </div>}
              {selected.bid_status === 'pending' && selected.provider_id === user?.id && offerAction === null && <div className="chat-offer-actions">
                <button type="button" className="secondary" onClick={() => { setOfferAction('edit'); setEditAmount(String(selected.bid_amount_eur ?? '')); }}>Muokkaa tarjousta</button>
                <button type="button" className="danger" onClick={() => setOfferAction('delete')}>Peru tarjous</button>
              </div>}
              {selected.bid_status === 'accepted' && offerAction !== 'cancel' && <div className="chat-offer-actions">
                <button type="button" className="danger" onClick={() => setOfferAction('cancel')}>Peru hyväksytty tarjous</button>
              </div>}
              {selected.bid_status === 'withdrawn' && (selected.provider_id === user?.id || selected.owner_id === user?.id) && offerAction !== 'new' && <div className="chat-offer-actions">
                <button type="button" onClick={() => setOfferAction('new')}>Tee uusi tarjous</button>
              </div>}
              {offerAction === 'edit' && <div className="chat-offer-edit">
                <input type="number" min="0.01" step="0.01" value={editAmount} onChange={(event) => setEditAmount(event.target.value)} />
                <button type="button" onClick={() => void updateOffer()}>Tallenna</button>
              </div>}
              {offerAction === 'delete' && <div className="chat-offer-edit">
                <span>Perutaanko tarjous?</span>
                <button type="button" className="danger" onClick={() => void deleteOffer()}>Kyllä</button>
                <button type="button" className="secondary" onClick={() => setOfferAction(null)}>Ei</button>
              </div>}
              {offerAction === 'counter' && <div className="chat-offer-edit">
                <input type="number" min="0.01" step="0.01" value={counterOffer} onChange={(event) => setCounterOffer(event.target.value)} placeholder="Vastatarjous €" />
                <button type="button" onClick={() => void sendCounterOffer()}>Lähetä vastatarjous</button>
                <button type="button" className="secondary" onClick={() => { setCounterOffer(''); setOfferAction(null); }}>Peruuta</button>
              </div>}
              {offerAction === 'cancel' && <div className="chat-offer-edit">
                <span>Perutaanko hyväksytty tarjous?</span>
                <button type="button" className="danger" onClick={() => void cancelOffer()}>Kyllä</button>
                <button type="button" className="secondary" onClick={() => setOfferAction(null)}>Ei</button>
              </div>}
              {offerAction === 'new' && <div className="chat-offer-edit">
                <input type="number" min="0.01" step="0.01" value={newOfferAmount} onChange={(event) => setNewOfferAmount(event.target.value)} placeholder="Uusi tarjous €" />
                <button type="button" onClick={() => void createNewOffer()}>Kyllä</button>
                <button type="button" className="secondary" onClick={() => { setNewOfferAmount(''); setOfferAction(null); }}>Ei</button>
              </div>}
            </div>}
            </div>
            <div ref={messagesRef} className="chat-messages">
              {messages.map((message, index) => {
                const newDay = index === 0 || dayKey(new Date(messages[index - 1].created_at)) !== dayKey(new Date(message.created_at));
                return (
                <Fragment key={message.id}>
                {newDay && <div className="chat-day" role="separator"><span>{dayLabel(message.created_at)}</span></div>}
                <article className={isOfferAcceptedMessage(message) ? `chat-system-message${isOfferCancelledMessage(message) ? ' chat-system-message-cancelled' : ''}` : message.sender_id === user?.id ? 'mine' : ''}>
                {message.body && <p>{message.body}</p>}
                {message.image_base64 && <img src={`data:${message.image_type};base64,${message.image_base64}`} alt="Chatissa lähetetty kuva" />}
                {message.counter_offer_eur !== null && <div className={`counter-offer ${message.counter_offer_status !== 'pending' ? 'inactive' : ''}`}>
                  <strong>Vastatarjous: {Number(message.counter_offer_eur).toLocaleString('fi-FI')} €</strong>
                  {message.counter_offer_status === 'pending' && message.sender_id !== user?.id && <div className="counter-offer-actions">
                    {(selected.bid_status === 'pending' || selected.bid_status === 'withdrawn') && <button type="button" onClick={async () => { await chatsService.acceptCounterOffer(Number(id), message.id); void loadMessages(Number(id)); }}>Hyväksy</button>}
                    <button type="button" className="danger" onClick={async () => { await chatsService.rejectCounterOffer(Number(id), message.id); void loadMessages(Number(id)); }}>Hylkää</button>
                    {(selected.bid_status === 'pending' || selected.bid_status === 'withdrawn') && <button
                      type="button"
                      className="secondary counter-offer-counter-button"
                      onClick={() => {
                        setCounterOfferMessageId(message.id);
                        setCounterOffer('');
                      }}
                    >
                      Tee vastatarjous
                    </button>}
                  </div>}
                  {message.counter_offer_status !== 'pending' && <span>{message.counter_offer_status === 'accepted' ? 'Hyväksytty' : message.counter_offer_status === 'withdrawn' ? 'Peruttu' : 'Ei voimassa'}</span>}
                  {counterOfferMessageId === message.id && (
                    <div className="counter-offer-reply">
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={counterOffer}
                        onChange={(event) => setCounterOffer(event.target.value)}
                        placeholder="Vastatarjous €"
                      />
                      <button type="button" onClick={() => void sendCounterOffer()}>Lähetä</button>
                      <button type="button" className="secondary" onClick={() => { setCounterOffer(''); setCounterOfferMessageId(null); }}>Peruuta</button>
                    </div>
                  )}
                </div>}
                <time dateTime={message.created_at} title={new Date(message.created_at).toLocaleString('fi-FI')}>
                  {clockTime(message.created_at)}
                </time>
              </article>
                </Fragment>
                );
              })}
            </div>
            <form className="chat-compose" onSubmit={(event) => void submit(event)}>
              <div className="chat-compose-row">
                <div className={`chat-compose-textarea ${image ? 'has-image' : ''}`}>
                  {image && <div className="chat-image-preview">
                    <img src={`data:${image.image_type};base64,${image.image_base64}`} alt="Lähetettävä kuva" />
                    <button type="button" onClick={removeImage} aria-label="Poista kuva" title="Poista kuva">×</button>
                  </div>}
                  <textarea
                    ref={composeRef}
                    value={body}
                    onChange={(event) => {
                      setBody(event.target.value);
                      resizeCompose(event.currentTarget);
                    }}
                    onInput={(event) => resizeCompose(event.currentTarget)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    style={{ height: '46px' }}
                    placeholder="Kirjoita viesti..."
                    aria-label="Kirjoita viesti"
                    maxLength={4000}
                  />
                </div>
                <label className="chat-file" aria-label="Liitä kuva" title="Liitä kuva">
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 7h3l1.5-2h7L17 7h3v12H4z" />
                    <circle cx="12" cy="13" r="3.5" />
                  </svg>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={(event) => void chooseImage(event)} />
                </label>
                <button type="submit" className="chat-send" aria-label="Lähetä viesti" title="Lähetä viesti">
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 2 11 13" />
                    <path d="m22 2-7 20-4-9-9-4Z" />
                  </svg>
                </button>
              </div>
            </form>
          </> : chats.length === 0
            ? (
              <div className="chat-empty-state chat-empty-card">
                <h2>Ei vielä keskusteluja</h2>
                <p>Keskustelu avautuu automaattisesti, kun</p>
                <ul>
                  <li>teet tarjouksen jonkun toisen julkaisemaan työpyyntöön.</li>
                  <li>joku tekee tarjouksen sinun julkaisemaasi työpyyntöön.</li>
                </ul>
              </div>
            )
            : <p className="chat-empty-state">Valitse keskustelu vasemmalta.</p>}
          {error && <p className="chat-error">{error}</p>}
        </section>
      </main>
    </div>
  );
}
