import { useState } from 'react';
import { loginWithCredentials } from '../services/authService';

export default function LoginPage({ onLoginSuccess }) {
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    if (!id.trim() || !password.trim()) {
      setError('Please enter both ID and password.');
      return;
    }

    try {
      setIsSubmitting(true);
      await loginWithCredentials({ id, password });
      onLoginSuccess();
    } catch (submissionError) {
      setError(submissionError.message || 'Unable to sign in. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-background-orb" aria-hidden="true" />

      <section className="login-card" aria-labelledby="login-title">
        <p className="login-eyebrow">Techwheels Reception</p>
        <h1 id="login-title" className="login-title">
          Sign in to continue
        </h1>
        <p className="login-subtitle">Use your ID and password to access kiosk and reception tools.</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <label htmlFor="login-id">ID</label>
          <input
            id="login-id"
            type="text"
            value={id}
            onChange={(event) => setId(event.target.value)}
            autoComplete="username"
            placeholder="Enter your ID"
          />

          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            placeholder="Enter your password"
          />

          {error ? <p className="error-text login-error">{error}</p> : null}

          <button type="submit" className="login-submit-btn" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in...' : 'Login'}
          </button>
        </form>
      </section>
    </div>
  );
}
