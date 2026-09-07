import { SignIn } from '@clerk/clerk-react';

interface LoginViewProps {
  redirectUrl?: string;
}

export default function LoginView({ redirectUrl = '/' }: LoginViewProps) {
  return (
    <div className="login-page">
      {/* No heading here on purpose: Clerk's <SignIn> renders its own h1
          ("Sign in to ThreadNotes", .cl-headerTitle). Adding one gave the page
          two h1s with identical text — verified in-browser 2026-09-07. */}
      <SignIn
        fallbackRedirectUrl={redirectUrl}
        appearance={{
          variables: {
            colorBackground: 'var(--bg-elevated)',
            colorText: 'var(--text-body)',
            colorPrimary: 'var(--color-primary)',
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
