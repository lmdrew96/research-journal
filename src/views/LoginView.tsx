import { SignIn } from '@clerk/clerk-react';

export default function LoginView() {
  return (
    <div className="login-page">
      <SignIn
        appearance={{
          variables: {
            colorBackground: 'var(--bg-elevated)',
            colorText: 'var(--text-body)',
            colorPrimary: 'var(--theme-nonlinear)',
            colorInputBackground: 'var(--bg-input)',
            colorInputText: 'var(--text-body)',
            colorTextSecondary: 'var(--text-secondary)',
            colorTextOnPrimaryBackground: '#ffffff',
            borderRadius: '8px',
            fontFamily: 'var(--font-sans)',
            fontSize: '0.9rem',
          },
          elements: {
            rootBox: { width: '100%', maxWidth: '400px' },
            card: {
              boxShadow: 'none',
              border: '1px solid var(--border-subtle)',
            },
          },
        }}
      />
    </div>
  );
}
