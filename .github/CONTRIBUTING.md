# Contributing to ai-bot-access

Thanks for helping. ai-bot-access is a CLI that checks whether AI crawlers can read a site, maintained by [Codevibe](https://codevibe.in).

## Ground rules

- Open an issue before a large change, so we can agree on the approach first.
- Keep pull requests focused: one fix or feature per PR.
- Add or update tests for any behaviour change.
- Be kind. This project follows our [Code of Conduct](CODE_OF_CONDUCT.md).

## Development

```bash
git clone https://github.com/codevibe-technology/ai-bot-access.git
cd ai-bot-access
npm install
npm test
npm run build
```

`npm test` runs the robots.txt parser tests and a local HTTP server that simulates each kind of block.

## Updating the bot list

The bot list lives in [`src/bots.ts`](../src/bots.ts). Every entry needs a link to the operator's own documentation in `docs`. Please do not add a bot based on a third-party list alone: operators change user agents, and the tool is only as good as its sources.

## Commit messages

Every commit has a **title** and a **description**, using [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

```text
fix(robots): treat HTTP 429 on robots.txt as unreachable

Google and most crawlers treat a 429 on robots.txt like a server error
and stop crawling. We reported "allowed" in that case, which hid the
exact problem this tool exists to find.

Fixes #42
```

- **Title:** `type(scope): summary`, imperative mood, at most 72 characters, no full stop. Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. Add `!` after the type for a breaking change.
- **Description:** a blank line, then what changed and why. Mention linked issues (`Fixes #42`) and breaking changes (`BREAKING CHANGE: ...`).
- Use the template so the format is always to hand: `git config commit.template .github/commit-template.txt`

Pull requests are squash-merged, so the PR title becomes the commit title and the PR description becomes the commit description. CI checks the PR title format.

## Changelog

[CHANGELOG.md](../CHANGELOG.md) follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Any `feat`, `fix`, `perf` or `revert` change adds a line under **Unreleased**, in plain words a user understands. CI checks this. At release time the Unreleased section becomes the new version.

## Pull requests

1. Fork the repo and create a branch from `main`.
2. Make your change with tests.
3. Run `npm test` and `npm run build`.
4. Give the PR a Conventional Commits title and describe what changed and why. Link the issue if there is one.
5. Add a line under "Unreleased" in CHANGELOG.md for user-facing changes.

A maintainer will review it. All changes to `main` go through a reviewed pull request with passing CI.

## Releases

Maintainers publish to npm. Notable changes are listed in [CHANGELOG.md](../CHANGELOG.md).
