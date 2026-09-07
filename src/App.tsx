import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import type { View } from './types';
import { UserDataProvider } from './hooks/useUserData';
import { DemoDataProvider } from './hooks/useDemoData';
import { UndoProvider } from './hooks/useUndo';
import UndoToast from './components/common/UndoToast';
import Sidebar from './components/layout/Sidebar';
import InstallPrompt from './components/common/InstallPrompt';
import Icon from './components/common/Icon';
import DemoBanner from './components/layout/DemoBanner';
import DashboardView from './views/DashboardView';
import QuestionsView from './views/QuestionsView';
import QuestionDetailView from './views/QuestionDetailView';
import JournalView from './views/JournalView';
import SearchView from './views/SearchView';
import LibraryView from './views/LibraryView';
import ArticleDetailView from './views/ArticleDetailView';
import ExportView from './views/ExportView';
import ManageThemesView from './views/ManageThemesView';
import ManageProjectsView from './views/ManageProjectsView';
import SettingsView from './views/SettingsView';
import AccountsView from './views/AccountsView';
import LoginView from './views/LoginView';
import LandingView from './views/LandingView';

// ── URL ↔ View mapping ────────────────────────────────────────────────────────

const DEMO_PREFIX = '/demo';

function pathToView(pathname: string): View {
  // Strip /demo prefix so /demo/library is treated the same as /library
  const path = pathname.startsWith(DEMO_PREFIX)
    ? pathname.slice(DEMO_PREFIX.length) || '/dashboard'
    : pathname;

  const [, seg1, seg2] = path.split('/');

  if (!seg1 || seg1 === '') return { name: 'landing' };

  switch (seg1) {
    case 'dashboard':
      return { name: 'dashboard' };
    case 'questions': {
      if (seg2) return { name: 'question-detail', questionId: decodeURIComponent(seg2) };
      const themeId = new URLSearchParams(window.location.search).get('theme');
      return { name: 'questions', themeId: themeId ?? undefined };
    }
    case 'journal':
      return { name: 'journal' };
    case 'search': {
      const q = new URLSearchParams(window.location.search).get('q');
      return { name: 'search', initialQuery: q ?? undefined };
    }
    case 'library':
      return seg2
        ? { name: 'article-detail', articleId: decodeURIComponent(seg2) }
        : { name: 'library' };
    case 'export':
      return { name: 'export' };
    case 'settings':
      return { name: 'settings' };
    case 'accounts':
      return { name: 'accounts' };
    case 'manage-themes':
      return { name: 'manage-themes' };
    case 'manage-projects':
      return { name: 'manage-projects' };
    default:
      return { name: 'landing' };
  }
}

function viewToPath(view: View): string {
  switch (view.name) {
    case 'landing':         return '/';
    case 'dashboard':       return '/dashboard';
    case 'questions':       return view.themeId
                              ? `/questions?theme=${encodeURIComponent(view.themeId)}`
                              : '/questions';
    case 'question-detail': return `/questions/${encodeURIComponent(view.questionId)}`;
    case 'journal':         return '/journal';
    case 'search':          return view.initialQuery
                              ? `/search?q=${encodeURIComponent(view.initialQuery)}`
                              : '/search';
    case 'library':         return '/library';
    case 'article-detail':  return `/library/${encodeURIComponent(view.articleId)}`;
    case 'export':          return '/export';
    case 'settings':        return '/settings';
    case 'accounts':        return '/accounts';
    case 'manage-themes':    return '/manage-themes';
    case 'manage-projects':  return '/manage-projects';
  }
}

// ── App shell ─────────────────────────────────────────────────────────────────

function AppContent({ pathPrefix = '' }: { pathPrefix?: string }) {
  const [currentView, setCurrentView] = useState<View>(() => pathToView(window.location.pathname));
  // Drawer state only has an effect below the CSS breakpoint; on wider screens
  // the sidebar is always in flow and this is inert.
  const [navOpen, setNavOpen] = useState(false);

  const navigate = useCallback((view: View) => {
    const path = pathPrefix + viewToPath(view);
    window.history.pushState(null, '', path);
    setCurrentView(view);
    setNavOpen(false);
    document.querySelector('.main-content')?.scrollTo(0, 0);
  }, []);

  // Browser back / forward
  useEffect(() => {
    const handlePop = () => setCurrentView(pathToView(window.location.pathname));
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  // Cmd+K → search, Escape → close the mobile drawer
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        navigate({ name: 'search' });
      }
      if (e.key === 'Escape') setNavOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate]);

  const renderView = () => {
    switch (currentView.name) {
      case 'landing':
        return <LandingView onNavigate={navigate} />;
      case 'dashboard':
        return <DashboardView onNavigate={navigate} />;
      case 'questions':
        return <QuestionsView onNavigate={navigate} initialThemeId={currentView.themeId} />;
      case 'question-detail':
        return (
          <QuestionDetailView
            questionId={currentView.questionId}
            onNavigate={navigate}
          />
        );
      case 'journal':
        return <JournalView onNavigate={navigate} />;
      case 'search':
        return <SearchView onNavigate={navigate} initialQuery={currentView.initialQuery} />;
      case 'library':
        return <LibraryView onNavigate={navigate} />;
      case 'article-detail':
        return (
          <ArticleDetailView
            articleId={currentView.articleId}
            onNavigate={navigate}
          />
        );
      case 'export':
        return <ExportView />;
      case 'manage-themes':
        return <ManageThemesView onNavigate={navigate} />;
      case 'manage-projects':
        return <ManageProjectsView onNavigate={navigate} />;
      case 'settings':
        return <SettingsView />;
      case 'accounts':
        return <AccountsView />;
    }
  };

  return (
    <div className={`app-layout${navOpen ? ' nav-open' : ''}`}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <button
        type="button"
        className="nav-toggle"
        aria-label={navOpen ? 'Close navigation' : 'Open navigation'}
        aria-expanded={navOpen}
        aria-controls="app-sidebar"
        onClick={() => setNavOpen((open) => !open)}
      >
        <Icon name={navOpen ? 'arrow-left' : 'menu'} size={20} />
      </button>
      <div
        className="nav-backdrop"
        hidden={!navOpen}
        onClick={() => setNavOpen(false)}
        aria-hidden="true"
      />
      <Sidebar currentView={currentView} onNavigate={navigate} />
      <main className="main-content" id="main-content" tabIndex={-1}>
        {renderView()}
      </main>
      <InstallPrompt />
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

// Capture once at module load — before any auth redirects can mutate the URL
const INITIAL_PATH = window.location.pathname;
const isDemoMode = INITIAL_PATH.startsWith('/demo');

export default function App() {
  const { isLoaded, isSignedIn } = useAuth();
  // Only show the login UI after an effect confirms the user is unauthenticated.
  // This prevents a one-render Clerk flicker (isLoaded=true, isSignedIn=false)
  // from rendering <LoginView>, which in production triggers Clerk's hosted
  // sign-in redirect and breaks the user's current route.
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      setShowLogin(true);
    } else {
      setShowLogin(false);
    }
  }, [isLoaded, isSignedIn]);

  if (isDemoMode) {
    return (
      <DemoDataProvider>
        <DemoBanner />
        <AppContent pathPrefix={DEMO_PREFIX} />
      </DemoDataProvider>
    );
  }

  if (!isLoaded) return null;

  // Landing page — always public, no auth required
  if (INITIAL_PATH === '/') {
    return <LandingView onNavigate={(view) => { window.location.href = viewToPath(view); }} />;
  }

  if (!isSignedIn) {
    if (!showLogin) return null;
    // With Clerk's application domain mode, <SignIn> redirects to /login when
    // rendered at any other URL. So we always navigate there explicitly and only
    // render the LoginView form when we're already at /login.
    if (window.location.pathname !== '/login') {
      window.location.replace('/login');
      return null;
    }
    return <LoginView redirectUrl="/dashboard" />;
  }

  return (
    // UndoProvider wraps UserDataProvider because the delete functions in
    // useUserData register their own undo entries.
    <UndoProvider>
      <UserDataProvider>
        <AppContent />
        <UndoToast />
      </UserDataProvider>
    </UndoProvider>
  );
}
