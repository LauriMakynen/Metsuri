import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { authService } from '../services/forestService';
import { AuthBackdrop } from '../components/VideoBackdrop';

// Step 1 of password reset: ask for the email address and send a reset link
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sentMessage, setSentMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      setSentMessage(await authService.forgotPassword(email));
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      setError(message || 'Linkin lähetys epäonnistui. Yritä hetken kuluttua uudelleen.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <AuthBackdrop />
      <div className="auth-card">
        <div className="auth-logo">🔑</div>
        <h1 className="auth-title">Salasana unohtunut?</h1>

        {sentMessage ? (
          <>
            <div className="success-message">
              <strong>📧 Tarkista sähköpostisi</strong>
              <p>{sentMessage}</p>
              <p>Linkki on voimassa 30 minuuttia. Katso tarvittaessa myös roskapostikansio.</p>
            </div>
            <p className="auth-link">
              <Link to="/login">← Takaisin kirjautumiseen</Link>
            </p>
          </>
        ) : (
          <>
            <h2 className="auth-subtitle">Lähetämme sähköpostiisi linkin, jolla voit asettaa uuden salasanan.</h2>

            {error && <div className="error-message">{error}</div>}

            <form onSubmit={handleSubmit} className="auth-form">
              <div className="form-group">
                <label htmlFor="email">Sähköposti</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nimi@esimerkki.fi"
                  required
                  autoComplete="email"
                  autoFocus
                />
              </div>

              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Lähetetään...' : 'Lähetä linkki'}
              </button>
            </form>

            <p className="auth-link">
              Muistitko sittenkin? <Link to="/login">Kirjaudu sisään</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
