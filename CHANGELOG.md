# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## Unreleased

### Changed

- CI runs on `actions/checkout` and `actions/setup-node` v7.
- Contributing guide documents the commit and changelog rules. Pull request titles and changelog entries are checked in CI.

## [0.1.0] - 2026-11-11

First release.

### Added

- CLI and API that check 15 AI crawlers and fetchers from OpenAI, Anthropic, Perplexity, Google, Apple, Meta, Common Crawl, Amazon and ByteDance.
- RFC 9309 robots.txt parsing: group selection, longest-match rules, `*` and `$` wildcards, percent-encoding normalisation.
- Real requests with each bot's user agent, compared with a browser baseline: server blocks, failing robots.txt, challenge pages, redirects, `noindex`/`noai` directives.
- Text and JSON output, CI-friendly exit codes.
