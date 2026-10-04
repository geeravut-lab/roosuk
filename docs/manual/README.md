# RooSuk manuals (Thai PDF)

Two manuals, each built by really operating the app in a phone-sized browser (390×844, 2×) and
embedding one screenshot per step:

- `RooSuk-User-Manual.pdf` — every menu of a normal user.
- `RooSuk-Admin-Manual.pdf` — every Admin menu.

Not part of the production deploy (`netlify.toml` only builds when `src/`, `public/` etc. change).

## Rebuild

```bash
npm run build
ENABLE_UI_PREVIEW=1 NODE_USE_ENV_PROXY=1 npx next start -p 3101 &   # app under test
node docs/manual/record-user.mjs      # screenshots -> docs/manual/shots/user/*.png  (creates + removes test users)
node docs/manual/lib/build-pdf.mjs user    # content/user.mjs + shots -> out/*.pdf
```

Same with `record-admin.mjs` / `admin`. Content (Thai text, steps, relations) lives in
`content/<name>.mjs`; the layout and brand theme in `lib/build-pdf.mjs`; the phone browser, test
users and highlight/masking helpers in `lib/recorder.mjs`. Screenshots mask e-mail addresses.
