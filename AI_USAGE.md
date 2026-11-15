# AI Usage Disclosure — BrandGuard AI

This file documents which parts of the project were AI-assisted.
Required for hackathon submission.

## AI Tools Used
- **Antigravity (Google DeepMind)** — primary coding assistant throughout all stages

## AI-Assisted Work
| Area | What AI did | Human review |
|------|-------------|--------------|
| Project scaffold & config | Generated package.json, vite/tailwind/postcss config, folder structure | Reviewed and approved |
| Database schema & RLS | Generated SQL migrations and RLS policies | Reviewed for correctness |
| Audit pipeline logic | Generated rule engine, Gemini prompt, zod validation | Reviewed and tested |
| UI components | Generated layout, table, form, button components | Reviewed for design fit |
| Seed data | Generated synthetic LearnBridge demo data | Reviewed for realism |
| README / STATUS / docs | Generated initial drafts | Updated with real values |

## Human-Written Work
- All environment values and secrets (never shared with AI)
- Final testing and verification at each stage
- Decisions on which findings to accept/reject in demo flow
- Submission form narrative

## AI Limitations Acknowledged
- AI-generated code was always reviewed before commit
- No AI was used to bypass security checks or RLS policies
- Gemini outputs in the product itself are validated with zod before use
