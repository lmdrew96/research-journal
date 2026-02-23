import ReactMarkdown from 'react-markdown';

interface MarkdownPreviewProps {
  content: string;
}

export default function MarkdownPreview({ content }: MarkdownPreviewProps) {
  return (
    <div className="markdown-preview">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
