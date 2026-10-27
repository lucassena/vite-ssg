# Contributing to this fork

Open issues and pull requests in
[lucassena/vite-ssg](https://github.com/lucassena/vite-ssg). This fork is maintained
independently of upstream; use English for documentation and pull request
descriptions, and keep changes applicable to different Vue applications.

## Development

Use a supported Node.js LTS release satisfying `package.json` and the pinned
pnpm version in `packageManager` (currently 10.28.2).

```sh
git clone https://github.com/lucassena/vite-ssg.git
cd vite-ssg
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm lint
pnpm typecheck
pnpm pack
```

Build the package before running the examples or the full test suite. Add
regression tests for behavior changes and use Conventional Commits. Validate
the examples and generated HTML as well as the package's types and lint rules.

## Distribution and credits

Source pull requests target `main`. After review and merge, prepare the prebuilt
distribution separately, record its source commit in `sourceCommit`, and check
the generated bundles and resolved runtime manifest. Include `README.md`,
`FORK.md`, `CONTRIBUTING.md`, and `LICENSE` in the distribution so its guidance
and local documentation links remain available. Consumers pin the reviewed
distribution by immutable commit SHA. See [FORK.md](./FORK.md) for the maintenance
policy and compatibility changes; do not edit generated bundles by hand.

Preserve the upstream MIT license, original author credits, and attribution for
cherry-picked contributions. The original
[upstream contribution guide](https://github.com/antfu/contribute) remains useful
background; this document defines the fork's workflow.
