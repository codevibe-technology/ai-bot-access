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

## Pull requests

1. Fork the repo and create a branch from `main`.
2. Make your change with tests.
3. Run `npm test` and `npm run build`.
4. Describe what changed and why in the PR. Link the issue if there is one.

A maintainer will review it. All changes to `main` go through a reviewed pull request with passing CI.

## Releases

Maintainers publish to npm. Notable changes are listed in [CHANGELOG.md](../CHANGELOG.md).
