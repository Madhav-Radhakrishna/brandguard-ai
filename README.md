# BrandGuard AI

> **"Create freely. Publish consistently."**

AI-powered brand compliance reviewer for teams. Employees submit content; the rule engine + Gemini flag issues before publication. Managers review, correct, and build a living memory of past cases.

---

## Live Demo
_Deployed on Vercel — URL added after deployment._

## Demo Logins
| Role | Email | Password |
|------|-------|----------|
| Brand Manager | manager@learnbridge.demo | _(set in Supabase dashboard)_ |
| Employee | employee@learnbridge.demo | _(set in Supabase dashboard)_ |

---

## Feature Overview

| Stage | Feature | Status |
|-------|---------|--------|
| 1 | Auth + Role-based access (employee / brand_manager) | ✅ |
| 2 | Knowledge Hub — rule management (add, approve, archive, versioning) | ✅ |
| 3 | Submit & Audit — rule engine + Gemini tone/claim analysis | ✅ |
| 4 | Review Workflow — employee accept/edit/reject + manager confirm/decision | ✅ |
| 5 | Memory Loop — confirmed findings stored as embeddings, inform future audits | ✅ |
| 6 | Brand Assistant — chat UI grounded in approved rules; graceful fallback | ✅ |
| 7 | Insights — analytics dashboard with filters (date, category, severity, status) | ✅ |
| 8 | File Upload — DOCX (mammoth) + PDF (pdfjs-dist) text extraction, client-side | ✅ |

---

## Architecture

```
Browser (React + Vite + Tailwind)
  │
  ├── /api/audit.js        Rule engine + Gemini + memory retrieval
  ├── /api/assistant.js    Brand Q&A chat (Gemini + approved rules)
  └── /api/memory.js       Store/revoke confirmed findings as memory cases
         │
         ├── Supabase Postgres + pgvector (RLS on all tables)
         └── Google Gemini API
               ├── gemini-1.5-flash   — tone & claim generation
               └── text-embedding-004 — 768-dim memory embeddings
```

## Tech Stack
- **Frontend**: React 18, Vite, Tailwind CSS, React Router v6, Recharts
- **Backend**: Vercel Serverless Functions (`/api/*.js`)
- **Database**: Supabase (Postgres + pgvector + Row Level Security)
- **AI**: Google Gemini API (generation + embeddings)
- **File parsing**: mammoth (DOCX), pdfjs-dist (PDF) — both client-side

---

## Local Setup

```bash
cp .env.example .env    # fill in your keys
npm install
npm run dev             # http://localhost:5173
```

### Environment Variables
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-1.5-flash
GEMINI_EMBED_MODEL=text-embedding-004
```

### Supabase Setup
Run migrations in order in the Supabase SQL Editor:
1. `supabase/001_schema.sql` — tables, RLS policies, pgvector, `match_memory` function
2. `supabase/002_seed.sql` — demo users, demo brand rules

---

## Audit Pipeline

```
User submits text / DOCX / PDF
        │
        ▼
  Rule Engine (sync, deterministic)
  ├── Banned terms    → severity: high
  ├── Preferred terms → severity: low
  └── Price/fact check → severity: high
        │
        ├── Memory retrieval (cosine similarity via pgvector, 5s timeout)
        │     └── Past confirmed cases annotated with ★
        │
        └── Gemini (tone + claim analysis, 7s timeout, 1 retry)
              └── Structured JSON output validated against schema
        │
        ▼
  Findings saved → Employee reviews → Manager confirms → Memory stored
```

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Rule engine first, Gemini second | Deterministic rules always run; Gemini augments with tone/claim analysis and degrades gracefully on timeout |
| Gemini timeouts (7s + 5s retry) | Prevents the UI from hanging on slow API responses |
| Client-side file extraction | Avoids multipart server complexity; mammoth + pdfjs-dist work well in-browser |
| `systemInstruction` field | Correct Gemini API way to pass system prompt; avoids consecutive `user` turn errors |
| Fallback on 403/429 | Assistant returns rule-based answers when Gemini quota is exhausted |
| Insert-only rule versioning | Approved rules are never mutated; editing creates a new row with same `rule_key` |
| Memory as soft signal | Past cases inform Gemini prompt but never override policy rules |

---

## Known Limitations
- Scanned / image PDFs are not supported (no OCR)
- Memory informs but never overrides approved policy
- Gemini outputs are validated and may be discarded if malformed
- No real-time notifications; all review is asynchronous
- Brand Assistant fallback is keyword-based when Gemini is unavailable

---

## Folder Structure
```
/api              Vercel serverless functions
  audit.js        POST /api/audit
  assistant.js    POST /api/assistant
  memory.js       POST/PATCH /api/memory
  _lib/
    geminiClient.js    embedText + runGeminiAudit
    ruleEngine.js      Deterministic rule checker
    supabaseAdmin.js   Service-role Supabase client

/src
  pages/          React pages (one per route)
  components/     Shared UI components
  hooks/          useAuth
  lib/            Supabase browser client
  utils/          highlightText

/supabase
  001_schema.sql  Tables + RLS + pgvector
  002_seed.sql    Demo data
```
