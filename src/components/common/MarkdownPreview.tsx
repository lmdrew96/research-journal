import ReactMarkdown from 'react-markdown';
import { remarkArrows } from '../../lib/remark-arrows';

interface MarkdownPreviewProps {
  content: string;
}

export default function MarkdownPreview({ content }: MarkdownPreviewProps) {
  return (
    <div className="markdown-preview">
      <ReactMarkdown remarkPlugins={[remarkArrows]}>{content}</ReactMarkdown>
    </div>
  );
}
