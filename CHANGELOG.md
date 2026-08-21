# Changelog

All notable changes to PicWall are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning follows
[SemVer](https://semver.org/).

## [0.2.0] - 2026-08-21

### Added
- favicon + Open Graph image & metadata (#17)
- adaptive card height — masonry layout, no letterboxing (#20)
- action-matched sound cues (cuelume: arrival/page/toggle/press/pulse) (#21)
- delete photo UI with confirmation dialog (#15)
- drag-to-reorder with localStorage persistence (#16)
- mobile random tilt (-3°..+3°) (#13)
- i18n zh/en with manual theme toggle (#11)
- cuelume UI sound effects (#12)
- photo upload magic-byte sniffing (stored-XSS protection) (#23)
- E2E test suite (Playwright) (#8)
- 100% coverage gate (include + thresholds) (#22)

### Changed
- `object-cover` → `object-contain` (full photo, no crop) (#19)
- layout() → masonry (shortest-column placement) (#20)
- hydration-safe i18n init (fixed SSR first frame) (#18)
- `next/script beforeInteractive` for theme init (no React warning) (#18)

### Fixed
- hydration mismatch on language/theme buttons (#18)
- "Encountered a script tag" console warning (#18)
- LAN 403 on dev chunks (`allowedDevOrigins`) (#13)
- SSR `localStorage is not defined` crash (#14)

### Security
- upload magic-byte sniffing rejects content/extension mismatch (#23)
- generic error messages (no HTTP status / raw exception leakage) (#23)
