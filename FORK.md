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

New prereleases use uploaded GitHub Release assets. The separate distribution
branch remains historical; existing commit pins are preserved. New consumers
should install the uploaded runtime .tgz rather than automatic source archives.
The repository must have immutable releases enabled before publication so assets
and tags cannot be replaced after publishing. Keep the MIT license and credits.

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

## GitHub Release procedure

The source version and runtime package version must match. The next version is
`28.3.0-fork.4`; previously distributed versions and SHAs are never overwritten.
The release packager keeps the tested runtime peer policy of prior prebuilt
packages (Vite 7.3.1/8, Vue 3.5.18+, supported stable Router 4/5) rather than
advertising every historical source peer range. It adds no runtime dependencies.

1. Update the source version in a reviewed PR, run CI, and merge to main.
2. Run the manual Release workflow on main. It calls the complete CI workflow,
   including the real-build matrix for Vite 7.3.7 and 8.3.5. Failed checks prevent
   the packaging job from creating a release.
3. The workflow builds with Node 24 and frozen pnpm dependencies, then runs
   `pnpm run release:pack`. This Linux/GNU tar command uses `pnpm pack` as an
   intermediate, resolves catalogs, removes lifecycle scripts and devDependencies,
   preserves the executable and required documentation, and records sourceCommit.
   Archive file order, owner IDs, timestamps and gzip headers are normalized.
4. Inspect the draft prerelease and its uploaded runtime .tgz, SHA256SUMS, and
   release-manifest.json. The manifest contains version, source SHA, artifact name,
   and SHA-256 digest. Verify the package and CI results before publication.
5. Publish the draft. With repository immutability enabled, the tag and uploaded
   assets become immutable. Only then update consumers to the asset download URL,
   regenerate their lockfiles deliberately, and rerun integration checks.

The workflow has no npm publication step, no tag-push trigger and no automatic
preview publication. It refuses to overwrite an existing release, including a
draft: inspect an existing draft before retrying. The manual workflow must first
be merged to the default branch before GitHub allows dispatching it.

To build a local preview on Linux after the normal validation commands:

```sh
pnpm run release:pack
(cd release-output && sha256sum --check SHA256SUMS)
```

`pnpm pack` alone produces the source-development manifest; release:pack is the
canonical runtime packaging step. Source files, runtime dependency policy, and
package-version selection are committed together. The hosted workflow uses a
fresh checkout of its exact main commit; local previews may contain uncommitted
changes and must not be published as validated releases.
