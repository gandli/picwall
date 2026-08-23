# Changelog

All notable changes to PicWall are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning follows
[SemVer](https://semver.org/).

## [Unreleased]

### Added
- feat: caption model upgrade — vit-gpt2 to Florence-2-base-ft (#62)
- feat: 模型能力测试 — 真实 caption 管线质量评测 (#54)
- feat: seed fixtures with real Unsplash photos (#51)
- [ImgBot] Optimize images (#29)
- feat: local in-browser image captioning (EN caption + ZH translate) (#30)
- feat: caption progress indicator on photo cards (#37)
- e2e: statement coverage gate at 100% for UI surface (#39)

### Changed
- style: Scandinavian redesign — neutral black-and-white system (#40)

### Fixed
- fix: store data integrity (P1-A/B/C from audit v2) (#56)
- fix: coverage gate — getImagesStrict missing-manifest branch (#59)
- fix(changelog): tolerate PR-less commit ranges + match ImgBot rows (#47)
- fix(changelog): merge into existing Unreleased section (#49)
- fix: hovered card floating above lightbox overlay (#32)
- fix: bump sharp to 0.35.x via override (GHSA-f88m-g3jw-g9cj) (#38)

### Documentation
- docs: refresh user-manual screenshots (#57)
- docs(readme): refresh — badges, accurate stack, governance links, fresh showcase (#28)
- docs: user manual chapter for AI image captioning (#33)

### Maintenance
- chore: audit v2 P2 batch (docs order, SHA pin, GET 500, upload errors) (#58)
- chore(deps): bump actions/checkout from 4.2.2 to 4.4.0 (#25)
- chore(deps-dev): bump @types/node from 20.17.6 to 20.19.43 in the dev-tooling group (#27)
- test: unit tests for vision captioning module (#31)
- test: widen coverage scope to lib/ and close all gaps (#35)
- chore: add description and MIT license to package.json (#36)
- ci: auto-regenerate user-manual screenshots via Docs workflow (#41)
- ci: auto-update CHANGELOG from merged PRs (#42)
- fix(changelog): provide GH_TOKEN to collect step (#45)

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
