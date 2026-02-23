import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Apply theme before React renders to prevent flash of wrong theme
const stored = localStorage.getItem('research-journal-theme') || 'system';
const resolved = stored === 'system'
  ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
  : stored;
document.documentElement.setAttribute('data-theme', resolved);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
