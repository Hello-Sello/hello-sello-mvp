-- ============================================================================
-- Migration — Notification-preference stub (SET-04, D-19..D-22)
-- ----------------------------------------------------------------------------
-- A forward-shaped notification-preference store: a lookup trio modelled to
-- support in-app + marketing opt-out LATER, but wiring EMAIL only now. No dead
-- toggle ships — in a transactional-only v1 every category is
-- is_transactional = TRUE, so the future SET-03 send-check
--   if category.is_transactional then send else consult preference.enabled
-- is a forward-compatible pass-through (nothing is genuinely toggleable yet).
--
-- Three tables (mirrors the audit_action_type / auditable_content_type lookup
-- shape + the business_category → company_business_category lookup-then-junction
-- pair, 20260704090000):
--   • notification_category   — WHAT can notify (+ the is_transactional honesty flag)
--   • notification_channel    — HOW (email wired; in_app reserved, not enforced)
--   • notification_preference — per-person category × channel enabled join
--
-- RLS mirrors the phase-1 conventions (20260607170000_rls_policies.sql):
--   • lookup tables        → `<name>_read` FOR SELECT TO authenticated USING (true)
--   • preference (own-row) → SELECT only, scoped person_id = auth.uid()
--     (mirrors person_update's self-scope + contact_all's person_id = auth.uid()).
-- No INSERT/UPDATE/DELETE policy ⇒ writes are denied by default under RLS: v1
-- renders the Notifications settings section READ-ONLY (rendered in 13-09), so
-- nothing is toggled. RLS is the authorization boundary (PROJECT.md), so the
-- absence of a write policy IS the "SELECT only" grant.
-- The phase-1 "enable RLS on every table" loop already ran, so these new tables
-- enable RLS explicitly here. Table grants come from Supabase default privileges.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. notification_category — WHAT can notify. is_transactional = TRUE ⇒ always
--    send / bypass opt-out (a legal/operational message the user can't mute).
--    All four v1 categories are transactional → nothing is genuinely toggleable.
-- ----------------------------------------------------------------------------
CREATE TABLE public.notification_category (
  code             VARCHAR(50) PRIMARY KEY,
  description      TEXT NOT NULL,
  is_transactional BOOLEAN NOT NULL DEFAULT TRUE
);
INSERT INTO public.notification_category (code, description, is_transactional) VALUES
  ('verification', 'Company verification outcome', TRUE),
  ('join',         'Join-request lifecycle',        TRUE),
  ('welcome',      'Welcome on onboarding',         TRUE),
  ('membership',   'Added/removed from a company',  TRUE)
ON CONFLICT (code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. notification_channel — HOW a category reaches a person. v1 wires 'email'
--    only; 'in_app' is modelled (D-21) but NOT enforced (reserved for later).
-- ----------------------------------------------------------------------------
CREATE TABLE public.notification_channel (
  code        VARCHAR(20) PRIMARY KEY,
  description TEXT NOT NULL
);
INSERT INTO public.notification_channel (code, description) VALUES
  ('email',  'Email'),
  ('in_app', 'In-app (reserved, not wired in v1)')
ON CONFLICT (code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. notification_preference — per-person category × channel opt-in. Empty in
--    v1 (no write path ships); the future SET-03 sender consults .enabled only
--    for a non-transactional category. One active row per (person, category,
--    channel) — the unique index makes a duplicate opt-out impossible.
-- ----------------------------------------------------------------------------
CREATE TABLE public.notification_preference (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id     UUID NOT NULL REFERENCES public.person(id),
  category_code VARCHAR(50) NOT NULL REFERENCES public.notification_category(code),
  channel_code  VARCHAR(20) NOT NULL REFERENCES public.notification_channel(code),
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX uq_notification_pref_active
  ON public.notification_preference (person_id, category_code, channel_code);
CREATE INDEX idx_notification_preference_person_id
  ON public.notification_preference (person_id);

-- ----------------------------------------------------------------------------
-- 4. RLS
-- ----------------------------------------------------------------------------
ALTER TABLE public.notification_category   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_channel    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preference ENABLE ROW LEVEL SECURITY;

-- Lookups: readable to any authenticated user (like every other lookup).
CREATE POLICY notification_category_read ON public.notification_category
  FOR SELECT TO authenticated USING (true);
CREATE POLICY notification_channel_read ON public.notification_channel
  FOR SELECT TO authenticated USING (true);

-- Preference: a person reads ONLY their own rows. SELECT only — no write policy,
-- so INSERT/UPDATE/DELETE are denied by default (read-only section, no toggles).
CREATE POLICY notification_preference_select ON public.notification_preference
  FOR SELECT TO authenticated USING (person_id = auth.uid());
