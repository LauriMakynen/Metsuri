import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { LayoutList, MessageSquare, Plus, ScrollText, Search, ShieldCheck, UserRound } from 'lucide-react';
import TopNav from '../components/TopNav';
import Avatar from '../components/Avatar';
import SpruceForestBackdrop from '../components/SpruceForestBackdrop';
import ForumModerationPanel from '../components/ForumModerationPanel';
import { useAuth } from '../hooks/useAuth';
import { forumError, forumService } from '../services/forumService';
import type {
  ForumCategory,
  ForumMe,
  ForumReportReason,
  ForumSort,
  ForumStats,
  ForumThread,
  ForumThreadSummary,
} from '../services/forumService';
import { FORUM_CATEGORIES, forumCategory } from '../utils/forumCategories';

const TITLE_MAX = 150;
const BODY_MAX = 5000;
const NAME_MAX = 40;

const SORTS: { value: ForumSort; label: string }[] = [
  { value: 'active', label: 'Viimeisin aktiivisuus' },
  { value: 'new', label: 'Uusimmat' },
  { value: 'replies', label: 'Eniten vastauksia' },
];

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

function replyText(count: number): string {
  return count === 0 ? 'Ei vastauksia' : count === 1 ? '1 vastaus' : `${count} vastausta`;
}

// Nickname shared by the new-thread and reply forms; prefilled from the last post
function useNickname(initialName: string | null): [string, (name: string) => void] {
  return useState(initialName ?? '');
}

function CategoryChip({ value }: { value: ForumCategory }) {
  const category = forumCategory(value);
  if (!category) return null;
  const { Icon, label, tone } = category;
  return (
    <span className="forum-chip" style={{ ['--chip-tone' as string]: tone }}>
      <Icon size={14} aria-hidden="true" />
      {label}
    </span>
  );
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

/** Left column: new discussion, categories with counts, most active writers, rules */
function ForumSidebar({
  stats,
  canWrite,
  signedIn,
  isAdmin,
  isModerationPage,
  rulesOpen,
  onToggleRules,
}: {
  stats: ForumStats | null;
  canWrite: boolean;
  signedIn: boolean;
  isAdmin: boolean;
  isModerationPage: boolean;
  rulesOpen: boolean;
  onToggleRules: () => void;
}) {
  const [searchParams] = useSearchParams();
  const { id } = useParams();
  const onList = !id;
  const active = onList ? searchParams.get('aihe') : null;
  const ownActive = onList && searchParams.get('omat') === '1';
  const total = stats ? Object.values(stats.categories).reduce((sum, n) => sum + (n ?? 0), 0) : null;

  return (
    <aside className="forum-sidebar">
      {canWrite && (
        <Link to="/foorumi?uusi=1" className="btn btn-primary forum-new-btn">
          <Plus size={18} aria-hidden="true" /> Aloita keskustelu
        </Link>
      )}

      <nav className="forum-card forum-categories" aria-label="Aihealueet">
        <Link
          to="/foorumi"
          className={onList && !active && !ownActive ? 'active' : ''}
          aria-current={onList && !active && !ownActive ? 'page' : undefined}
        >
          <LayoutList size={18} aria-hidden="true" />
          <span>Kaikki keskustelut</span>
          {total !== null && <small>{total}</small>}
        </Link>
        {FORUM_CATEGORIES.map(({ value, label, Icon, tone }) => (
          <Link
            key={value}
            to={`/foorumi?aihe=${value}`}
            className={active === value ? 'active' : ''}
            aria-current={active === value ? 'page' : undefined}
            style={{ ['--chip-tone' as string]: tone }}
          >
            <Icon size={18} aria-hidden="true" />
            <span>{label}</span>
            {stats && <small>{stats.categories[value] ?? 0}</small>}
          </Link>
        ))}
        {signedIn && (
          <Link to="/foorumi?omat=1" className={`forum-categories-own ${ownActive ? 'active' : ''}`}>
            <UserRound size={18} aria-hidden="true" />
            <span>Omat keskustelut</span>
          </Link>
        )}
      </nav>

      {stats && stats.top_writers.length > 0 && (
        <section className="forum-card forum-writers">
          <h2>Aktiivisimmat</h2>
          <p className="forum-writers-sub">viimeisen 30 päivän viestit</p>
          <ol>
            {stats.top_writers.map((writer) => (
              <li key={writer.author_name}>
                <Avatar name={writer.author_name} size="md" />
                <span>
                  <strong>{writer.author_name}</strong>
                  <small>
                    <MessageSquare size={12} aria-hidden="true" />{' '}
                    {writer.post_count === 1 ? '1 viesti' : `${writer.post_count} viestiä`}
                  </small>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="forum-card forum-side-links">
        <button type="button" className="forum-side-link" aria-expanded={rulesOpen} aria-controls="forum-rules" onClick={onToggleRules}>
          <ScrollText size={18} aria-hidden="true" /> Säännöt ja käyttöehdot
        </button>
        {isAdmin && (
          <Link to={isModerationPage ? '/foorumi' : '/foorumi/moderointi'} className="forum-side-link">
            <ShieldCheck size={18} aria-hidden="true" /> {isModerationPage ? 'Takaisin foorumille' : 'Ylläpito'}
          </Link>
        )}
      </div>
    </aside>
  );
}

function NewThreadForm({ initialName, initialCategory, onDone }: {
  initialName: string | null;
  initialCategory: ForumCategory | null;
  onDone: () => void;
}) {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<ForumCategory>(initialCategory ?? 'metsanhoito');
  const [name, setName] = useNickname(initialName);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError('');
    try {
      const id = await forumService.createThread({ title, body, author_name: name, category });
      navigate(`/foorumi/${id}`);
    } catch (err) {
      setError(forumError(err, 'Keskustelun aloittaminen epäonnistui.'));
      setSending(false);
    }
  };

  return (
    <form className="forum-card forum-form" onSubmit={submit}>
      <h2 className="forum-form-title">Aloita keskustelu</h2>
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
      <fieldset className="forum-category-pick">
        <legend>Aihealue</legend>
        {FORUM_CATEGORIES.map(({ value, label, Icon, tone }) => (
          <label key={value} className={category === value ? 'active' : ''} style={{ ['--chip-tone' as string]: tone }}>
            <input type="radio" name="forum-category" value={value} checked={category === value} onChange={() => setCategory(value)} />
            <Icon size={15} aria-hidden="true" /> {label}
          </label>
        ))}
      </fieldset>
      <div className="form-group">
        <label htmlFor="forum-body">Viesti</label>
        <textarea id="forum-body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={BODY_MAX} rows={5} required />
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
        <button type="button" className="btn btn-secondary btn-compact" onClick={onDone} disabled={sending}>
          Peruuta
        </button>
        <button type="submit" className="btn btn-primary btn-compact" disabled={sending}>
          {sending ? 'Julkaistaan...' : 'Julkaise'}
        </button>
      </div>
    </form>
  );
}

function ThreadList({ canWrite, canReport, initialName }: { canWrite: boolean; canReport: boolean; initialName: string | null }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const category = forumCategory(searchParams.get('aihe'))?.value ?? null;
  const own = searchParams.get('omat') === '1';
  const sort = (SORTS.find((s) => s.value === searchParams.get('jarjestys'))?.value ?? 'active') as ForumSort;
  const query = searchParams.get('haku') ?? '';
  const formOpen = canWrite && searchParams.get('uusi') === '1';
  const [searchText, setSearchText] = useState(query);
  const [threads, setThreads] = useState<ForumThreadSummary[] | null>(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active = true;
    forumService
      .getThreads({ category, q: query, sort, own })
      .then((list) => active && setThreads(list))
      .catch(() => active && setLoadError('Keskustelujen lataaminen epäonnistui.'));
    return () => {
      active = false;
    };
  }, [category, query, sort, own]);

  // Changes one URL parameter, keeping the rest (category, sort, search)
  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  };

  const heading = own ? 'Omat keskustelut' : forumCategory(category)?.label ?? 'Kaikki keskustelut';

  return (
    <>
      {formOpen && <NewThreadForm initialName={initialName} initialCategory={category} onDone={() => setParam('uusi', null)} />}
      {!canWrite && !canReport && <LoginToWrite />}

      <div className="forum-card forum-toolbar">
        <form
          className="forum-search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            setParam('haku', searchText.trim() || null);
          }}
        >
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value);
              if (!e.target.value) setParam('haku', null);
            }}
            placeholder="Hae keskusteluista"
            aria-label="Hae keskusteluista"
          />
          <button type="submit" className="btn btn-primary btn-compact">Hae</button>
        </form>
        <div className="forum-sorts" role="group" aria-label="Järjestys">
          {SORTS.map((s) => (
            <button
              key={s.value}
              type="button"
              className={sort === s.value ? 'active' : ''}
              aria-pressed={sort === s.value}
              onClick={() => setParam('jarjestys', s.value === 'active' ? null : s.value)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <h2 className="forum-list-heading">
        {heading}
        {threads && <span>{threads.length}</span>}
        {query && <small>haku: “{query}”</small>}
      </h2>

      {loadError && <div className="error-message" role="alert">{loadError}</div>}
      {threads === null && !loadError && <p role="status">Ladataan keskusteluja...</p>}
      {threads?.length === 0 && (
        <p className="forum-card forum-empty">
          {query ? 'Haulla ei löytynyt keskusteluja.' : 'Täällä ei ole vielä keskusteluja.'}{' '}
          {canWrite && !query && <Link to={`/foorumi?uusi=1${category ? `&aihe=${category}` : ''}`}>Aloita ensimmäinen</Link>}
        </p>
      )}
      <ul className="forum-threads">
        {threads?.map((thread) => (
          <li key={thread.id}>
            <Link to={`/foorumi/${thread.id}`} className="forum-card forum-thread">
              <Avatar name={thread.author_name} size="lg" />
              <span className="forum-thread-main">
                <span className="forum-thread-top">
                  <strong>{thread.title}</strong>
                  <CategoryChip value={thread.category} />
                </span>
                <span className="forum-thread-byline">
                  <span className="forum-author">{thread.author_name}</span>
                  <span>{formatWhen(thread.created_at)}</span>
                </span>
                <span className="forum-preview">{thread.preview}</span>
              </span>
              <span className="forum-thread-stats" title={thread.reply_count > 0 ? `Viimeisin ${formatWhen(thread.last_post_at)}` : undefined}>
                <MessageSquare size={16} aria-hidden="true" />
                <span>{thread.reply_count}</span>
                <span className="sr-only">{replyText(thread.reply_count)}</span>
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
      <header className="forum-card forum-thread-header">
        <CategoryChip value={thread.category} />
        <h2 className="forum-thread-title">{thread.title}</h2>
        <small>{replyText(Math.max(0, thread.posts.length - 1))}</small>
      </header>
      <ol className="forum-posts">
        {thread.posts.map((post, i) => (
          <li key={post.id} className={`forum-card forum-post ${i === 0 ? 'first' : ''}`}>
            <Avatar name={post.author_name} size="md" />
            <div className="forum-post-content">
            <div className="forum-post-head">
              <strong>{post.author_name}</strong>
              {post.is_own && <span className="forum-own">sinä</span>}
              {i === 0 && <span className="forum-starter">aloittaja</span>}
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
            </div>
          </li>
        ))}
      </ol>
      {reportSuccess && <p className="forum-report-success" role="status">{reportSuccess}</p>}

      {canWrite ? (
        <form className="forum-card forum-form" onSubmit={reply}>
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

// Forum: discussion board for forest owners and work providers, by category
export default function ForumPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { isAuthenticated } = useAuth();
  const [account, setAccount] = useState<ForumMe | null>(null);
  const [accountError, setAccountError] = useState('');
  const [rulesOpen, setRulesOpen] = useState(false);
  const [stats, setStats] = useState<ForumStats | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
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
  }, [isAuthenticated]);

  // Category counts and top writers; refreshed when moving between discussions
  useEffect(() => {
    let active = true;
    forumService.getStats().then((s) => active && setStats(s)).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [id]);

  const currentAccount = isAuthenticated ? account : null;
  const canWrite = isAuthenticated && currentAccount?.forum_banned !== true;
  const canReport = isAuthenticated;
  const isModerationPage = id === 'moderointi';
  const threadId = id && /^\d+$/.test(id) ? Number(id) : null;
  const accountPending = isAuthenticated && currentAccount === null && !accountError;

  return (
    <div className="start-page forest-page">
      <SpruceForestBackdrop />
      <TopNav />
      <main className="start-content forest-content forum-content">
        <header className="forest-hero forum-hero">
          <p className="forest-eyebrow">Foorumi</p>
          <h1>Keskustele metsästä</h1>
          <p>Kysy neuvoa, jaa kokemuksia ja vaihda vinkkejä muiden metsänomistajien ja tekijöiden kanssa.</p>
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
        <div className="forum-layout">
          <ForumSidebar
            stats={stats}
            canWrite={canWrite}
            signedIn={canReport}
            isAdmin={currentAccount?.role === 'admin'}
            isModerationPage={isModerationPage}
            rulesOpen={rulesOpen}
            onToggleRules={() => setRulesOpen((open) => !open)}
          />
          <section className="forum-main">
            {accountError && <div className="error-message" role="alert">{accountError}</div>}
            {currentAccount?.forum_banned && <p className="forum-ban-notice">Kirjoitusoikeutesi foorumille on estetty.</p>}
            {accountPending ? (
              <p role="status">Ladataan käyttäjätietoja...</p>
            ) : isModerationPage ? (
              currentAccount?.role === 'admin'
                ? <div className="forum-card"><ForumModerationPanel /></div>
                : <div className="error-message" role="alert">Tämä näkymä on vain ylläpidolle.</div>
            ) : threadId !== null ? (
              <ThreadView
                threadId={threadId}
                canWrite={canWrite}
                canReport={canReport}
                initialName={currentAccount?.display_name ?? null}
              />
            ) : (
              // Keyed by the search so the search box follows the URL (e.g. a category link clears it)
              <ThreadList
                key={searchParams.get('haku') ?? ''}
                canWrite={canWrite}
                canReport={canReport}
                initialName={currentAccount?.display_name ?? null}
              />
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
