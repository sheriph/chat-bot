# AI Chatbot (Next.js + Tailwind + AI SDK)

Minimal chatbot using Next.js App Router, Tailwind CSS, and Vercel AI SDK, configured to call DeepInfra via an OpenAI-compatible endpoint.

## Setup

1. Install dependencies

```bash
npm install
```

2. Copy env and set your key

```bash
cp .env.example .env.local
# edit .env.local and set DEEPINFRA_API_KEY
```

3. Run the dev server

```bash
npm run dev
```

Open http://localhost:3000 in your browser.

## Notes
- API route: `app/api/chat/route.ts` uses `streamText` with `DeepInfra` and sends reasoning tokens back to the client.
- Client: `app/page.tsx` uses `useChat` from `@ai-sdk/react` and streams content into the UI.
- Tailwind: configured in `tailwind.config.ts`, styles in `app/globals.css`.

## Troubleshooting
- Ensure your DEEPINFRA_API_KEY is valid and has access to the specified model.
- If you change models, update it in `app/api/chat/route.ts`.