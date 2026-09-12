import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

export function Markdown({ content }: { content: string }) {
  return (
    <div className="prose prose-neutral dark:prose-invert max-w-none prose-img:rounded-lg">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
}
