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

## Output safety and rendering fixes

Page output paths are checked after the `htmlFileName` callback. Absolute paths,
Windows drive paths, and relative paths that escape `build.outDir` are rejected.
On Windows, colons in output filenames are rejected to block NTFS alternate
data streams, including new streams on hard-linked files. POSIX filenames may
still contain literal colons.
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
For stylesheets, only enabled links with no media condition or `media="all"`
suppress a generated link. Conditional or disabled stylesheets remain intact
and do not prevent the page from receiving unconditional CSS.

Run the focused regressions with:

```sh
pnpm exec vitest run test/build-safety.test.ts test/output-path.test.ts
```

Run the complete validation commands above before publishing a new distribution.
