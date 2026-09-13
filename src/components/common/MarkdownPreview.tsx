import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { remarkArrows } from '../../lib/remark-arrows';

// GFM first so tables and strikethrough exist as nodes before arrows walks
// their text; code cells are still skipped by remarkArrows.
const REMARK_PLUGINS = [remarkGfm, remarkArrows];

interface MarkdownPreviewProps {
  content: string;
}

export default function MarkdownPreview({ content }: MarkdownPreviewProps) {
  return (
    <div className="markdown-preview">
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{content}</ReactMarkdown>
    </div>
  );
}
