import { useMemo, useState } from 'react';
import type {
  Decision,
  Excerpt,
  FlatQuestion,
  LibraryArticle,
  Study,
  Thought,
  View,
} from '../types';
import { useUserData } from '../hooks/useUserData';
import Icon from '../components/common/Icon';
import MarkdownPreview from '../components/common/MarkdownPreview';
import { marginaliaReadUrl } from '../lib/marginalia';
import { readableTextVars } from '../lib/tag-color';
import { OriginBadge, ThoughtCard } from '../components/thoughts/Thoughts';
import { studyStatusColors, studyStatusLabels } from '../data/study-status';
import { excerptOrigin } from '../data/provenance';

/**
 * What I think so far — the Reframe's home page (slice 3). Not a dashboard of
 * counts but what Nae currently thinks, grouped the way she thinks it: the
 * decisions her studies are waiting on, then each thread with its latest
 * thoughts and her excerpt comments, then whatever isn't on a thread yet.
 */

interface DashboardViewProps {
  onNavigate: (view: View) => void;
}

/** Items shown per thread before "Open thread" takes over. */
const PER_THREAD = 3;
/** Unthreaded items shown before the rest fold away. */
const UNTHREADED = 5;
/** Open decisions listed per study. */
const PER_STUDY = 3;

/** An excerpt with something written on it, and the source it hangs off. */
interface Comment {
  excerpt: Excerpt;
  article: LibraryArticle;
}

type Item =
  | { kind: 'thought'; at: string; thought: Thought }
  | { kind: 'comment'; at: string; comment: Comment };

const itemKey = (item: Item) => (item.kind === 'thought' ? item.thought.id : item.comment.excerpt.id);
const newestFirst = (a: Item, b: Item) => b.at.localeCompare(a.at);

/** Studies still being worked on, with their open decisions oldest first. */
function studiesInPlay(studies: Study[]): { study: Study; open: Decision[] }[] {
  return studies
    .filter((s) => s.status !== 'complete' && s.status !== 'abandoned')
    .map((study) => ({
      study,
      // Oldest first: what has waited longest is the next thing to settle.
      open: study.decisions
        .filter((d) => d.status === 'open')
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    }))
    .sort((a, b) => b.open.length - a.open.length);
}

export default function DashboardView({ onNavigate }: DashboardViewProps) {
  const { library, getAllQuestions, activeProject, thoughts, studies } = useUserData();
  const allThreads = getAllQuestions();

  const comments = useMemo(
    () =>
      library.flatMap((article) =>
        article.excerpts
          .filter((excerpt) => excerpt.comment.trim().length > 0)
          .map((excerpt) => ({ excerpt, article })),
      ),
    [library],
  );

  // Each thread with everything on it, newest first. A comment belongs to a
  // thread through its source: an article linked to two threads shows in both.
  const { threads, unthreaded, emptyThreadCount } = useMemo(() => {
    const byThread = new Map<string, Item[]>();
    const add = (id: string, item: Item) => {
      const list = byThread.get(id);
      if (list) list.push(item);
      else byThread.set(id, [item]);
    };
    const loose: Item[] = [];
    const known = new Set(allThreads.map((q) => q.id));

    for (const thought of thoughts) {
      const item: Item = { kind: 'thought', at: thought.createdAt, thought };
      const ids = thought.questionIds.filter((id) => known.has(id));
      if (ids.length === 0) loose.push(item);
      for (const id of ids) add(id, item);
    }
    for (const comment of comments) {
      const item: Item = { kind: 'comment', at: comment.excerpt.createdAt, comment };
      const ids = comment.article.linkedQuestions.filter((id) => known.has(id));
      if (ids.length === 0) loose.push(item);
      for (const id of ids) add(id, item);
    }

    const withItems = allThreads
      .filter((q) => byThread.has(q.id))
      .map((q) => ({ thread: q, items: byThread.get(q.id)!.sort(newestFirst) }))
      // Most recently active thread first: where your head is now.
      .sort((a, b) => b.items[0].at.localeCompare(a.items[0].at));

    return {
      threads: withItems,
      unthreaded: loose.sort(newestFirst),
      emptyThreadCount: allThreads.length - withItems.length,
    };
  }, [allThreads, thoughts, comments]);

  const inPlay = useMemo(() => studiesInPlay(studies), [studies]);
  const openDecisionCount = inPlay.reduce((sum, s) => sum + s.open.length, 0);

  // Resume: most-recently-updated article currently in `reading` status
  const resumeArticle = useMemo(
    () =>
      library
        .filter((a) => a.status === 'reading')
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0],
    [library],
  );

  const nothingYet = thoughts.length === 0 && comments.length === 0;

  return (
    <div className="main-inner">
      <div className="view-header">
        <div className="view-header-label">{activeProject.name}</div>
        <h1 className="view-header-title">What I think so far</h1>
        <p className="view-header-subtitle">
          Your thoughts and excerpt comments in {activeProject.name}, grouped by thread. Everything
          on this page is for this project only.
        </p>
      </div>

      <div className="dashboard-stats">
        <div className="dashboard-stat dashboard-stat-static">
          <div className="dashboard-stat-value">{thoughts.length}</div>
          <div className="dashboard-stat-label">Thoughts kept</div>
        </div>
        <div className="dashboard-stat dashboard-stat-static">
          <div className="dashboard-stat-value">{comments.length}</div>
          <div className="dashboard-stat-label">Excerpt comments</div>
        </div>
        <button className="dashboard-stat" onClick={() => onNavigate({ name: 'questions' })}>
          <div className="dashboard-stat-value">
            {threads.length}
            <span className="dashboard-stat-of"> of {allThreads.length}</span>
          </div>
          <div className="dashboard-stat-label">Threads with something in them</div>
        </button>
        <button className="dashboard-stat" onClick={() => onNavigate({ name: 'studies' })}>
          <div className="dashboard-stat-value">{openDecisionCount}</div>
          <div className="dashboard-stat-label">
            Open decision{openDecisionCount !== 1 ? 's' : ''} in your studies
          </div>
        </button>
      </div>

      {resumeArticle && (
        // Two destinations, so a card rather than one big button: the title
        // opens the source page here, "Continue reading" opens the reader.
        <div className="dashboard-resume-card">
          <div className="dashboard-resume-label">
            <span className="dashboard-progress-dot" style={{ background: 'var(--theme-ai-tech)' }} />
            Pick up where you left off
          </div>
          <button
            type="button"
            className="dashboard-resume-title"
            onClick={() => onNavigate({ name: 'article-detail', articleId: resumeArticle.id })}
          >
            {resumeArticle.title}
          </button>
          {(resumeArticle.journal || resumeArticle.year) && (
            <div className="dashboard-resume-meta">
              {[resumeArticle.journal, resumeArticle.year].filter(Boolean).join(' · ')}
            </div>
          )}
          <a
            className="dashboard-resume-cta"
            href={marginaliaReadUrl(resumeArticle.id)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Continue reading in Marginalia <Icon name="chevron-right" size={14} />
          </a>
        </div>
      )}

      {/* 1. What the studies are waiting on */}
      {inPlay.length > 0 && (
        <section className="dashboard-section">
          <h2 className="dashboard-section-title">Open decisions</h2>
          {inPlay.map(({ study, open }) => (
            <div key={study.id} className="wit-study">
              <div className="wit-study-head">
                <button
                  type="button"
                  className="wit-link-title"
                  onClick={() => onNavigate({ name: 'study-detail', studyId: study.id })}
                >
                  {study.title}
                </button>
                <span className="wit-study-status">
                  <span
                    className="dashboard-progress-dot"
                    style={{ background: studyStatusColors[study.status] }}
                  />
                  {studyStatusLabels[study.status]}
                </span>
              </div>
              {open.length === 0 ? (
                <p className="wit-quiet">Nothing open. Every decision is settled.</p>
              ) : (
                <ul className="wit-decisions">
                  {open.slice(0, PER_STUDY).map((d, i) => (
                    <li key={d.id}>
                      {i === 0 && <span className="wit-next">Next to settle</span>}
                      {d.decision}
                    </li>
                  ))}
                  {open.length > PER_STUDY && (
                    <li className="wit-quiet">
                      and {open.length - PER_STUDY} more on the study page
                    </li>
                  )}
                </ul>
              )}
            </div>
          ))}
        </section>
      )}

      {/* 2. Each thread, most recently active first */}
      {threads.map(({ thread, items }) => (
        <ThreadBlock key={thread.id} thread={thread} items={items} onNavigate={onNavigate} />
      ))}

      {emptyThreadCount > 0 && !nothingYet && (
        <button type="button" className="wit-empty-threads" onClick={() => onNavigate({ name: 'questions' })}>
          {emptyThreadCount} thread{emptyThreadCount !== 1 ? 's have' : ' has'} nothing in{' '}
          {emptyThreadCount !== 1 ? 'them' : 'it'} yet <Icon name="chevron-right" size={12} />
        </button>
      )}

      {/* 3. Whatever isn't on a thread yet */}
      {unthreaded.length > 0 && (
        <UnthreadedBlock items={unthreaded} onNavigate={onNavigate} />
      )}

      {nothingYet && (
        <div className="dashboard-empty">
          <div className="dashboard-empty-text">
            Nothing here yet. Your thoughts land here when you keep them at the end of a chat with
            Coru, and your excerpt comments from Marginalia show up on their threads.
          </div>
          <div className="dashboard-empty-actions">
            <button className="btn btn-primary" onClick={() => onNavigate({ name: 'library' })}>
              Go to Sources
            </button>
            <button className="btn btn-sm" onClick={() => onNavigate({ name: 'questions' })}>
              View Threads
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ThreadBlock({
  thread,
  items,
  onNavigate,
}: {
  thread: FlatQuestion;
  items: Item[];
  onNavigate: (view: View) => void;
}) {
  const open = () => onNavigate({ name: 'question-detail', questionId: thread.id });
  return (
    <section className="dashboard-section wit-thread">
      <div className="wit-thread-head">
        <button type="button" className="wit-link-title" onClick={open}>
          {thread.q}
        </button>
        <span className="thread-label" style={readableTextVars(thread.themeColor) as React.CSSProperties}>
          <span className="thread-label-dot" style={{ background: thread.themeColor }} aria-hidden="true" />
          {thread.themeLabel}
        </span>
      </div>
      <div className="wit-items">
        {items.slice(0, PER_THREAD).map((item) => (
          <ItemCard key={itemKey(item)} item={item} threadId={thread.id} onNavigate={onNavigate} />
        ))}
      </div>
      {items.length > PER_THREAD && (
        <button type="button" className="wit-more" onClick={open}>
          See all {items.length} on the thread <Icon name="chevron-right" size={12} />
        </button>
      )}
    </section>
  );
}

function UnthreadedBlock({ items, onNavigate }: { items: Item[]; onNavigate: (view: View) => void }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, UNTHREADED);
  return (
    <section className="dashboard-section wit-thread">
      <h2 className="dashboard-section-title">Not on a thread yet</h2>
      <div className="wit-items">
        {shown.map((item) => (
          <ItemCard key={itemKey(item)} item={item} onNavigate={onNavigate} />
        ))}
      </div>
      {items.length > UNTHREADED && (
        <button type="button" className="wit-more" onClick={() => setAll((v) => !v)}>
          {all ? 'Show fewer' : `Show all ${items.length}`}
        </button>
      )}
    </section>
  );
}

function ItemCard({
  item,
  threadId,
  onNavigate,
}: {
  item: Item;
  threadId?: string;
  onNavigate: (view: View) => void;
}) {
  if (item.kind === 'thought') {
    return (
      <ThoughtCard
        thought={item.thought}
        context={threadId ? { questionId: threadId } : {}}
        onNavigate={onNavigate}
        clamp
      />
    );
  }
  return <CommentCard comment={item.comment} onNavigate={onNavigate} />;
}

/** An excerpt comment: her words first, then the quote and where it is from. */
function CommentCard({ comment, onNavigate }: { comment: Comment; onNavigate: (view: View) => void }) {
  const { excerpt, article } = comment;
  return (
    <div className="thought-card wit-comment">
      <div className="thought-head">
        <OriginBadge provenance={excerptOrigin(excerpt)} />
        <span className="thought-date">
          Excerpt comment ·{' '}
          {new Date(excerpt.createdAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
      </div>
      <MarkdownPreview content={excerpt.comment} />
      <blockquote className="wit-quote">{excerpt.quote}</blockquote>
      <button
        type="button"
        className="hypothesis-question-link"
        onClick={() => onNavigate({ name: 'article-detail', articleId: article.id, excerptId: excerpt.id })}
      >
        {article.title}
        {excerpt.page !== undefined ? ` · p. ${excerpt.page}` : ''}
      </button>
    </div>
  );
}
