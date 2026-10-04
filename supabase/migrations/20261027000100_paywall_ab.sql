-- Phase 2 / paywall A/B. Both versions show the SAME plans, prices and options;
-- they differ only in what is put first and how it is worded. The admin can
-- run the split ('ab'), pin everyone to one version ('a' / 'b'), or switch it off.
alter table public.platform_settings
  add column paywall_ab text not null default 'ab' check (paywall_ab in ('off', 'ab', 'a', 'b'));
