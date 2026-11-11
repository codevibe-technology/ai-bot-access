# Changelog

## 0.1.0 (2026-11-11)

First release.

- CLI and API that check 15 AI crawlers and fetchers from OpenAI, Anthropic, Perplexity, Google, Apple, Meta, Common Crawl, Amazon and ByteDance.
- RFC 9309 robots.txt parsing: group selection, longest-match rules, `*` and `$` wildcards, percent-encoding normalisation.
- Real requests with each bot's user agent, compared with a browser baseline: server blocks, failing robots.txt, challenge pages, redirects, `noindex`/`noai` directives.
- Text and JSON output, CI-friendly exit codes.
