-- Admin-editable plan details (history window, vault size, passport, agent, wearables,
-- family seats). Stored as differences from the defaults hard-coded in src/config/plans.ts,
-- so an empty object means "use the defaults". Prices, trial days, fair-use caps and the
-- per-feature quota overrides already live in platform_settings (billing_core).
alter table public.platform_settings
  add column plan_specs jsonb not null default '{}'::jsonb
    check (jsonb_typeof(plan_specs) = 'object');
