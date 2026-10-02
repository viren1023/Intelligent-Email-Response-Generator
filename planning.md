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

**Status:** ✅ Done — branch `feature/improvements`  
**Priority:** HIGHEST — core product improvement (user-requested)

### Acceptance Criteria
- [x] Dashboard shows all emails by default (Primary tab)
- [x] Unread tab reuses existing `/api/emails/unread` endpoint
- [x] Sent tab shows sent mail
- [x] Next/Prev pagination works correctly
- [x] Read emails visually distinct (no bold, no dot)
- [x] Search filters current page results in real-time
- [x] Empty state per tab ("No sent emails", etc.)
- [x] AI-replied badge shows on emails with status SENT in DB

---

## 1. AI Chat Panel (In-App Assistant)

**Status:** ✅ Done  
**Priority:** HIGH — biggest UX differentiator

### Acceptance Criteria
- [x] Panel opens/closes from email view
- [x] Messages stream in real-time
- [x] History persists in SQLite across refresh (per email)
- [x] Ollama unavailable → graceful error in panel

---

## 2. Tone / Style Selector

**Status:** ✅ Done  
**Priority:** HIGH — low effort, high value

### Acceptance Criteria
- [x] Tone pill selector visible before generate
- [x] Different tones produce different outputs
- [x] Custom tone configurable in Settings, pre-selected on next visit

---

## 3. Email Priority / Urgency Classifier

**Status:** ✅ Done  
**Priority:** MEDIUM

### Acceptance Criteria
- [x] Badge visible on email cards (🔴 Urgent / 🟡 Important / 🟢 Normal)
- [x] Inbox filterable by urgency
- [x] Not re-classified every page load (cached in DB)

---

## 4. Streaming AI Reply Generation

**Status:** ✅ Done  
**Priority:** HIGH — kills the frozen-UI problem

### Acceptance Criteria
- [x] Text streams word-by-word into editor
- [x] Editor locked (grey out) during stream
- [x] "Stop Generating" button aborts stream and unlocks editor with partial text
- [x] Text saved to DB after stream ends

---

## 5. Smart Reply Suggestions (Quick-Pick)

**Status:** ✅ Done  
**Priority:** MEDIUM

### Acceptance Criteria
- [x] 3 suggestions below each thread
- [x] Click inserts into reply editor
- [x] Context-relevant per email

---

## 6. Reply Draft Auto-Save

**Status:** ✅ Done  
**Priority:** MEDIUM — data safety

### Acceptance Criteria
- [x] "Draft saved ✓" appears after edits (2s debounce)
- [x] Draft restored on revisit
- [x] Cleared after send

---

## 7. Keyboard Shortcuts

**Status:** ✅ Done  
**Priority:** LOW-MEDIUM — power user polish

| Shortcut | Action |
|----------|--------|
| `R` | Generate AI Reply (email open) |
| `Ctrl+Enter` | Send reply |
| `E` | Focus reply editor |
| `Esc` | Close modal/panel |
| `?` | Show shortcuts overlay |

### Acceptance Criteria
- [x] `?` shows overlay
- [x] `R` triggers generation
- [x] `Ctrl+Enter` sends (still shows confirmation)

---

## 8. AI Provider & Model Switcher in Settings

**Status:** ✅ Done  
**Priority:** MEDIUM

### Acceptance Criteria
- [x] Settings shows both Ollama and Gemini sections
- [x] Ollama model list fetched live from Ollama API
- [x] Gemini model list shown from env / hardcoded list
- [x] Active provider and model persist per user in DB
- [x] Gemini API key can be entered and saved (masked in UI)
- [x] "Test Connection" works for Ollama
- [x] Switching provider/model takes effect on next AI generation

---

## 9. Email Search (In-App)

**Status:** ✅ Done  
**Priority:** MEDIUM — bundled with Feature #0 (Full Inbox)

### Acceptance Criteria
- [x] Real-time filter on current page
- [x] Works across sender, subject, snippet
- [x] "No results" empty state

---

## 10. Dark Mode

**Status:** ✅ Done  
**Priority:** LOW — implement last

### Acceptance Criteria
- [x] Polished dark mode (not just inverted)
- [x] Persists across refresh
- [x] Auto-detects system preference

---

## Implementation Roadmap (Completed)

```
Phase 0  →  Full Inbox + Pagination (#0)         ✅ Done
Phase A  →  Streaming AI Reply (#4)              ✅ Done
Phase B  →  Tone Selector (#2)                   ✅ Done
Phase C  →  AI Chat Panel (#1)                   ✅ Done
Phase D  →  Smart Reply Suggestions (#5)         ✅ Done
Phase E  →  Email Priority Classifier (#3)       ✅ Done
Phase F  →  Reply Draft Auto-Save (#6)           ✅ Done
Phase G  →  AI Provider & Model Switcher (#8)    ✅ Done
Phase H  →  Keyboard Shortcuts (#7)              ✅ Done
Phase I  →  Dark Mode (#10)                      ✅ Done
```
