# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Is This

GoClaw is a multi-agent AI gateway (Go + React) with WebSocket RPC + HTTP API. Two modes: **standalone** (file-based storage) and **managed** (PostgreSQL multi-tenant). Module: `github.com/nextlevelbuilder/goclaw`.

## Build & Run

```bash
make build                              # CGO_ENABLED=0 go build with ldflags version injection
make run                                # build + run
./goclaw onboard                        # interactive setup wizard
source .env.local && ./goclaw           # start gateway (default port 18790)
./goclaw migrate up                     # DB migrations (managed mode only)
```

Optional build tags: `otel` (OpenTelemetry export), `tsnet` (Tailscale listener):
```bash
go build -tags otel,tsnet -o goclaw .
```

## Testing

```bash
go test ./...                                           # all tests
go test ./internal/agent/                               # single package
go test ./internal/agent/ -run TestInputGuard            # single test
```

Tests live in the same package as the code they test (not `_test` package suffix). Only stdlib `testing` — no testify. Mock types defined inline in test files.

## Web UI (`ui/web/`)

**Use `pnpm` (not npm).** Pinned at pnpm@10.30.1.

```bash
cd ui/web && pnpm install && pnpm dev   # dev server on :5173
pnpm build                              # tsc + vite build
pnpm lint                               # ESLint
```

Stack: React 19, Vite 6, TypeScript (strict), Tailwind CSS 4, shadcn/ui (new-york style, zinc base), Radix UI, Zustand 5, TanStack Query 5, React Router 7. Path alias: `@/*` → `./src/*`.

Vite proxies `/ws`, `/v1`, `/health` to backend at `VITE_BACKEND_PORT` (default 9600).

## Tech Stack

**Backend:** Go 1.25, Cobra CLI, gorilla/websocket, pgx/v5 (via database/sql, no ORM), golang-migrate, go-rod/rod, telego (Telegram)
**Database:** PostgreSQL 15+ with pgvector. Raw SQL with `$1, $2` positional params. Nullable columns use pointers: `*string`, `*time.Time`.

## Project Structure

```
cmd/                          CLI commands (root, onboard, migrate, agent, doctor, config, etc.)
internal/
├── gateway/                  WS + HTTP server, client lifecycle, method router
│   └── methods/              RPC handlers organized by domain (chat, agents, sessions, etc.)
├── agent/                    Agent loop (think→act→observe), router, resolver, input guard
├── providers/                LLM providers: Anthropic (native HTTP+SSE), OpenAI-compat, DashScope, Gemini
├── tools/                    Tool registry + implementations (fs, exec, web, memory, subagent, MCP)
├── store/                    Store interfaces + pg/ (PostgreSQL) + file/ (standalone) implementations
├── bootstrap/                System prompt files (SOUL.md, IDENTITY.md) + seeding
├── config/                   Config loading (JSON5) + env var overlay
├── channels/                 Channel integrations: Telegram, Feishu/Lark, Zalo, Discord, WhatsApp
├── http/                     HTTP API (/v1/chat/completions, /v1/agents, /v1/skills, etc.)
├── scheduler/                Lane-based concurrency (per-session serialization)
├── skills/                   SKILL.md loader + BM25 search
├── memory/                   Memory system (SQLite FTS5 / pgvector)
├── tracing/                  LLM call tracing + optional OTel export (build-tag gated)
├── cron/                     Cron scheduling (at/every/cron expr)
├── permissions/              RBAC (admin/operator/viewer)
├── crypto/                   AES-256-GCM encryption for API keys
├── sandbox/                  Docker-based code sandbox
├── tts/                      Text-to-Speech (OpenAI, ElevenLabs, Edge, MiniMax)
pkg/protocol/                 Wire types (frames, methods, errors, events)
pkg/browser/                  Browser automation (Rod + CDP)
migrations/                   PostgreSQL migration files (golang-migrate format)
ui/web/                       React SPA
```

## Key Patterns

### Store Layer
Interface-based (`store.SessionStore`, `store.AgentStore`, etc.) with `file/` and `pg/` implementations. In standalone mode, managed-only stores (Agents, Providers, Tracing, etc.) are nil. PG uses `database/sql` + `pgx/v5/stdlib` with raw SQL. Key helpers in `pg/helpers.go`:
- `execMapUpdate(ctx, db, table, id, updates map[string]any)` — dynamic UPDATE from map
- `nilStr`, `nilInt`, `nilUUID`, `nilTime` — zero-to-nil for nullable columns
- `jsonOrEmpty`, `jsonOrNull` — JSONB helpers

All models embed `store.BaseModel` (ID, CreatedAt, UpdatedAt). IDs are UUIDv7 via `store.GenNewID()`.

`StoreConfig.IsManaged()` requires both `PostgresDSN != ""` AND `Mode == "managed"`.

### Agent Loop
`agent.Loop` implements `agent.Agent` interface. `RunRequest` → iteration loop (max 20) → `RunResult`. Each iteration: call provider → if tool calls, execute them (parallel if multiple) → loop. Events emitted: `run.started`, `chunk`, `tool.call`, `tool.result`, `run.completed`.

Key behaviors:
- **Tool loop detection:** warning at 3 repeats, hard stop at 5 (sliding window of 30)
- **Auto-summarization:** triggers at >75% context window usage
- **Context pruning:** keepLastAssistants=3, softTrimRatio=0.3, hardClearRatio=0.5
- **Input guard:** scans for injection, detection-only by default
- **Message truncation:** default 32,000 chars
- **Credential scrubbing:** `ScrubCredentials()` applied to all tool results
- **Sanitization pipeline:** strips garbled XML, thinking tags, echoed system messages

Session key format: `agent:{agentId}:{channel}:{peerKind}:{chatId}`

### Context Propagation
`store.WithUserID(ctx)`, `store.WithAgentID(ctx)`, `store.WithAgentType(ctx)`, `store.WithSenderID(ctx)` — set/get via context keys.

### Agent Types (managed mode)
- `open` — per-user context, 7 context files
- `predefined` — shared context + USER.md per-user

Context files: `agent_context_files` (agent-level) + `user_context_files` (per-user), routed via `ContextFileInterceptor`.

### Providers
`providers.Provider` interface: `Chat()`, `ChatStream()`, `DefaultModel()`, `Name()`. Anthropic (native HTTP+SSE) and OpenAI-compat (generic, covers OpenAI/Groq/OpenRouter/DeepSeek/etc.). `RetryDo[T]()` — generic retry with exponential backoff + jitter (3 attempts, respects Retry-After header). Managed mode loads providers from `llm_providers` table with encrypted API keys.

### WebSocket Protocol (v3)
Frame types: `req` (client→server), `res` (server→client), `event` (server→client push). First request must be `connect`. Auth: token → Admin, no token configured → Operator, browser pairing → Operator, wrong token → Viewer.

### Scheduler
Lane-based concurrency. Same session → serialized; different sessions → parallel. Supports queue and interrupt modes. Default lanes: "main" and "subagent".

### Tool Results
`tools.Result` has `ForLLM` (sent to LLM) and `ForUser` (shown to user). `MEDIA:/path/to/file` prefix in ForLLM triggers media file handling. Constructor helpers: `NewResult()`, `SilentResult()`, `ErrorResult()`, `UserResult()`, `AsyncResult()`.

### Config
JSON5 at `GOCLAW_CONFIG` env (or `config.json` in working dir). Resolution: `--config` flag → env → file. Secrets (API keys, DSN) must come from env vars or `.env.local`, never config.json. `GOCLAW_POSTGRES_DSN` for database.

### Telegram Formatting Pipeline
LLM output → `SanitizeAssistantContent()` → `markdownToTelegramHTML()` → `chunkHTML()` → `sendHTML()`. Tables as ASCII in `<pre>` tags.

## Conventions

- **Errors:** wrap with `fmt.Errorf("context: %w", err)` for `errors.As` compatibility
- **Logging:** stdlib `log/slog`, structured key-value. Security logs: `slog.Warn("security.*", ...)`
- **SQL:** raw SQL, `$1, $2` positional params, no ORM. Migrations: `NNNNNN_description.{up,down}.sql`
- **Gateway port:** 18790 (default)
