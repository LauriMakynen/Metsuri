import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authService } from '../services/forestService';
import { useAuth } from '../hooks/useAuth';

// Step 2 of password reset: opened from the emailed link, sets the new password
export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { logout } = useAuth();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [doneMessage, setDoneMessage] = useState('');
  const [error, setError] = useState('');
  const [tokenInvalid, setTokenInvalid] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setTokenInvalid(false);
    if (password.length < 8) {
      setError('Salasanan pitää olla vähintään 8 merkkiä');
      return;
    }
    if (password !== confirm) {
      setError('Salasanat eivät täsmää');
      return;
    }
    setLoading(true);
    try {
      const message = await authService.resetPassword(token, password);
      // Old sessions are invalid now; clear any stored login on this device too
      logout();
      setDoneMessage(message);
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { error?: string; code?: string } } }).response?.data;
      setTokenInvalid(data?.code === 'token_invalid');
      setError(data?.error || 'Salasanan vaihto epäonnistui');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo">🔑</div>
        <h1 className="auth-title">Uusi salasana</h1>

        {!token ? (
          <>
            <div className="error-message">Linkki on virheellinen. Pyydä uusi linkki.</div>
            <p className="auth-link"><Link to="/forgot-password">Pyydä uusi linkki</Link></p>
          </>
        ) : doneMessage ? (
          <>
            <div className="success-message">
              <strong>✅ Salasana vaihdettu</strong>
              <p>{doneMessage}</p>
            </div>
            <Link to="/login" className="btn btn-primary">Kirjaudu sisään</Link>
          </>
        ) : (
          <>
            <h2 className="auth-subtitle">Kirjoita uusi salasana kahdesti.</h2>

            {error && (
              <div className="error-message">
                {error}
                {tokenInvalid && (
                  <> <Link to="/forgot-password">Pyydä uusi linkki</Link></>
                )}
              </div>
            )}

            <form onSubmit={handleSubmit} className="auth-form">
              <div className="form-group">
                <label htmlFor="password">Uusi salasana</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Vähintään 8 merkkiä"
                  minLength={8}
                  required
                  autoComplete="new-password"
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label htmlFor="confirm">Uusi salasana uudelleen</label>
                <input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  minLength={8}
                  required
                  autoComplete="new-password"
                />
              </div>

              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Tallennetaan...' : 'Vaihda salasana'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
