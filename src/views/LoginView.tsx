import { useState, useCallback } from 'react';
import { login } from '../lib/auth';
import Icon from '../components/common/Icon';

interface LoginViewProps {
  onSuccess: () => void;
}

export default function LoginView({ onSuccess }: LoginViewProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || loading) return;

    setLoading(true);
    setError('');

    const result = await login(password);
    if (result.ok) {
      onSuccess();
    } else {
      setError(result.error || 'Wrong password');
      setLoading(false);
    }
  }, [password, loading, onSuccess]);

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-icon">
          <Icon name="book-open" size={28} />
        </div>
        <h1 className="login-title">Research Journal</h1>
        <p className="login-subtitle">Enter your password to continue</p>

        <div className="login-field">
          <input
            type="password"
            className="login-input"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            disabled={loading}
          />
        </div>

        {error && (
          <div className="login-error">{error}</div>
        )}

        <button
          type="submit"
          className="login-button"
          disabled={!password.trim() || loading}
        >
          {loading ? 'Unlocking...' : 'Unlock'}
        </button>
      </form>
    </div>
  );
}