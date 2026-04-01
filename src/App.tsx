import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import type { View } from './types';
import { UserDataProvider } from './hooks/useUserData';
import { DemoDataProvider } from './hooks/useDemoData';
import Sidebar from './components/layout/Sidebar';
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

function pathToView(pathname: string): View {
  const [, seg1, seg2] = pathname.split('/');

  if (!seg1 || seg1 === '') return { name: 'landing' };

  switch (seg1) {
    case 'dashboard':
      return { name: 'dashboard' };
    case 'questions':
      return seg2
        ? { name: 'question-detail', questionId: decodeURIComponent(seg2) }
        : { name: 'questions' };
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
    case 'questions':       return '/questions';
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

function AppContent() {
  const [currentView, setCurrentView] = useState<View>(() => pathToView(window.location.pathname));

  const navigate = useCallback((view: View) => {
    const path = viewToPath(view);
    window.history.pushState(null, '', path);
    setCurrentView(view);
    document.querySelector('.main-content')?.scrollTo(0, 0);
  }, []);

  // Browser back / forward
  useEffect(() => {
    const handlePop = () => setCurrentView(pathToView(window.location.pathname));
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  // Cmd+K → search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        navigate({ name: 'search' });
      }
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
        return <QuestionsView onNavigate={navigate} />;
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
    <div className="app-layout">
      <Sidebar currentView={currentView} onNavigate={navigate} />
      <main className="main-content">{renderView()}</main>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

const isDemoMode = window.location.pathname === '/demo';

// Routes accessible without signing in
const PUBLIC_PATHS = new Set(['/', '/login', '/demo']);

export default function App() {
  const { isLoaded, isSignedIn } = useAuth();

  if (isDemoMode) {
    return (
      <DemoDataProvider>
        <DemoBanner />
        <AppContent />
      </DemoDataProvider>
    );
  }

  if (!isLoaded) return null;

  const currentPath = window.location.pathname;

  // Landing page — always public, no auth required
  if (currentPath === '/') {
    return <LandingView onNavigate={(view) => { window.location.href = viewToPath(view); }} />;
  }

  if (!isSignedIn) {
    const intendedPath = PUBLIC_PATHS.has(currentPath)
      ? '/dashboard'
      : currentPath + window.location.search;
    if (currentPath !== '/login') {
      window.history.replaceState(null, '', '/login');
    }
    return <LoginView redirectUrl={intendedPath} />;
  }

  // Signed in but URL is /login — go to dashboard
  if (currentPath === '/login') {
    window.history.replaceState(null, '', '/dashboard');
  }

  return (
    <UserDataProvider>
      <AppContent />
    </UserDataProvider>
  );
}
