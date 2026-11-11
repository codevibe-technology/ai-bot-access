# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## Unreleased

## [0.2.0] - 2026-11-12

### Added

- Search engines and link-preview bots: `Googlebot`, `bingbot`, `Applebot`, `DuckDuckBot`, `facebookexternalhit`, `LinkedInBot`, `Twitterbot`, `WhatsApp` and `Slackbot-LinkExpanding` (24 bots in total). Every bot belongs to a group (`ai`, `search`, `social`), and `--bots` accepts group names.
- Share-preview check: `og:title`, `og:description`, `og:image` (downloaded: status, content type, size and dimensions for PNG, JPEG, GIF and WebP) and `twitter:card`, with errors, warnings and tips. Link-preview bots that get a page without the `og:image` a browser sees are flagged. `--no-preview` skips it.
- `ai-bot-access verify <ip>`: checks a request claiming to be a crawler against the operator's published IP list (OpenAI, Anthropic, Perplexity, Google, Microsoft, Apple, DuckDuckGo, Common Crawl, Amazon), with forward-confirmed reverse DNS as a fallback for Google, Microsoft, Apple and Amazon. Verdicts: `verified`, `spoofed`, `unverifiable`, `unknown-bot`.
- `verifyBot()` and `createVerifier()` in a new `ai-bot-access/verify` entry point with no Node-only imports, for Next.js middleware, edge functions and Express. Lists are cached for 24 hours.
- `ai-bot-access logs <file...>`: reads nginx/Apache combined logs and JSON lines (Cloudflare, Vercel and most custom formats), plain or gzipped, or stdin. Reports hits, successful and refused responses, distinct IPs and real/fake/unverifiable hits per bot, the most requested pages, and visitors sent by AI assistants. Flags crawlers refused on 20% or more of their genuine requests, and impostors.
- How to fix: every report ends with concrete fixes grouped by problem, and the place to look on the host or CDN it recognises from the response headers (Cloudflare, Vercel, Netlify, Hostinger, Akamai, Fastly, CloudFront, Sucuri, WP Engine, Kinsta, SiteGround, Shopify, Wix, Squarespace).
- A `403` for a bot whose operator publishes its IPs is reported as *to confirm* (`unconfirmed: true`): it is often fake-bot protection, which refuses a crawler's name from other addresses, exactly what the test sends. It no longer fails the run unless `--strict` is set. `summary.unconfirmed` counts them.
- `--list --json` prints the bot table as JSON, including each bot's group and verification sources.
- Automated releases: merging a `chore(release)` pull request publishes to npm with provenance and creates the GitHub release from these notes.

### Changed

- New report layout: bots grouped by kind with one clear status per bot, a result line, then Problems, To confirm, Blocked in robots.txt, Notes and How to fix. When problems are found, the last line links to a page with more help.
- A bot that does not always follow robots.txt and is disallowed there is reported with a note that it may fetch the page anyway.
- The page is read up to 1 MB (was 64 KB) so the share-preview tags are found on large pages.
- CI runs on `actions/checkout` and `actions/setup-node` v7.
- Contributing guide documents the commit and changelog rules. Pull request titles and changelog entries are checked in CI.
- Links to codevibe.in in the README, contributing guide and issue template carry UTM tags. The README on GitHub says `utm_source=github`; the README published to npm says `utm_source=npm` (switched by the new `prepack`/`postpack` scripts), so visits from each can be told apart.

## [0.1.0] - 2026-11-11

First release.

### Added

- CLI and API that check 15 AI crawlers and fetchers from OpenAI, Anthropic, Perplexity, Google, Apple, Meta, Common Crawl, Amazon and ByteDance.
- RFC 9309 robots.txt parsing: group selection, longest-match rules, `*` and `$` wildcards, percent-encoding normalisation.
- Real requests with each bot's user agent, compared with a browser baseline: server blocks, failing robots.txt, challenge pages, redirects, `noindex`/`noai` directives.
- Text and JSON output, CI-friendly exit codes.
