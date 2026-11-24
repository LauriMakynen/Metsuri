import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authService } from '../services/forestService';
import { useAuth } from '../hooks/useAuth';
import { AuthBackdrop } from '../components/VideoBackdrop';

// Registration page - allows new users to create an account
export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await authService.register(email, password);
      login(data.token, data.user);
      // A new account has no forests yet: ask for them right away (skippable)
      navigate('/lisaa-metsa');
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      setError(message || 'Rekisteröinti epäonnistui');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <AuthBackdrop />
      <div className="auth-card">
        <img className="auth-logo-image" src="/media/metsuri-logo.png" alt="Metsuri" />
        <h2 className="auth-subtitle">Luo tili</h2>

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
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Salasana</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Vähintään 8 merkkiä"
              minLength={8}
              required
              autoComplete="new-password"
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Luodaan tiliä...' : 'Rekisteröidy'}
          </button>
        </form>

        <p className="auth-link">
          Onko sinulla jo tili?{' '}
          <Link to="/login">Kirjaudu sisään</Link>
        </p>
      </div>
    </div>
  );
}
