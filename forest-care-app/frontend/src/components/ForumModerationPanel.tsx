import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { forumError, forumService } from '../services/forumService';
import type { ForumModerationReport, ForumReportReason } from '../services/forumService';

const REASON_LABELS: Record<ForumReportReason, string> = {
  abusive_language: 'Asiaton kielenkäyttö',
  harassment: 'Häirintä',
  spam: 'Mainos/roskaposti',
  personal_information: 'Henkilötiedot',
  other: 'Muu',
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('fi-FI');
}

export default function ForumModerationPanel() {
  const [reports, setReports] = useState<ForumModerationReport[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const loadReports = useCallback(() => forumService.getModerationReports(), []);
  useEffect(() => {
    let active = true;
    loadReports()
      .then((openReports) => {
        if (active) setReports(openReports);
      })
      .catch((error: unknown) => {
        if (active) setLoadError(forumError(error, 'Ilmoitusten lataaminen epäonnistui.'));
      });
    return () => {
      active = false;
    };
  }, [loadReports]);

  const updateReports = async (
    key: string,
    action: () => Promise<void>,
    update: (current: ForumModerationReport[]) => ForumModerationReport[],
    fallback: string
  ) => {
    setBusyAction(key);
    setActionError('');
    try {
      await action();
      setReports((current) => current && update(current));
    } catch (error) {
      setActionError(forumError(error, fallback));
    } finally {
      setBusyAction(null);
    }
  };

  const resolve = (report: ForumModerationReport) => {
    void updateReports(
      `resolve-${report.post_id}`,
      () => forumService.resolveReports(report.post_id),
      (current) => current.filter((entry) => entry.post_id !== report.post_id),
      'Ilmoitusten käsittely epäonnistui.'
    );
  };

  const removePost = (report: ForumModerationReport) => {
    if (!window.confirm('Poistetaanko viesti ylläpidon toimesta?')) return;
    void updateReports(
      `post-${report.post_id}`,
      () => forumService.removePostAsAdmin(report.post_id),
      (current) => current.filter((entry) => entry.post_id !== report.post_id),
      'Viestin poistaminen epäonnistui.'
    );
  };

  const removeThread = (report: ForumModerationReport) => {
    if (!window.confirm(`Poistetaanko koko keskustelu "${report.thread_title}"?`)) return;
    void updateReports(
      `thread-${report.thread_id}`,
      () => forumService.removeThreadAsAdmin(report.thread_id),
      (current) => current.filter((entry) => entry.thread_id !== report.thread_id),
      'Keskustelun poistaminen epäonnistui.'
    );
  };

  const toggleBan = (report: ForumModerationReport) => {
    if (report.author_user_id === null) return;
    const userId = report.author_user_id;
    const banned = !report.author_banned;
    void updateReports(
      `ban-${userId}`,
      async () => {
        await forumService.setForumBan(userId, banned);
      },
      (current) => current.map((entry) =>
        entry.author_user_id === userId ? { ...entry, author_banned: banned } : entry
      ),
      'Kirjoitusoikeuden päivitys epäonnistui.'
    );
  };

  return (
    <section className="forum-moderation" aria-labelledby="forum-moderation-title">
      <div className="forum-toolbar">
        <h2 className="panel-title" id="forum-moderation-title">Avoimet ilmoitukset</h2>
        <Link to="/foorumi" className="btn-link">← Foorumille</Link>
      </div>
      <p className="forum-moderation-note">Ilmoittajien henkilöllisyyttä ei näytetä.</p>
      {loadError && <div className="error-message" role="alert">{loadError}</div>}
      {actionError && <div className="error-message" role="alert">{actionError}</div>}
      {reports === null && !loadError && <p role="status">Ladataan ilmoituksia...</p>}
      {reports?.length === 0 && <p className="forum-empty">Ei avoimia ilmoituksia.</p>}
      {reports && reports.length > 0 && (
        <ul className="forum-moderation-list">
          {reports.map((report) => (
            <li className="forum-moderation-card" key={report.post_id}>
              <div className="forum-toolbar">
                <strong>{report.report_count} ilmoitusta · {report.author_name}</strong>
                <span className="forum-meta">Viesti {formatWhen(report.created_at)}</span>
              </div>
              <p className="forum-moderation-thread">
                Keskustelu: <Link to={`/foorumi/${report.thread_id}`}>{report.thread_title}</Link>
              </p>
              <p className="forum-body">{report.body}</p>
              <ul className="forum-report-reasons">
                {report.reports.map((item, index) => (
                  <li key={`${report.post_id}-${item.created_at}-${index}`}>
                    <strong>{REASON_LABELS[item.reason]}</strong>
                    {item.note && <p>{item.note}</p>}
                  </li>
                ))}
              </ul>
              <div className="forum-moderation-actions">
                {report.author_user_id !== null && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-compact"
                    onClick={() => toggleBan(report)}
                    disabled={busyAction === `ban-${report.author_user_id}`}
                  >
                    {report.author_banned ? 'Salli kirjoittaminen' : 'Estä kirjoittaminen'}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-secondary btn-compact"
                  onClick={() => resolve(report)}
                  disabled={busyAction === `resolve-${report.post_id}`}
                >
                  Ei toimenpiteitä
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-compact"
                  onClick={() => removePost(report)}
                  disabled={busyAction === `post-${report.post_id}`}
                >
                  Poista viesti
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-compact"
                  onClick={() => removeThread(report)}
                  disabled={busyAction === `thread-${report.thread_id}`}
                >
                  Poista keskustelu
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
