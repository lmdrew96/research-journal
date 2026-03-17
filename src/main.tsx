import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import './index.css'
import App from './App.tsx'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;
if (!PUBLISHABLE_KEY) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY env var');

// Apply theme before React renders to prevent flash of wrong theme
const stored = localStorage.getItem('research-journal-theme') || 'system';
const resolved = stored === 'system'
  ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
  : stored;
document.documentElement.setAttribute('data-theme', resolved);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
      <App />
    </ClerkProvider>
  </StrictMode>,
)
