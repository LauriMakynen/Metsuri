import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authService } from '../services/forestService';
import { useAuth } from '../hooks/useAuth';
import axios from 'axios';

// Login page - authenticates existing users
export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, loginAsGuest } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await authService.login(email, password);
      login(data.token, data.user);
      navigate('/map');
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        if (!err.response) {
          setError('Ei yhteyttä palvelimeen. Tarkista, että backend on käynnissä.');
        } else {
          setError(err.response.data?.error || 'Kirjautuminen epäonnistui');
        }
      } else {
        setError('Kirjautuminen epäonnistui');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo">🌲</div>
        <h1 className="auth-title">Metsuri</h1>
        <h2 className="auth-subtitle">Kirjaudu sisään</h2>

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
              placeholder="Salasana"
              required
              autoComplete="current-password"
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Kirjaudutaan...' : 'Kirjaudu sisään'}
          </button>
        </form>

        <p className="auth-link">
          Ei vielä tiliä?{' '}
          <Link to="/register">Rekisteröidy</Link>
        </p>

        <div className="guest-divider">
          <span>tai</span>
        </div>

        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => { loginAsGuest(); navigate('/map'); }}
        >
          Jatka kirjautumatta
        </button>
      </div>
    </div>
  );
}
