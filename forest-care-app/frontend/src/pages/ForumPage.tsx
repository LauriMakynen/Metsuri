import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import TopNav from '../components/TopNav';
import SpruceForestBackdrop from '../components/SpruceForestBackdrop';
import { useAuth } from '../hooks/useAuth';
import { forumError, forumService } from '../services/forumService';
import type { ForumThread, ForumThreadSummary } from '../services/forumService';

const TITLE_MAX = 150;
const BODY_MAX = 5000;
const NAME_MAX = 40;

/** "tänään 14.05", "eilen", "3.11.2026" */
function formatWhen(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const time = date.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(now) - day(date)) / 86_400_000);
  if (days === 0) return `tänään ${time}`;
  if (days === 1) return `eilen ${time}`;
  return date.toLocaleDateString('fi-FI');
}

// Nickname shared by the new-thread and reply forms; prefilled from the last post
function useNickname(enabled: boolean): [string, (name: string) => void] {
  const [name, setName] = useState('');
  useEffect(() => {
    if (!enabled) return;
    forumService.getMyName().then((saved) => saved && setName((current) => current || saved)).catch(() => {});
  }, [enabled]);
  return [name, setName];
}

function LoginToWrite() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  return (
    <p className="forum-login">
      <button
        type="button"
        className="btn-link"
        onClick={() => {
          logout();
          navigate('/login');
        }}
      >
        Kirjaudu sisään
      </button>{' '}
      kirjoittaaksesi foorumille.
    </p>
  );
}

function ThreadList({ canWrite }: { canWrite: boolean }) {
  const navigate = useNavigate();
  const [threads, setThreads] = useState<ForumThreadSummary[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [name, setName] = useNickname(canWrite);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    forumService.getThreads().then(setThreads).catch(() => setLoadError('Keskustelujen lataaminen epäonnistui.'));
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError('');
    try {
      const id = await forumService.createThread({ title, body, author_name: name });
      navigate(`/foorumi/${id}`);
    } catch (err) {
      setError(forumError(err, 'Keskustelun aloittaminen epäonnistui.'));
      setSending(false);
    }
  };

  return (
    <>
      <div className="forum-toolbar">
        <h2 className="panel-title">💬 Keskustelut{threads ? ` (${threads.length})` : ''}</h2>
        {canWrite && !formOpen && (
          <button type="button" className="btn btn-primary btn-compact" onClick={() => setFormOpen(true)}>
            + Aloita keskustelu
          </button>
        )}
      </div>
      {!canWrite && <LoginToWrite />}

      {formOpen && (
        <form className="forum-form" onSubmit={submit}>
          <div className="form-group">
            <label htmlFor="forum-title">Otsikko</label>
            <input
              id="forum-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={TITLE_MAX}
              placeholder="esim. Kokemuksia ensiharvennuksen hinnoista?"
              autoFocus
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="forum-body">Viesti</label>
            <textarea
              id="forum-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={BODY_MAX}
              rows={5}
              required
            />
          </div>
          <div className="form-group forum-name">
            <label htmlFor="forum-name">Nimimerkki</label>
            <input
              id="forum-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={NAME_MAX}
              placeholder="näkyy viestin kirjoittajana"
              required
            />
            <small className="request-form-hint">Sähköpostiosoitettasi ei näytetä muille.</small>
          </div>
          {error && <div className="error-message" role="alert">{error}</div>}
          <div className="forum-form-actions">
            <button type="button" className="btn btn-secondary btn-compact" onClick={() => setFormOpen(false)} disabled={sending}>
              Peruuta
            </button>
            <button type="submit" className="btn btn-primary btn-compact" disabled={sending}>
              {sending ? 'Julkaistaan...' : 'Julkaise'}
            </button>
          </div>
        </form>
      )}

      {loadError && <div className="error-message" role="alert">{loadError}</div>}
      {threads === null && !loadError && <p role="status">Ladataan keskusteluja...</p>}
      {threads?.length === 0 && (
        <p className="forum-empty">Ei vielä keskusteluja. {canWrite ? 'Aloita ensimmäinen!' : ''}</p>
      )}
      <ul className="forum-threads">
        {threads?.map((thread) => (
          <li key={thread.id}>
            <Link to={`/foorumi/${thread.id}`} className="forum-thread">
              <strong>{thread.title}</strong>
              <span className="forum-preview">{thread.preview}</span>
              <span className="forum-meta">
                {thread.author_name} · {formatWhen(thread.created_at)} ·{' '}
                {thread.reply_count === 0 ? 'ei vastauksia' : thread.reply_count === 1 ? '1 vastaus' : `${thread.reply_count} vastausta`}
                {thread.reply_count > 0 ? ` · viimeisin ${formatWhen(thread.last_post_at)}` : ''}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

function ThreadView({ threadId, canWrite }: { threadId: number; canWrite: boolean }) {
  const navigate = useNavigate();
  const [thread, setThread] = useState<ForumThread | null>(null);
  const [loadError, setLoadError] = useState('');
  const [body, setBody] = useState('');
  const [name, setName] = useNickname(canWrite);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(() => {
    forumService
      .getThread(threadId)
      .then(setThread)
      .catch((err) => setLoadError(forumError(err, 'Keskustelun lataaminen epäonnistui.')));
  }, [threadId]);
  useEffect(load, [load]);

  const reply = async (e: FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError('');
    try {
      const post = await forumService.reply(threadId, { body, author_name: name });
      setThread((current) => (current ? { ...current, posts: [...current.posts, post] } : current));
      setBody('');
    } catch (err) {
      setError(forumError(err, 'Vastauksen lähetys epäonnistui.'));
    } finally {
      setSending(false);
    }
  };

  const remove = async (postId: number) => {
    if (!window.confirm('Poistetaanko viesti?')) return;
    setDeletingId(postId);
    try {
      const { thread_deleted } = await forumService.deletePost(postId);
      if (thread_deleted) navigate('/foorumi');
      else setThread((current) => (current ? { ...current, posts: current.posts.filter((p) => p.id !== postId) } : current));
    } catch (err) {
      setError(forumError(err, 'Viestin poisto epäonnistui.'));
    } finally {
      setDeletingId(null);
    }
  };

  if (loadError) {
    return (
      <>
        <div className="error-message" role="alert">{loadError}</div>
        <Link to="/foorumi" className="btn-link">← Kaikki keskustelut</Link>
      </>
    );
  }
  if (!thread) return <p role="status">Ladataan keskustelua...</p>;

  return (
    <>
      <Link to="/foorumi" className="btn-link forum-back">← Kaikki keskustelut</Link>
      <h2 className="forum-thread-title">{thread.title}</h2>
      <ol className="forum-posts">
        {thread.posts.map((post, i) => (
          <li key={post.id} className={`forum-post ${i === 0 ? 'first' : ''}`}>
            <div className="forum-post-head">
              <strong>{post.author_name}</strong>
              {post.is_own && <span className="forum-own">sinä</span>}
              <span className="forum-meta">{formatWhen(post.created_at)}</span>
              {post.is_own && (
                <button
                  type="button"
                  className="btn-link forum-delete"
                  onClick={() => remove(post.id)}
                  disabled={deletingId === post.id}
                >
                  {deletingId === post.id ? 'Poistetaan...' : 'Poista'}
                </button>
              )}
            </div>
            <p className="forum-body">{post.body}</p>
          </li>
        ))}
      </ol>

      {canWrite ? (
        <form className="forum-form" onSubmit={reply}>
          <div className="form-group">
            <label htmlFor="forum-reply">Vastaa</label>
            <textarea
              id="forum-reply"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={BODY_MAX}
              rows={4}
              required
            />
          </div>
          <div className="forum-form-row">
            <div className="form-group forum-name">
              <label htmlFor="forum-reply-name">Nimimerkki</label>
              <input
                id="forum-reply-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={NAME_MAX}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary btn-compact" disabled={sending}>
              {sending ? 'Lähetetään...' : 'Lähetä vastaus'}
            </button>
          </div>
          {error && <div className="error-message" role="alert">{error}</div>}
        </form>
      ) : (
        <LoginToWrite />
      )}
    </>
  );
}

// Forum: a simple discussion board for forest owners and work providers
export default function ForumPage() {
  const { id } = useParams();
  const { isAuthenticated, isGuest } = useAuth();
  const canWrite = isAuthenticated && !isGuest;
  const threadId = id && /^\d+$/.test(id) ? Number(id) : null;

  return (
    <div className="start-page forest-page">
      <SpruceForestBackdrop />
      <TopNav />
      <main className="start-content forest-content forum-content">
        <header className="forest-hero">
          <p className="forest-eyebrow">💬 Foorumi</p>
          <h1>Keskustele metsästä</h1>
          <p>Kysy neuvoa, jaa kokemuksia ja vaihda vinkkejä muiden metsänomistajien ja tekijöiden kanssa.</p>
        </header>
        <section className="glass-panel forum-panel">
          {threadId !== null ? <ThreadView threadId={threadId} canWrite={canWrite} /> : <ThreadList canWrite={canWrite} />}
        </section>
      </main>
    </div>
  );
}
