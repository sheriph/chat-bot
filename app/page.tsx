'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useRef, useState } from 'react';

export default function Page() {
  const [input, setInput] = useState('');
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
  });
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const isBusy = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <main className="max-w-3xl mx-auto p-4 h-screen flex flex-col">
      <h1 className="text-2xl font-semibold mb-4">AI Chatbot</h1>

      <div className="flex-1 overflow-y-auto rounded-lg border bg-white p-4 space-y-4">
        {messages.map((message) => (
          <div key={message.id} className="space-y-2">
            <div className="text-sm text-gray-500">{message.role}</div>
            <div className="prose max-w-none">
              {message.parts.map((part, i) => {
                if (part.type === 'text') {
                  return (
                    <p key={`${message.id}-${i}`} className="whitespace-pre-wrap">{part.text}</p>
                  );
                }
                if (part.type === 'reasoning') {
                  return (
                    <details key={`${message.id}-${i}`} className="text-xs text-gray-500">
                      <summary>Reasoning</summary>
                      <pre className="whitespace-pre-wrap">{part.text}</pre>
                    </details>
                  );
                }
                return null;
              })}
            </div>
          </div>
        ))}
        {isBusy && (
          <div className="text-sm text-gray-500">Thinking…</div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const text = input.trim();
          if (!text) return;
          sendMessage({ parts: [{ type: 'text', text }] });
          setInput('');
        }}
      >
        <input
          className="flex-1 rounded-md border px-3 py-2"
          placeholder="Ask me anything…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          className="rounded-md bg-black text-white px-4 py-2 disabled:opacity-50"
          disabled={isBusy}
          type="submit"
        >
          Send
        </button>
      </form>
    </main>
  );
}
