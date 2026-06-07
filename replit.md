# Emma AI

A Perplexity-style AI mobile app (Expo) with animated particle sphere voice chat, text chat, and settings — powered by OpenAI.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000/8080)
- `pnpm --filter @workspace/emma run dev` — start the Expo mobile app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `AI_INTEGRATIONS_OPENAI_BASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY` — provisioned via Replit AI Integration

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Mobile: Expo SDK 54, expo-router, react-native-svg, expo-av, expo-file-system

## Where things live

- `artifacts/emma/` — Expo mobile app
  - `app/_layout.tsx` — root Stack layout with ChatProvider, QueryClient, SafeArea
  - `app/(tabs)/index.tsx` — main chat + hero screen
  - `app/voice.tsx` — fullscreen voice modal
  - `app/settings.tsx` — settings modal
  - `components/ParticleSphere.tsx` — SVG Fibonacci particle sphere with voice amplitude animation
  - `components/ChatMessage.tsx` — chat bubble component
  - `context/ChatContext.tsx` — conversation state + SSE streaming
  - `hooks/useAudioRecorder.ts` — expo-av recording hook
  - `constants/colors.ts` — dark purple theme tokens
- `artifacts/api-server/src/routes/`
  - `openai/index.ts` — conversation CRUD + SSE chat streaming (gpt-5.4)
  - `emma/index.ts` — /transcribe (Whisper STT) + /speak (nova TTS)
- `lib/db/src/schema/` — conversations.ts + messages.ts
- `lib/integrations-openai-ai-server/` — OpenAI client, audio, image helpers

## Architecture decisions

- Stack-only navigation (no tabs): voice and settings are modals, home is the single screen
- SSE streaming for chat: server sends `data: {"content":"..."}` lines, client reads with `expo/fetch` getReader()
- Audio: expo-av records m4a on iOS/Android, base64-encodes and POSTs to `/api/emma/transcribe`
- TTS uses OpenAI nova voice via `/api/emma/speak`; plays back with `expo-av` Sound
- Particle sphere uses react-native-svg with Fibonacci sphere point distribution; amplitude drives dot size + color intensity
- All colors defined in `constants/colors.ts` with both `light` and `dark` keys (both use the same dark purple palette)

## Product

- **Home screen**: "Hi, I'm Emma." hero with animated purple particle sphere, search mode chips (Research, Fact check, Local, Files), text input bar
- **Voice mode**: fullscreen modal with large particle sphere that pulses to voice amplitude, tap-to-record mic button, Whisper transcription → GPT response
- **Chat**: SSE-streamed AI responses, message history, new chat button
- **Settings**: AI model selector (Emma Standard/Pro/Fast), incognito toggle, appearance, data management

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- `expo/fetch` must be used (not native fetch) in the mobile app for SSE streaming support via getReader()
- `expo-av` is deprecated as of SDK 54; migrate to `expo-audio` / `expo-video` in future
- Run `pnpm --filter @workspace/api-spec run codegen` after any OpenAPI spec change
- `pnpm --filter @workspace/db run push` after schema changes — never run migrations in production manually

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
