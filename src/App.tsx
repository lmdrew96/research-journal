import { useState, useEffect, useCallback } from 'react';
import type { View } from './types';
import { UserDataProvider } from './hooks/useUserData';
import Sidebar from './components/layout/Sidebar';
import DashboardView from './views/DashboardView';
import QuestionsView from './views/QuestionsView';
import QuestionDetailView from './views/QuestionDetailView';
import JournalView from './views/JournalView';
import SearchView from './views/SearchView';
import LibraryView from './views/LibraryView';
import ArticleDetailView from './views/ArticleDetailView';
import ExportView from './views/ExportView';
import ManageThemesView from './views/ManageThemesView';
import LoginView from './views/LoginView';
import { checkAuth } from './lib/auth';

function AppContent() {
  const [currentView, setCurrentView] = useState<View>({ name: 'dashboard' });

  const navigate = useCallback((view: View) => {
    setCurrentView(view);
    // Scroll to top when navigating
    document.querySelector('.main-content')?.scrollTo(0, 0);
  }, []);

  // Cmd+K to open search
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
    }
  };

  return (
    <div className="app-layout">
      <Sidebar currentView={currentView} onNavigate={navigate} />
      <main className="main-content">{renderView()}</main>
    </div>
  );
}

export default function App() {
  const [authState, setAuthState] = useState<'checking' | 'authed' | 'login'>('checking');

  useEffect(() => {
    checkAuth().then((ok) => setAuthState(ok ? 'authed' : 'login'));
  }, []);

  if (authState === 'checking') {
    return null; // Brief flash while checking auth
  }

  if (authState === 'login') {
    return <LoginView onSuccess={() => setAuthState('authed')} />;
  }

  return (
    <UserDataProvider>
      <AppContent />
    </UserDataProvider>
  );
}
