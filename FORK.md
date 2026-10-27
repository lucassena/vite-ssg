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

## Critical CSS compatibility

The next fork prerelease, `28.3.0-fork.2`, requires Beasties `^0.5.5` when
critical CSS generation is enabled and raises the package Node.js minimum to
20.19.0. Beasties remains an optional peer; consumers that use it must update
their own dependency alongside the fork. The supported peer range starts at
the tested 0.5.5 baseline. In particular, 0.3.5 can select another page's CSS
when pages share a processor concurrently; its keyframe handling also fails
the regression below. Intermediate lines are not advertised as supported.

The integration keeps the default class and asynchronous `process(html)` API,
including the existing font-inlining and preload options. It does not enable
the new compiler/runtime API or change CSP/preload configuration. Regressions
exercise the real SSG integration, parallel page isolation, font preloads,
keyframes referenced through custom properties, attribute entities, and asset
URLs. They assert that critical CSS is present rather than accepting a build
that silently skipped processing.

```sh
pnpm exec vitest run test/critical.test.ts
```

See the [Beasties 0.5.5 release](https://github.com/danielroe/beasties/releases/tag/v0.5.5)
and [0.5.0 migration notes](https://github.com/danielroe/beasties/releases/tag/v0.5.0).
After merging the source PR, prepare a fresh distribution with its source
commit recorded and rerun the validation above before updating consumers.

## Vite 7 and 8 compatibility

The fork selects the bundler option name from the installed Vite major version:
`build.rollupOptions` on Vite 7 and earlier, `build.rolldownOptions` on Vite 8.
Both the client input and SSR output overrides use that selection, without
translating consumers' bundler-specific settings or changing browser targets.
Consumer options continue to be merged through Vite's configuration API.

The CI compatibility matrix builds the package, checks types, builds all examples
(including PWA, Pinia, and nested routes), and runs the regression suite with
Vite 7.3.7 and 8.3.5. Regression tests inspect configuration before Vite can
normalize deprecated aliases, check custom options survive, and verify generated
HTML. These exact versions are tested baselines, not the complete peer range.
Older Vite peer ranges remain declared; this matrix does not establish coverage
for every older major or for future Vite majors.

The matrix first verifies the committed lockfile, then changes the Vite catalog
only inside each disposable CI job and resolves that target's dependency graph.
It asserts the installed version before validation. The normal CI jobs continue
to use the unchanged committed lockfile. No compatibility-specific package or
new runtime dependency is required.
