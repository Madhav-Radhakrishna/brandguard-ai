-- ============================================================
-- BrandGuard AI — Migration 002: Seed Data (LearnBridge demo)
-- Run AFTER 001_schema.sql
-- All data is SYNTHETIC and labelled for demo purposes.
-- ============================================================

-- ============================================================
-- LearnBridge Brand Rules
-- ============================================================

-- We insert with a fixed created_by of null for seed data.
-- After you create the manager user, you can backfill created_by if needed.

-- 1. FACT: Data Science course price
insert into public.brand_rules (rule_key, type, title, content, value, keywords, status, effective_from)
values (
  'fact_ds_price',
  'fact',
  'Data Science Course Price',
  'The official price for the Data Science course is ₹1,199. Any content mentioning this course must use this exact price.',
  '₹1,199',
  array['data science course', 'data science'],
  'approved',
  now() - interval '30 days'
);

-- 2. FACT: Web Development course price
insert into public.brand_rules (rule_key, type, title, content, value, keywords, status, effective_from)
values (
  'fact_webdev_price',
  'fact',
  'Web Development Course Price',
  'The official price for the Web Development course is ₹899. Any content mentioning this course must use this exact price.',
  '₹899',
  array['web development course', 'web development'],
  'approved',
  now() - interval '30 days'
);

-- 3. BANNED TERM: cheapest
insert into public.brand_rules (rule_key, type, title, content, keywords, replacement, status, effective_from)
values (
  'banned_cheapest',
  'banned_term',
  'Banned: "cheapest"',
  'The word "cheapest" is not approved. It undermines our value proposition and may imply poor quality. Use "affordable learning" or "best value" instead.',
  array['cheapest'],
  'affordable learning',
  'approved',
  now() - interval '30 days'
);

-- 4. BANNED TERM: guaranteed placement
insert into public.brand_rules (rule_key, type, title, content, keywords, replacement, status, effective_from)
values (
  'banned_guaranteed_placement',
  'banned_term',
  'Banned: "guaranteed placement"',
  'LearnBridge cannot guarantee job placement. This phrase is legally risky and factually unsupported. Use "career support" or "placement assistance" instead.',
  array['guaranteed placement', 'guaranteed job', 'job guarantee'],
  'career support',
  'approved',
  now() - interval '30 days'
);

-- 5. BANNED TERM: No.1 / best in India (unsupported superlatives)
insert into public.brand_rules (rule_key, type, title, content, keywords, replacement, status, effective_from)
values (
  'banned_superlatives',
  'banned_term',
  'Banned: Unsupported Superlatives',
  'Claims like "No.1", "best in India", or "India''s leading" are unsupported and cannot be verified. Do not use them in any content.',
  array['no.1', 'no. 1', 'number 1', 'number one', 'best in india', 'india''s best', 'india''s leading', '#1'],
  '',
  'approved',
  now() - interval '30 days'
);

-- 6. TONE GUIDELINE
insert into public.brand_rules (rule_key, type, title, content, keywords, status, effective_from)
values (
  'guideline_tone',
  'guideline',
  'Brand Tone of Voice',
  'All LearnBridge content must be friendly, clear, and jargon-free. Avoid hype, exaggeration, and ALL CAPS for emphasis. Write as if you are a knowledgeable friend, not a salesperson.',
  array[],
  'approved',
  now() - interval '30 days'
);

-- 7. APPROVED SLOGAN
insert into public.brand_rules (rule_key, type, title, content, value, keywords, status, effective_from)
values (
  'slogan_main',
  'slogan',
  'Official LearnBridge Slogan',
  'The only approved tagline is "Learn at your pace, grow at your best." Do not create variations or alternate slogans without manager approval.',
  'Learn at your pace, grow at your best.',
  array['learn at your pace', 'grow at your best'],
  'approved',
  now() - interval '30 days'
);

-- 8. PREFERRED TERM: courses → learning programs
insert into public.brand_rules (rule_key, type, title, content, keywords, replacement, status, effective_from)
values (
  'preferred_programs',
  'preferred_term',
  'Preferred: "learning programs" over "courses"',
  'While "courses" is not banned, "learning programs" better reflects our premium positioning. Prefer it in marketing content.',
  array['courses'],
  'learning programs',
  'approved',
  now() - interval '30 days'
);

-- 9. DRAFT rule (not approved — to show the pending state in Knowledge Hub)
insert into public.brand_rules (rule_key, type, title, content, keywords, status, effective_from)
values (
  'banned_free_trial_draft',
  'banned_term',
  'DRAFT: Banned "free trial" claim',
  'We do not offer free trials. This rule is pending legal review before approval.',
  array['free trial', 'try for free'],
  'draft',
  now()
);

-- ============================================================
-- SQL to set roles for your two demo users
-- Run this AFTER creating the users in Supabase Auth dashboard.
-- Replace the emails with the ones you used.
-- ============================================================

-- Set brand_manager role (run after creating manager user):
-- update public.profiles set role = 'brand_manager', full_name = 'Priya Sharma'
-- where id = (select id from auth.users where email = 'manager@learnbridge.demo');

-- Set employee name (run after creating employee user):
-- update public.profiles set full_name = 'Rahul Verma'
-- where id = (select id from auth.users where email = 'employee@learnbridge.demo');
