-- ============================================================
-- BrandGuard AI — Migration 001: Schema + RLS + pgvector
-- Run this in the Supabase SQL editor (Project > SQL Editor > New query)
-- ============================================================

-- Enable pgvector extension (required for embeddings)
create extension if not exists vector with schema extensions;

-- ============================================================
-- TABLES
-- ============================================================

-- profiles: one row per auth user, holds role and department
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  role        text not null default 'employee' check (role in ('employee', 'brand_manager')),
  department  text,
  created_at  timestamptz not null default now()
);

-- brand_rules: insert-only versioned rules (never update an approved row's value)
create table public.brand_rules (
  id             uuid primary key default gen_random_uuid(),
  rule_key       text not null,          -- groups versions of the same rule
  type           text not null check (type in ('banned_term','preferred_term','fact','slogan','approved_claim','guideline')),
  title          text not null,
  content        text not null,          -- human-readable explanation
  value          text,                   -- e.g. price for fact rules
  keywords       text[] not null default '{}', -- words/phrases the rule engine matches
  replacement    text,                   -- for preferred_term rules
  status         text not null default 'draft' check (status in ('draft','approved','archived')),
  effective_from timestamptz not null default now(),
  approved_by    uuid references public.profiles(id),
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now()
);

-- submissions: each piece of content submitted for review
create table public.submissions (
  id                   uuid primary key default gen_random_uuid(),
  author_id            uuid not null references public.profiles(id) on delete cascade,
  text                 text not null,
  source               text not null check (source in ('typed','docx','pdf')),
  filename             text,             -- nullable, only for uploads
  version              int not null default 1,
  parent_submission_id uuid references public.submissions(id),
  status               text not null default 'pending_review' check (status in ('pending_review','needs_changes','approved','rejected')),
  manager_comment      text,
  created_at           timestamptz not null default now()
);

-- findings: individual issues found during audit
create table public.findings (
  id              uuid primary key default gen_random_uuid(),
  submission_id   uuid not null references public.submissions(id) on delete cascade,
  rule_id         uuid references public.brand_rules(id),
  rule_snapshot   text not null,         -- copy of rule text at audit time (immutable record)
  category        text not null check (category in ('terminology','fact','claim','tone','other')),
  severity        text not null check (severity in ('high','medium','low')),
  original_text   text not null,         -- the exact substring flagged
  explanation     text not null,
  suggestion      text not null,
  source          text not null check (source in ('rule_engine','gemini')),
  memory_case_id  uuid,                  -- the feedback_memory row that informed this finding
  review_status   text not null default 'pending' check (review_status in ('pending','confirmed','rejected')),
  employee_action text not null default 'none' check (employee_action in ('none','accepted','rejected','edited')),
  final_correction text,
  reviewed_by     uuid references public.profiles(id),
  reviewed_at     timestamptz
);

-- feedback_memory: confirmed cases stored as embeddings for retrieval
-- embedding dimension = 768 (gemini-embedding-2 at recommended size)
create table public.feedback_memory (
  id               uuid primary key default gen_random_uuid(),
  finding_id       uuid references public.findings(id),
  rule_id          uuid references public.brand_rules(id),
  case_text        text not null,        -- the original flagged text
  final_correction text,
  embedding        extensions.vector(768) not null,
  status           text not null default 'active' check (status in ('active','revoked')),
  reviewed_by      uuid not null references public.profiles(id),
  created_at       timestamptz not null default now()
);

-- assistant_questions: log of every Brand Assistant query
create table public.assistant_questions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  question   text not null,
  answer     text not null,
  rule_ids   uuid[] not null default '{}',
  covered    boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================
-- VECTOR INDEX for fast cosine similarity search
-- ============================================================
create index on public.feedback_memory using ivfflat (embedding extensions.vector_cosine_ops)
  with (lists = 10);

-- ============================================================
-- match_memory FUNCTION
-- Returns the closest ACTIVE feedback_memory rows by cosine similarity.
-- Called by /api/audit to retrieve relevant past confirmed cases.
-- ============================================================
create or replace function public.match_memory(
  query_embedding  extensions.vector(768),
  match_count      int     default 3,
  min_similarity   float   default 0.75
)
returns table (
  id               uuid,
  case_text        text,
  final_correction text,
  rule_id          uuid,
  finding_id       uuid,
  created_at       timestamptz,
  similarity       float
)
language sql stable
as $$
  select
    fm.id,
    fm.case_text,
    fm.final_correction,
    fm.rule_id,
    fm.finding_id,
    fm.created_at,
    1 - (fm.embedding <=> query_embedding) as similarity
  from public.feedback_memory fm
  where fm.status = 'active'
    and 1 - (fm.embedding <=> query_embedding) >= min_similarity
  order by fm.embedding <=> query_embedding
  limit match_count;
$$;

-- ============================================================
-- AUTO-CREATE PROFILE on sign-up
-- Trigger fires after a new user is inserted into auth.users.
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'employee'  -- all self-sign-ups start as employee
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Enable on every table. Comments explain each policy.
-- ============================================================

alter table public.profiles           enable row level security;
alter table public.brand_rules        enable row level security;
alter table public.submissions        enable row level security;
alter table public.findings           enable row level security;
alter table public.feedback_memory    enable row level security;
alter table public.assistant_questions enable row level security;

-- Helper: check if the calling user is a brand_manager
create or replace function public.is_manager()
returns boolean language sql security definer stable
as $$
  select role = 'brand_manager'
  from public.profiles
  where id = auth.uid();
$$;

-- --- profiles ---
-- Users see and update only their own profile
create policy "profiles: own read"   on public.profiles for select using (id = auth.uid());
create policy "profiles: own update" on public.profiles for update using (id = auth.uid());
-- Managers can read all profiles (needed for Insights)
create policy "profiles: manager read all" on public.profiles for select using (public.is_manager());

-- --- brand_rules ---
-- Any authenticated user can read APPROVED rules (needed for audit + assistant)
create policy "rules: read approved"       on public.brand_rules for select using (auth.uid() is not null and status = 'approved');
-- Managers can read all rules (including draft/archived)
create policy "rules: manager read all"    on public.brand_rules for select using (public.is_manager());
-- Only managers can insert new rules (insert-only versioning)
create policy "rules: manager insert"      on public.brand_rules for insert with check (public.is_manager());
-- Only managers can update rules (e.g. changing status to approved/archived)
create policy "rules: manager update"      on public.brand_rules for update using (public.is_manager());

-- --- submissions ---
-- Employees read/write only their own submissions
create policy "submissions: own read"      on public.submissions for select using (author_id = auth.uid());
create policy "submissions: own insert"    on public.submissions for insert with check (author_id = auth.uid());
-- Employees can update their own submission (e.g. resubmit)
create policy "submissions: own update"    on public.submissions for update using (author_id = auth.uid());
-- Managers read and update all submissions (to approve/reject)
create policy "submissions: manager all"   on public.submissions for all using (public.is_manager());

-- --- findings ---
-- Employees see findings for their own submissions only
create policy "findings: own read"         on public.findings for select
  using (exists (select 1 from public.submissions s where s.id = submission_id and s.author_id = auth.uid()));
-- Employees can update their own findings (accept/reject/edit)
create policy "findings: own update"       on public.findings for update
  using (exists (select 1 from public.submissions s where s.id = submission_id and s.author_id = auth.uid()));
-- The audit API (service role) inserts findings — no RLS needed for service role
-- Managers read and update all findings (confirm/reject)
create policy "findings: manager all"      on public.findings for all using (public.is_manager());

-- --- feedback_memory ---
-- Only managers can read and write memory
create policy "memory: manager all"        on public.feedback_memory for all using (public.is_manager());

-- --- assistant_questions ---
-- Employees read and insert only their own questions
create policy "assistant: own read"        on public.assistant_questions for select using (user_id = auth.uid());
create policy "assistant: own insert"      on public.assistant_questions for insert with check (user_id = auth.uid());
-- Managers read all questions (for Insights: unanswered questions list)
create policy "assistant: manager read all" on public.assistant_questions for select using (public.is_manager());
