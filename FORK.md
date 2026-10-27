# vite-ssg fork

This fork provides Unhead 3 SSR compatibility and static-generation fixes for
Vue applications. Its behavior and maintenance policy apply to all consumers.
Fork prereleases use the `-fork.N` suffix, starting with `28.3.0-fork.1`.

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
manifest with resolved catalog ranges. Consumers can pin a distribution by
immutable commit SHA without running build lifecycle scripts at install time.
When preparing a new distribution, record its source commit in `sourceCommit`.
Do not edit generated bundles by hand. Before updating a consumer's pinned SHA,
rerun the package checks and that application's integration checks. Keep the
upstream MIT license and author credits intact.

## Output safety and rendering fixes

The canonical output root is resolved once after the client build and reused
for page validation. Existing destination ancestors are still checked per page.

Page output paths are checked after the `htmlFileName` callback. Relative and
native absolute paths are accepted only when their destinations stay inside
`build.outDir`. Paths that escape the output directory, foreign-platform
absolute paths, and Windows drive-relative paths are rejected.
On Windows, colons after the path's root are rejected to block NTFS alternate
data streams, including new streams on hard-linked files. POSIX filenames may
still contain literal colons.
Build logs show the normalized destination relative to the output directory.
Names with trailing dots or spaces are rejected to avoid Windows path aliases.
Backslashes in callback results are treated as directory separators. Existing
file or directory symlinks must resolve within the output directory; internal
symlinks and a symlinked output root remain supported. Dangling symlinks and
existing hard-linked files fail the build. Keep the build workspace under
trusted ownership: this check does not protect against another process
replacing symlinks during a build.

Hard-linked output files are rejected even when all known names are inside
the output directory: the link count cannot identify the locations of other
names. This rejection reports a specific hard-link error and the link count.

Page failures reject `build()` after queued page tasks settle. They prevent the
success message, PWA regeneration, and `onFinished` callback.
If several pages fail, `build()` throws an `AggregateError` listing their
routes and retaining every page error in `errors`. A single failed page
continues to throw its original error. All queued pages still run to completion.

Root-container attributes preserve their original quoting, entities, and
boolean syntax.
Preload and stylesheet links are deduplicated by their `href` and `rel` values.
Relation matching ignores case and surrounding whitespace. URL strings remain
distinct because relative references depend on the page's effective base URL.
For stylesheets, only enabled links with no media condition or `media="all"`
suppress a generated link. Conditional or disabled stylesheets remain intact
and do not prevent the page from receiving unconditional CSS.

Run the focused regressions with:

```sh
pnpm exec vitest run test/build-safety.test.ts test/output-path.test.ts
```

Run the complete validation commands above before publishing a new distribution.

Build fixtures use `.vite-ssg-regression-*` directories under the repository so
they can resolve workspace dependencies. Tests remove them in `finally`; Git
also ignores leftovers from interrupted runs.
