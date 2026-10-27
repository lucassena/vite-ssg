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

Source pull requests target `main`. Keep source and runtime versions identical.
After review and merge, run the manual GitHub Release workflow on main. It gates
packaging on the complete CI matrix and creates a draft prerelease with an
uploaded prebuilt runtime .tgz, SHA256SUMS and release-manifest.json. Inspect the
checks and artifacts, then publish with repository release immutability enabled.
No npm or automatic preview publication is used.

Use `pnpm run release:pack` on Linux/GNU tar for local packaging validation.
The runtime includes resolved catalogs, sourceCommit, README.md, FORK.md,
CONTRIBUTING.md, LICENSE, bin and generated dist, without development dependencies
or lifecycle scripts. Existing distribution-branch SHAs remain historical pins;
new consumers should use the reviewed uploaded Release asset URL. See
[FORK.md](./FORK.md) for the full procedure; do not edit generated bundles by hand.

Preserve the upstream MIT license, original author credits, and attribution for
cherry-picked contributions. The original
[upstream contribution guide](https://github.com/antfu/contribute) remains useful
background; this document defines the fork's workflow.
