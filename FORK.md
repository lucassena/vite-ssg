# Imovia fork

Based on upstream v28.3.0 (`4be6e3c31b905f991cda89bcfd598442f8388ffd`).
The source branch `codex/unhead3-ssr` cherry-picks upstream PR #470,
commit `59ee7a83eb69ad565fb8fb2e1aa4a68cc6180410`, preserving its author.

https://github.com/antfu-collective/vite-ssg/pull/470

The added single-page test expects `lang="en"`, matching the example's
`useHead` configuration. The original PR mistakenly expected `sv`.

Validation uses the upstream lockfile and pinned pnpm 10.28.2:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm lint
pnpm typecheck
pnpm pack
```

The separate distribution branch contains the generated `dist` and a runtime
manifest with resolved catalog ranges. Imovia installs that branch by an
immutable commit SHA, without running build lifecycle scripts at install time.
The distribution manifest records the source commit in `imoviaSourceCommit`.
Do not edit generated bundles by hand or update the pinned SHA without rerunning
upstream and Imovia integration checks. Keep the upstream MIT license intact.
