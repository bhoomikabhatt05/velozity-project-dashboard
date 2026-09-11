import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useNavigate } from 'react-router-dom';

export function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('admin@velozity.local');
  const [password, setPassword] = useState('Password123!');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      nav('/');
    } catch {
      setError('Invalid email or password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <span className="brand-logo-lg">⚡</span>
          <h1 className="login-title">Velozity</h1>
          <p className="login-subtitle">Project management dashboard</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <div className="field-group">
            <label htmlFor="email" className="field-label">Email address</label>
            <input
              id="email"
              type="email"
              className="field-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
              disabled={loading}
            />
          </div>

          <div className="field-group">
            <label htmlFor="password" className="field-label">Password</label>
            <input
              id="password"
              type="password"
              className="field-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              disabled={loading}
            />
          </div>

          {error && (
            <div className="login-error" role="alert">
              ⚠ {error}
            </div>
          )}

          <button
            id="btn-login"
            type="submit"
            className="btn-primary"
            disabled={loading}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="login-hint">
          <p><strong>Demo credentials:</strong></p>
          <ul>
            <li>Admin: <code>admin@velozity.local</code></li>
            <li>PM: <code>priya@velozity.local</code></li>
            <li>Dev: <code>ravi@velozity.local</code></li>
            <li>Password: <code>Password123!</code></li>
          </ul>
        </div>
      </div>
    </div>
  );
}
