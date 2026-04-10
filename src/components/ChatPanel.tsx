import { useState, useRef, useEffect } from 'react';
import type { ChatMessage } from '../types';
import { SqlHighlight } from './SqlHighlight';

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (message: string) => void;
  isGenerating: boolean;
}

export function ChatPanel({ messages, onSend, isGenerating }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || isGenerating) return;
    onSend(trimmed);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="w-96 border-l border-slate-200 bg-white flex flex-col">
      <div className="p-3 border-b border-slate-200 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Chat</h2>
        <span className="text-xs text-slate-400">Refine your dashboard</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-slate-400 text-sm py-8">
            <p>Your dashboard is ready.</p>
            <p className="mt-2">Ask me to refine it &mdash; add charts, change groupings, filter data.</p>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id}>
            <div
              className={`
                rounded-lg px-3 py-2 text-sm
                ${msg.role === 'user'
                  ? 'bg-blue-50 text-blue-900 ml-8 border border-blue-100'
                  : msg.role === 'system'
                    ? 'bg-slate-50 text-slate-500 text-xs'
                    : 'bg-slate-50 text-slate-700 mr-4 border border-slate-100'
                }
              `}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>

              {msg.educationalNote && (
                <div className="mt-2 p-2 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-800">
                  <span className="font-semibold">Learn: </span>
                  {msg.educationalNote}
                </div>
              )}

              {msg.sql && (
                <details className="mt-2">
                  <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600">
                    View SQL
                  </summary>
                  <pre className="mt-1 p-2 bg-slate-100 rounded text-xs overflow-x-auto">
                    <SqlHighlight sql={msg.sql} />
                  </pre>
                </details>
              )}
            </div>

            {msg.followUps && msg.followUps.length > 0 && (
              <div className="mt-2 space-y-1 ml-2">
                {msg.followUps.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => { setInput(q); inputRef.current?.focus(); }}
                    className="block w-full text-left text-xs text-slate-400 hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                  >
                    &rarr; {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {isGenerating && (
          <div className="flex items-center gap-2 text-slate-400 text-sm py-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            Thinking...
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 border-t border-slate-200">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Refine your dashboard..."
            rows={2}
            className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 placeholder-slate-400 resize-none focus:outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100"
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || isGenerating}
            className="px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed self-end transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
