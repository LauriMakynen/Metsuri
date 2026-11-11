import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import TopNav from '../components/TopNav';
import SpruceForestBackdrop from '../components/SpruceForestBackdrop';
import ForumModerationPanel from '../components/ForumModerationPanel';
import { useAuth } from '../hooks/useAuth';
import { forumError, forumService } from '../services/forumService';
import type { ForumMe, ForumReportReason, ForumThread, ForumThreadSummary } from '../services/forumService';

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
function useNickname(initialName: string | null): [string, (name: string) => void] {
  return useState(initialName ?? '');
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

function ThreadList({
  canWrite,
  canReport,
  initialName,
}: {
  canWrite: boolean;
  canReport: boolean;
  initialName: string | null;
}) {
  const navigate = useNavigate();
  const [threads, setThreads] = useState<ForumThreadSummary[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [name, setName] = useNickname(initialName);
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
      {!canWrite && !canReport && <LoginToWrite />}

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

function ThreadView({
  threadId,
  canWrite,
  canReport,
  initialName,
}: {
  threadId: number;
  canWrite: boolean;
  canReport: boolean;
  initialName: string | null;
}) {
  const navigate = useNavigate();
  const [thread, setThread] = useState<ForumThread | null>(null);
  const [loadError, setLoadError] = useState('');
  const [body, setBody] = useState('');
  const [name, setName] = useNickname(initialName);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [reportingId, setReportingId] = useState<number | null>(null);
  const [reportReason, setReportReason] = useState<ForumReportReason>('abusive_language');
  const [reportNote, setReportNote] = useState('');
  const [reporting, setReporting] = useState(false);
  const [reportError, setReportError] = useState('');
  const [reportSuccess, setReportSuccess] = useState('');
  const [reportedPostIds, setReportedPostIds] = useState<Set<number>>(() => new Set());

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

  const submitReport = async (event: FormEvent, postId: number) => {
    event.preventDefault();
    setReporting(true);
    setReportError('');
    setReportSuccess('');
    try {
      await forumService.reportPost(postId, { reason: reportReason, note: reportNote });
      setReportedPostIds((current) => new Set(current).add(postId));
      setReportingId(null);
      setReportNote('');
      setReportSuccess('Kiitos, ilmoitus vastaanotettu');
    } catch (reportSubmitError) {
      setReportError(forumError(reportSubmitError, 'Ilmoituksen lähettäminen epäonnistui.'));
    } finally {
      setReporting(false);
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
              {post.is_own && !post.is_hidden && !post.is_deleted && (
                <button
                  type="button"
                  className="btn-link forum-delete"
                  onClick={() => remove(post.id)}
                  disabled={deletingId === post.id}
                >
                  {deletingId === post.id ? 'Poistetaan...' : 'Poista'}
                </button>
              )}
              {post.is_own && post.is_hidden && <span className="forum-hidden-label">Piilotettu ilmoitusten vuoksi</span>}
              {!post.is_own && !post.is_deleted && canReport && (post.has_reported || reportedPostIds.has(post.id)) && (
                <span className="forum-reported-label">Ilmoitettu</span>
              )}
              {!post.is_own && !post.is_deleted && canReport && !post.has_reported && !reportedPostIds.has(post.id) && (
                <button
                  type="button"
                  className="btn-link forum-report-link"
                  onClick={() => {
                    setReportingId((current) => current === post.id ? null : post.id);
                    setReportError('');
                    setReportSuccess('');
                  }}
                >
                  Ilmoita
                </button>
              )}
              {!post.is_own && !post.is_deleted && !canReport && (
                <Link to="/login" className="btn-link forum-report-link">Ilmoita</Link>
              )}
            </div>
            <p className="forum-body">{post.body}</p>
            {reportingId === post.id && canReport && (
              <form className="forum-report-form" onSubmit={(event) => submitReport(event, post.id)}>
                <div className="form-group">
                  <label htmlFor={`forum-report-reason-${post.id}`}>Ilmoituksen syy</label>
                  <select
                    id={`forum-report-reason-${post.id}`}
                    value={reportReason}
                    onChange={(event) => setReportReason(event.target.value as ForumReportReason)}
                  >
                    <option value="abusive_language">Asiaton kielenkäyttö</option>
                    <option value="harassment">Häirintä</option>
                    <option value="spam">Mainos/roskaposti</option>
                    <option value="personal_information">Henkilötiedot</option>
                    <option value="other">Muu</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor={`forum-report-note-${post.id}`}>Lisätieto (valinnainen)</label>
                  <textarea
                    id={`forum-report-note-${post.id}`}
                    value={reportNote}
                    onChange={(event) => setReportNote(event.target.value)}
                    maxLength={1000}
                    rows={3}
                  />
                </div>
                {reportError && <div className="error-message" role="alert">{reportError}</div>}
                <div className="forum-form-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-compact"
                    onClick={() => setReportingId(null)}
                    disabled={reporting}
                  >
                    Peruuta
                  </button>
                  <button type="submit" className="btn btn-primary btn-compact" disabled={reporting}>
                    {reporting ? 'Lähetetään...' : 'Lähetä ilmoitus'}
                  </button>
                </div>
              </form>
            )}
          </li>
        ))}
      </ol>
      {reportSuccess && <p className="forum-report-success" role="status">{reportSuccess}</p>}

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
        !canReport && <LoginToWrite />
      )}
    </>
  );
}

// Forum: a simple discussion board for forest owners and work providers
export default function ForumPage() {
  const { id } = useParams();
  const { isAuthenticated, isGuest } = useAuth();
  const [account, setAccount] = useState<ForumMe | null>(null);
  const [accountError, setAccountError] = useState('');
  const [rulesOpen, setRulesOpen] = useState(false);
  useEffect(() => {
    if (!isAuthenticated || isGuest) return;
    let active = true;
    forumService.getMe()
      .then((me) => {
        if (!active) return;
        setAccount(me);
        setAccountError('');
      })
      .catch((error: unknown) => {
        if (active) setAccountError(forumError(error, 'Käyttäjätietojen hakeminen epäonnistui.'));
      });
    return () => {
      active = false;
    };
  }, [isAuthenticated, isGuest]);

  const currentAccount = isAuthenticated && !isGuest ? account : null;
  const canWrite = isAuthenticated && !isGuest && currentAccount?.forum_banned !== true;
  const canReport = isAuthenticated && !isGuest;
  const isModerationPage = id === 'moderointi';
  const threadId = id && /^\d+$/.test(id) ? Number(id) : null;
  const accountPending = isAuthenticated && !isGuest && currentAccount === null && !accountError;

  return (
    <div className="start-page forest-page">
      <SpruceForestBackdrop />
      <TopNav />
      <main className="start-content forest-content forum-content">
        <header className="forest-hero">
          <p className="forest-eyebrow">💬 Foorumi</p>
          <h1>Keskustele metsästä</h1>
          <p>Kysy neuvoa, jaa kokemuksia ja vaihda vinkkejä muiden metsänomistajien ja tekijöiden kanssa.</p>
          <div className="forum-header-actions">
            <button
              type="button"
              className="btn btn-secondary btn-compact"
              aria-expanded={rulesOpen}
              aria-controls="forum-rules"
              onClick={() => setRulesOpen((open) => !open)}
            >
              {rulesOpen ? 'Sulje säännöt ja käyttöehdot' : 'Säännöt ja käyttöehdot'}
            </button>
            {currentAccount?.role === 'admin' && (
              <Link to={isModerationPage ? '/foorumi' : '/foorumi/moderointi'} className="btn btn-secondary btn-compact">
                {isModerationPage ? 'Takaisin foorumille' : 'Ylläpito'}
              </Link>
            )}
          </div>
          {rulesOpen && (
            <div className="forum-rules" id="forum-rules">
              <h2>Foorumin käyttöehdot ja säännöt</h2>
              <ul>
                <li>Keskustele asiallisesti ja kunnioita muita käyttäjiä.</li>
                <li>Älä häiritse, uhkaile tai julkaise mainoksia tai roskapostia.</li>
                <li>Älä julkaise omia tai muiden henkilötietoja.</li>
                <li>Ilmoita asiattomasta sisällöstä ylläpidolle.</li>
                <li>Ylläpito voi poistaa sääntöjen vastaista sisältöä ja estää foorumille kirjoittamisen.</li>
              </ul>
            </div>
          )}
        </header>
        <section className="glass-panel forum-panel">
          {accountError && <div className="error-message" role="alert">{accountError}</div>}
          {currentAccount?.forum_banned && <p className="forum-ban-notice">Kirjoitusoikeutesi foorumille on estetty.</p>}
          {accountPending ? (
            <p role="status">Ladataan käyttäjätietoja...</p>
          ) : isModerationPage ? (
            currentAccount?.role === 'admin' ? <ForumModerationPanel /> : <div className="error-message" role="alert">Tämä näkymä on vain ylläpidolle.</div>
          ) : threadId !== null ? (
            <ThreadView
              threadId={threadId}
              canWrite={canWrite}
              canReport={canReport}
              initialName={currentAccount?.display_name ?? null}
            />
          ) : (
            <ThreadList canWrite={canWrite} canReport={canReport} initialName={currentAccount?.display_name ?? null} />
          )}
        </section>
      </main>
    </div>
  );
}
