# BrandGuard AI

> **"Create freely. Publish consistently."**

AI-powered brand compliance reviewer for teams. Employees submit content; the rule engine + Gemini flag issues before publication.

---

## Live URL
_To be added after Vercel deploy_

## Demo Logins (synthetic data)
| Role | Email | Password |
|------|-------|----------|
| Brand Manager | manager@learnbridge.demo | _set in Supabase dashboard_ |
| Employee | employee@learnbridge.demo | _set in Supabase dashboard_ |

## Setup (local dev)
```bash
cp .env.example .env   # fill in your keys
npm install
npm run dev            # http://localhost:5173
```

## Architecture
- **Frontend**: React + Vite + Tailwind CSS, React Router
- **Backend**: Vercel serverless functions in `/api`
- **Database / Auth / Vectors**: Supabase (Postgres + pgvector + RLS)
- **AI**: Google Gemini API
  - Generation: `gemini-1.5-flash` (via `GEMINI_MODEL` env var)
  - Embeddings: `text-embedding-004` — **768 dimensions** (via `GEMINI_EMBED_MODEL` env var)

## Models & APIs Used
- Google Gemini 1.5 Flash — tone & claim analysis, Brand Assistant answers
- Google text-embedding-004 (768-dim) — memory retrieval via cosine similarity
- Supabase pgvector — vector storage and `match_memory` SQL function

## Known Limitations
- Scanned / image PDFs are not supported (no OCR)
- Memory informs but never overrides policy
- Gemini outputs are validated and may be discarded if malformed
- No real-time notifications; all review is manual

## Folder Structure
```
/api          Vercel serverless functions (server-side only)
/src          React frontend
/supabase     SQL migration files
```
