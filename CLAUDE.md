# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build

```sh
npm run build   # compiles src/ → lib/ via tsc
```

`lib/` is generated output — never edit it directly. After changing `src/main.ts`, rebuild before testing locally with `node lib/main.js`.

There are no automated local tests. Testing happens through GitHub Actions (`.github/workflows/test.yml`), which runs the action against real D projects in `test/` (has dependencies) and `nodeps/` (no dependencies) on a matrix of OSes and D compilers.

## Architecture

Three TypeScript source files compile to `lib/`:
- `src/main.ts` — main action entry point
- `src/post.ts` — post-step entry point (runs automatically at end of CI job)
- `src/util.ts` — shared helpers (`hash`, `hashAll`, `getDubPackagesDirectory`, `parseBool`)

**Package format:** All `@actions/*` dependencies (core, cache, glob) are pure ESM packages — they only export via `"import"` condition, no `"require"`. The project therefore uses `"type": "module"` in `package.json` and TypeScript is configured with `"module": "nodenext"` to emit ESM. Always use `import * as foo from "@actions/foo"` (namespace import), never a default import, for these packages.

**Action flow:**
- `main`: reads `cache` and `args` inputs → computes `cacheDirs` → restores cache → runs `dub upgrade` (with retries) → saves `CACHE_DIRS`, `DUB_ARGS`, `DUB_PACKAGES_DIR` to action state
- `post` (runs automatically via `post-if: always()` in `action.yml`): reads saved state → re-hashes `dub.selections.json` files → saves cache

**Cache key scheme:** `dub-package-cache-<platform>-<sha1>` where the hash covers `args`, the list of packages in `dubPackagesDirectory`, and all `**/dub.selections.json` file hashes. Hashing happens in the post step (after the build) so it reflects the actual resolved selections.

**Network failure detection:** `execDubUpgrade` inspects combined stdout+stderr for the strings `"Error querying versions"` or `"Failed to download"` to distinguish retryable network errors from hard failures.

