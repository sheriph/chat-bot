'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useRef, useState } from 'react';

export default function FlightAssistantPage() {
  const [input, setInput] = useState('');
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: '/api/flight-assistant' }),
  });
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const isBusy = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <main className="max-w-3xl mx-auto p-4 h-screen flex flex-col">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold text-blue-600">Flight Assistant</h1>
        <p className="text-gray-600 text-sm mt-1">Your dedicated flight booking companion</p>
      </div>

      <div className="flex-1 overflow-y-auto rounded-lg border bg-white p-4 space-y-4">
        {messages.map((message) => (
          <div key={message.id} className="space-y-2">
            <div className="text-sm text-gray-500 capitalize">{message.role}</div>
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
          <div className="text-sm text-gray-500">Searching flights…</div>
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
          placeholder="Tell me your travel plans..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          className="rounded-md bg-blue-600 text-white px-4 py-2 disabled:opacity-50 hover:bg-blue-700"
          disabled={isBusy}
          type="submit"
        >
          Send
        </button>
      </form>
    </main>
  );
}