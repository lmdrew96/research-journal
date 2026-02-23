import { useState, useEffect, useCallback } from 'react';
import type { View } from './types';
import { UserDataProvider } from './hooks/useUserData';
import Sidebar from './components/layout/Sidebar';
import QuestionsView from './views/QuestionsView';
import QuestionDetailView from './views/QuestionDetailView';
import JournalView from './views/JournalView';
import SearchView from './views/SearchView';
import ExportView from './views/ExportView';

function AppContent() {
  const [currentView, setCurrentView] = useState<View>({ name: 'questions' });

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
        return <SearchView onNavigate={navigate} />;
      case 'export':
        return <ExportView />;
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
  return (
    <UserDataProvider>
      <AppContent />
    </UserDataProvider>
  );
}
