-- Admin-set app name (Thai/English), logo and browser-tab icon. One small JSON object:
-- {"name_th": "...", "name_en": "...", "logo": {"mime": "image/png", "version": 1}, "favicon": {...}}.
-- The image bytes live in the private "brand-assets" storage bucket and are served by
-- /brand/logo and /brand/favicon. An empty object means "the built-in RooSuk name and pictures".
alter table public.platform_settings
  add column brand jsonb not null default '{}'::jsonb
    check (jsonb_typeof(brand) = 'object');
