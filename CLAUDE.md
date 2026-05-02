# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build

```sh
npm run build   # compiles src/ → lib/ via tsc
```

`lib/` is generated output — never edit it directly. After changing `src/main.ts`, rebuild before testing locally with `node lib/main.js`.

There are no automated local tests. Testing happens through GitHub Actions (`.github/workflows/test.yml`), which runs the action against real D projects in `test/` (has dependencies) and `nodeps/` (no dependencies) on a matrix of OSes and D compilers.

## Architecture

This is a single-file GitHub Action (`src/main.ts` → `lib/main.js`).

**Package format:** All `@actions/*` dependencies (core, cache, glob) are pure ESM packages — they only export via `"import"` condition, no `"require"`. The project therefore uses `"type": "module"` in `package.json` and TypeScript is configured with `"module": "nodenext"` to emit ESM. Always use `import * as foo from "@actions/foo"` (namespace import), never a default import, for these packages.

**Action flow (`main()`):**
1. Read inputs: `cache` (bool), `store` (bool), `args` (string)
2. If `cache`: compute `dubPackagesDirectory` from platform env vars, build `cacheDirs`
3. If `store`: skip upgrade, just save cache and return
4. Verify `dub` is in PATH via `which`
5. Restore cache from `cacheDirs`
6. Run `dub upgrade [args]` via `execDubUpgrade`, retrying up to 3× (delays: 30s, 90s) on network errors
7. Save cache

**Cache key scheme:** `dub-package-cache-<platform>-<sha1>` where the hash covers `args`, the list of packages in `dubPackagesDirectory`, and all `**/dub.selections.json` file hashes.

**Network failure detection:** `execDubUpgrade` inspects combined stdout+stderr for the strings `"Error querying versions"` or `"Failed to download"` to distinguish retryable network errors from hard failures.

**`store` input:** A workaround for the absence of a native post-step — call the action a second time with `store: true` after building to cache compiled binaries under a separate key that includes a `"put in build cache!"` suffix in the hash.

