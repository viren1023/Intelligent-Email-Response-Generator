# Planning: Intelligent Email Response Generator — Improvements & New Features

> Collaborative doc. Updated 2026-10-02. Building on top of existing scaffolded code.

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| 🔲 | Not started |
| 🔨 | In progress |
| ✅ | Done |
| ❌ | Decided to skip |

---

## Decided Answers (from open questions)

| Question | Decision |
|----------|----------|
| Chat persistence | SQLite local DB (separate from PostgreSQL) |
| Urgency classifier model | Use best available model in Ollama (same pool, configurable) |
| Streaming behaviour | Stream directly into editor; editor is **read-only while streaming** |
| Tone selector | Fixed tones (Professional, Friendly, Concise, Formal) + Custom; Custom configurable in Settings |
| Dark mode timing | Implement **last**, after all functional features |
| Codebase state | Building **on top of existing code** |

---

## 0. Full Gmail-Like Inbox with Pagination ⭐ NEW

**Status:** 🔲  
**Priority:** HIGHEST — core product improvement (user-requested)

### What
Replace the current "unread-only" list with a full inbox view that behaves like Gmail:
- Shows **all emails** (read + unread), not just unread
- **Tabs**: Primary | Unread | Sent | All Mail
- **Paginated** — 20 per page, Next/Prev buttons, page indicator
- Read emails visually distinct from unread (bold vs normal weight, blue dot indicator)
- **Search bar** — filters the displayed page by sender/subject/snippet
- **Compose button** — opens compose modal (new email, not reply)
- Each email card shows: avatar, sender, subject, snippet, date, read/unread dot, AI-replied badge

### Why
The current inbox is a one-trick-pony — only unread emails. Users also want to:
- Browse past read conversations to generate AI replies
- See emails they already replied to
- Have a Gmail-familiar experience without leaving the app

### UI Layout
```
+------------------------------------------------------------------+
|  Email AI       [Search emails...]        [ Compose ]  [ Refresh ]|
+------------------------------------------------------------------+
| [Primary] [Unread (12)] [Sent] [All Mail]                        |
+------------------------------------------------------------------+
| ● John Smith        Meeting Request        Today 4:32 PM  [AI]   |
|   Sarah Patel       Re: Product Update     Yesterday       ✓      |
| ● Alex Brown        Support Ticket #847    Oct 1          [AI]   |
|   Notifications     Your invoice is ready  Sep 30                 |
+------------------------------------------------------------------+
|                    < Prev  Page 1 of 5  Next >                   |
+------------------------------------------------------------------+
```

### Backend Changes

**New endpoint:** `GET /api/emails/all`
```
Query params:
  page: int = 1
  per_page: int = 20
  tab: "primary" | "unread" | "sent" | "all"
  search: str = ""
```

Gmail API query mapping:
| Tab | Gmail query |
|-----|-------------|
| primary | `in:inbox -category:promotions -category:social` |
| unread | `is:unread` (existing endpoint, reuse) |
| sent | `in:sent` |
| all | `in:anywhere -in:spam -in:trash` |

Pagination via Gmail API `pageToken` — backend stores/returns `nextPageToken` and `prevPageToken` per request.

**gmail_service.py** — add `list_emails(query, page_token, max_results)` method.

**emails.py route** — add `/all` route, reuse existing metadata parsing logic.

> Note: Gmail API does not support true offset pagination. We must use cursor-based pageToken and store a stack of tokens per session to enable "previous page".

### Frontend Changes

**Dashboard.tsx** — full redesign:
- Tab bar component `InboxTabs`
- `EmailList` renders all emails (read + unread) with visual distinction
- `Pagination` component with page counter + next/prev
- Search bar (client-side filter on current page, debounce 300ms)
- Email card: bold sender + subject = unread; normal weight = read; blue dot indicator

**email.ts service** — add `getAll(tab, page, pageToken)` method.

**State:**
```ts
const [tab, setTab] = useState<'primary'|'unread'|'sent'|'all'>('primary');
const [pageTokenStack, setPageTokenStack] = useState<string[]>([]);
const [nextPageToken, setNextPageToken] = useState<string|null>(null);
```

### DB Impact
No schema changes needed. Emails displayed directly from Gmail API — no local caching of full inbox required (only metadata for emails we've interacted with is stored in DB).

### Acceptance Criteria
- [ ] Dashboard shows all emails by default (Primary tab)
- [ ] Unread tab reuses existing `/api/emails/unread` endpoint
- [ ] Sent tab shows sent mail
- [ ] Next/Prev pagination works correctly
- [ ] Read emails visually distinct (no bold, no dot)
- [ ] Search filters current page results in real-time
- [ ] Empty state per tab ("No sent emails", etc.)
- [ ] AI-replied badge shows on emails with status SENT in DB

---

## 1. AI Chat Panel (In-App Assistant)

**Status:** 🔲  
**Priority:** HIGH — biggest UX differentiator

### What
A floating slide-out chat panel on the email conversation screen. User can have back-and-forth conversation with Ollama about the open email — for thinking, clarifying, or drafting before hitting "AI Reply".

### UI Sketch
```
[ Email thread view ]              [ Chat Panel slide-over ]
                                   +---------------------------+
                                   | 💬 Ask about this email   |
                                   +---------------------------+
                                   | You: What is John asking? |
                                   | AI : Meeting tomorrow.    |
                                   |                           |
                                   | You: Draft a polite       |
                                   |      decline              |
                                   | AI : Sure, here's one...  |
                                   +---------------------------+
                                   | [Type a message...]  [→]  |
                                   +---------------------------+
```

### Implementation Notes
- **Backend:** `POST /api/chat` — accepts `{ email_id, history: [{role, content}] }`, injects email thread as system context, streams via SSE.
- **Frontend:** `ChatPanel` component, `useChatSession` hook (per `email_id`), stream tokens.
- **Scope guard:** Chat always seeded with current email thread only.
- **Persistence:** SQLite local DB (via `better-sqlite3` on frontend or a separate lightweight FastAPI SQLite session store). Chat history persists across page refresh but scoped to email_id.

### DB (SQLite)
```
chat_sessions
--------------
id
email_id (gmail_message_id)
user_id
messages  (JSON text: [{role, content, timestamp}])
created_at
updated_at
```

### Acceptance Criteria
- [ ] Panel opens/closes from email view
- [ ] Messages stream in real-time
- [ ] History persists in SQLite across refresh (per email)
- [ ] Ollama unavailable → graceful error in panel

---

## 2. Tone / Style Selector

**Status:** 🔲  
**Priority:** HIGH — low effort, high value

### What
Before generating a reply, user picks tone from fixed pills + Custom option:

```
[ Professional ]  [ Friendly ]  [ Concise ]  [ Formal ]  [ Custom... ]
```

Custom tone text is configurable in Settings page and saved per-user.

### Implementation Notes
- **Frontend:** Tone pills above "AI Reply" button. Send `tone` field in generate-reply payload.
- **Backend:** `ai_service.py` appends tone instruction to system prompt (composable with user instruction).
- **Settings:** New "Default Tone" setting — persisted in `users.preferences` JSONB. Falls back to "Professional" if not set.
- Tone stored in `ai_responses.generation_metadata` JSON field (add to model).

### Acceptance Criteria
- [ ] Tone pill selector visible before generate
- [ ] Different tones produce different outputs
- [ ] Custom tone configurable in Settings, pre-selected on next visit

---

## 3. Email Priority / Urgency Classifier

**Status:** 🔲  
**Priority:** MEDIUM

### What
Badge each email card: 🔴 Urgent / 🟡 Important / 🟢 Normal. Classified by Ollama using subject + snippet.

### Implementation Notes
- **Backend:** Batch classify after fetch. Prompt is one-shot, label-only output.
  ```
  Classify urgency: URGENT, IMPORTANT, or NORMAL.
  Subject: {subject}
  Snippet: {snippet}
  Reply with only the label.
  ```
- Cache in `emails.urgency` column (Alembic migration: `ALTER TABLE emails ADD COLUMN urgency VARCHAR`).
- Re-classify if `updated_at` > 1hr old or urgency is NULL.
- Model: use best available in Ollama (same as reply model unless user sets a different one in Settings).
- **Frontend:** Color dot on `EmailCard`. Filter pills on inbox: `All | Urgent | Important`.

### Acceptance Criteria
- [ ] Badge visible on email cards
- [ ] Inbox filterable by urgency
- [ ] Not re-classified every page load (cached in DB)

---

## 4. Streaming AI Reply Generation

**Status:** 🔲  
**Priority:** HIGH — kills the frozen-UI problem

### What
Stream Ollama response token-by-token into the reply editor. Editor is **locked (read-only)** during streaming. "Stop" button cancels stream.

### Implementation Notes
- **Backend:** FastAPI `StreamingResponse` with SSE, using `httpx` async against Ollama `/api/generate?stream=true`.
  ```python
  async def generator():
      async for chunk in ollama_stream(...):
          yield f"data: {json.dumps({'token': chunk})}\n\n"
      yield "data: [DONE]\n\n"
  return StreamingResponse(generator(), media_type="text/event-stream")
  ```
- **Frontend:** `fetch` + `ReadableStream`. Accumulate into state. Textarea `disabled` while streaming. "Stop" button aborts the fetch.
- On `[DONE]`: textarea becomes editable, full text saved to DB via `PATCH /api/responses/{id}`.

### Acceptance Criteria
- [ ] Text streams word-by-word into editor
- [ ] Editor locked (grey out) during stream
- [ ] "Stop Generating" button aborts stream and unlocks editor with partial text
- [ ] Text saved to DB after stream ends

---

## 5. Smart Reply Suggestions (Quick-Pick)

**Status:** 🔲  
**Priority:** MEDIUM

### What
3 one-click short reply pills below each email thread. Clicking inserts into reply editor.

```
[ Sounds good! ]  [ Let's schedule a call ]  [ Can you clarify? ]
```

### Implementation Notes
- **Backend:** `GET /api/emails/{email_id}/quick-replies` — returns `{ suggestions: string[] }`.
  Prompt: "Generate exactly 3 short email replies (under 12 words each). Return as JSON array."
- Cached per `gmail_message_id` in a simple in-memory LRU or `email.quick_replies` nullable JSON column.
- **Frontend:** Pills below thread. On click → set `replyText` state.

### Acceptance Criteria
- [ ] 3 suggestions below each thread
- [ ] Click inserts into reply editor
- [ ] Context-relevant per email

---

## 6. Reply Draft Auto-Save

**Status:** 🔲  
**Priority:** MEDIUM — data safety

### What
Auto-save reply textarea to DB on debounce (2s). Draft restored on return.

### Implementation Notes
- **Backend:** `PATCH /api/responses/{response_id}` — update `edited_text`, set `status = EDITED`.
- **Frontend:** `useAutoSave(text, responseId)` hook — debounce 2s → PATCH. Show "Draft saved ✓" toast.
- No new DB columns; uses existing `ai_responses.edited_text`.

### Acceptance Criteria
- [ ] "Draft saved ✓" appears after edits
- [ ] Draft restored on revisit
- [ ] Cleared after send

---

## 7. Keyboard Shortcuts

**Status:** 🔲  
**Priority:** LOW-MEDIUM — power user polish

| Shortcut | Action |
|----------|--------|
| `R` | Generate AI Reply (email open) |
| `Ctrl+Enter` | Send reply |
| `E` | Focus reply editor |
| `Esc` | Close modal/panel |
| `?` | Show shortcuts overlay |

### Implementation Notes
- Frontend only. `useKeyboardShortcuts` global hook. Disabled when typing in textarea.

### Acceptance Criteria
- [ ] `?` shows overlay
- [ ] `R` triggers generation
- [ ] `Ctrl+Enter` sends (still shows confirmation)

---

## 8. AI Provider & Model Switcher in Settings

**Status:** 🔲  
**Priority:** MEDIUM

### What
Settings page supports **two AI providers**: Ollama (local) and Gemini (cloud). User can switch provider and pick model from each provider's list. Gemini API key and model names are stored in `.env` and surfaced in the Settings UI — ready for when Gemini is wired up.

### UI Sketch (Settings Page — AI Section)
```
AI Provider
-----------
( ) Ollama (local)      ( ) Gemini (cloud)

Ollama Models                     Gemini Models
[ llama3.2          ▼ ]           [ gemini-1.5-flash   ▼ ]
                                  [ gemini-1.5-pro         ]
[ Test Connection ]               [ gemini-2.0-flash       ]

Gemini API Key
--------------
[ sk-...hidden...           ] [ Save ]

Note: Gemini provider is not yet active. Key is stored for future use.
```

### Ollama Side
- `GET /api/settings/models/ollama` — proxies `http://localhost:11434/api/tags`, returns `{ models: [{name, size}] }`.
- Active model stored in `users.preferences.ollama_model` JSONB.
- Falls back to `OLLAMA_MODEL` env var.
- "Test Connection" ping: `GET /api/settings/models/ollama/test`.

### Gemini Side
- `GET /api/settings/models/gemini` — returns static list from env var `GEMINI_MODELS` (comma-separated) or hardcoded defaults.
- Default model list (hardcoded fallback):
  ```
  gemini-1.5-flash
  gemini-1.5-pro
  gemini-2.0-flash
  gemini-2.0-flash-lite
  ```
- Active Gemini model stored in `users.preferences.gemini_model` JSONB.
- API key stored in `GEMINI_API_KEY` env var (backend only, never sent to frontend).
- `PATCH /api/settings/gemini-key` — updates `GEMINI_API_KEY` in server-side config (or writes to `.env.local`). No key ever returned to frontend — only masked last 4 chars.
- Gemini integration itself is a **future feature** — the key/model config is wired now so it's ready. Calls currently fall back to Ollama.

### Backend env vars to add
```env
GEMINI_API_KEY=                     # blank until user adds it
GEMINI_MODELS=gemini-1.5-flash,gemini-1.5-pro,gemini-2.0-flash,gemini-2.0-flash-lite
ACTIVE_PROVIDER=ollama              # ollama | gemini
```

### DB (users.preferences JSONB)
```json
{
  "active_provider": "ollama",
  "ollama_model": "llama3.2",
  "gemini_model": "gemini-1.5-flash"
}
```

### Alembic
`ADD COLUMN preferences JSONB DEFAULT '{}'` to `users` (one migration covers both providers).

### Acceptance Criteria
- [ ] Settings shows both Ollama and Gemini sections
- [ ] Ollama model list fetched live from Ollama API
- [ ] Gemini model list shown from env / hardcoded list
- [ ] Active provider and model persist per user in DB
- [ ] Gemini API key can be entered and saved (masked in UI)
- [ ] "Test Connection" works for Ollama
- [ ] Switching provider/model takes effect on next AI generation

---

## 9. Email Search (In-App)

**Status:** 🔲  
**Priority:** MEDIUM — bundled with Feature #0 (Full Inbox)

### What
Search bar filters current-page emails by sender/subject/snippet. Client-side, debounced 300ms.

> **Note:** This is built as part of Feature #0 (Full Inbox). Not a separate build phase.

### Acceptance Criteria
- [ ] Real-time filter on current page
- [ ] Works across sender, subject, snippet
- [ ] "No results" empty state

---

## 10. Dark Mode

**Status:** 🔲  
**Priority:** LOW — implement last

### What
Full dark/light toggle. Tailwind `dark:` classes. Persisted in localStorage. Respects system preference on first load.

### Implementation Notes
- Frontend only. `ThemeProvider` + `useTheme` hook. Toggle in Header.
- No backend needed.

### Acceptance Criteria
- [ ] Polished dark mode (not just inverted)
- [ ] Persists across refresh
- [ ] Auto-detects system preference

---

## Implementation Roadmap (Updated)

```
Phase 0  →  Full Inbox + Pagination (#0)         ← user-requested, core redesign
              Includes: tabs, all-email view, search bar, read/unread UI

Phase A  →  Streaming AI Reply (#4)              ← UX critical, enables Chat Panel
Phase B  →  Tone Selector (#2)                   ← fast win on top of streaming
Phase C  →  AI Chat Panel (#1)                   ← biggest differentiator
Phase D  →  Smart Reply Suggestions (#5)         ← impressive demo feature
Phase E  →  Email Priority Classifier (#3)       ← intelligence layer
Phase F  →  Reply Draft Auto-Save (#6)           ← safety net
Phase G  →  AI Provider & Model Switcher (#8)    ← settings polish (Ollama + Gemini stub)
Phase H  →  Keyboard Shortcuts (#7)              ← power user
Phase I  →  Dark Mode (#10)                      ← last, as decided
```

> Search (#9) is shipped as part of Phase 0, not a standalone phase.

---

## Alembic Migrations Needed

| Feature | Migration |
|---------|-----------|
| #0 Full Inbox | None (Gmail API direct, no new columns) |
| #3 Urgency | `ADD COLUMN urgency VARCHAR` to `emails` |
| #2 Tone | `ADD COLUMN generation_metadata JSONB` to `ai_responses` |
| #8 Provider Switcher | `ADD COLUMN preferences JSONB DEFAULT '{}'` to `users` |
| #1 Chat Panel | New `chat_sessions` table (SQLite, separate DB file) |

## New Env Vars to Add (backend `.env`)

```env
# AI Provider (Feature #8)
GEMINI_API_KEY=                     # blank until user fills it in
GEMINI_MODELS=gemini-1.5-flash,gemini-1.5-pro,gemini-2.0-flash,gemini-2.0-flash-lite
ACTIVE_PROVIDER=ollama              # ollama | gemini
```

---

*Last updated: 2026-10-02 by Antigravity + User decisions incorporated.*
