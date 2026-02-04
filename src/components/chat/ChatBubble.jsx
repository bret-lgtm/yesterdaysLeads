import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Loader2 } from 'lucide-react';

export default function ChatBubble({ message }) {
  const isUser = message.role === 'user';
  const isLoading = message.role === 'assistant' && !message.content && message.tool_calls?.some(tc => tc.status === 'running');

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
        isUser 
          ? 'bg-emerald-600 text-white' 
          : 'bg-slate-100 text-slate-900'
      }`}>
        {message.content ? (
          isUser ? (
            <p className="text-sm leading-relaxed">{message.content}</p>
          ) : (
            <ReactMarkdown 
              className="text-sm prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1"
              components={{
                p: ({ children }) => <p className="my-1 leading-relaxed text-slate-700">{children}</p>,
                ul: ({ children }) => <ul className="my-1 ml-4 list-disc text-slate-700">{children}</ul>,
                ol: ({ children }) => <ol className="my-1 ml-4 list-decimal text-slate-700">{children}</ol>,
                li: ({ children }) => <li className="my-0.5">{children}</li>,
                strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
              }}
            >
              {message.content}
            </ReactMarkdown>
          )
        ) : isLoading ? (
          <div className="flex items-center gap-2 text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Thinking...</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}