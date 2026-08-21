# Security Policy

## Reporting a Vulnerability

This is a local-first personal photo wall. The app stores images only on the
server's filesystem (`uploads/`) and serves them back via a `public/uploads`
symlink — no external storage, no accounts, no PII collection.

If you find a security issue:

1. **Do not open a public issue.**
2. Email the maintainer: `gandli@users.noreply.github.com`
   (or open a GitHub Security Advisory: *New security advisory* → *Report a vulnerability*).

You should receive a response within 7 days. If the issue is confirmed, a fix
is prioritized and released, and you will be credited (if you want).

## Supported Versions

Only the latest commit on `main` is supported.

## Known Attack Surface

- **Upload validation** — magic-byte sniffing rejects files whose content does
  not match their extension (prevents SVG/HTML-as-JPEG stored XSS). Extensions
  are whitelisted to `jpg/jpeg/png/gif/webp/bmp`, max 20MB.
- **Path traversal** — file names are server-generated IDs; the delete route
  uses `path.basename()` before joining with the upload dir.
- **Local network exposure** — `npm run dev` binds localhost by default.
