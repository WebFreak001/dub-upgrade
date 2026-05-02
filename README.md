# dub-upgrade

GitHub Actions CI Action to run `dub upgrade --missing-only --sub-packages` with automatic retry on network failure and caching package downloads and optionally also compiled library binaries across builds using dub's native caching functionality.

## v0.2 -> v0.3 Changes

The action no longer runs `dub upgrade` to fetch the latest version from DUB without any `args` passed in. It now runs `dub upgrade --missing-only --sub-packages` which has 2 key differences:

* Only the version specified in `dub.selections.json` is fetched now (no longer changing the version of the lockfile)
* All sub-packages are also fetched automatically now

This can be configured using `args` like described below.

## Usage

Basic usage (including cache):
```yml
steps:
  - uses: actions/checkout@v1

  - uses: dlang-community/setup-dlang@v1 # install D compiler & Dub
    with:
      compiler: dmd-latest

  - uses: WebFreak001/dub-upgrade@v0.1

  - name: Run tests # do whatever with upgraded & fetched dependencies
    run: dub test
```

Not using cache, only retrying on network failure:
```yml
steps:
  - uses: actions/checkout@v1

  - uses: dlang-community/setup-dlang@v1 # install D compiler & Dub
    with:
      compiler: dmd-latest

  - uses: WebFreak001/dub-upgrade@v0.1
    with:
      cache: false

  - name: Run tests # do whatever with upgraded & fetched dependencies
    run: dub test
```

Old behavior, not respecting dub.selections.json:
```yml
steps:
  - uses: actions/checkout@v1

  - uses: dlang-community/setup-dlang@v1 # install D compiler & Dub
    with:
      compiler: dmd-latest

  - uses: WebFreak001/dub-upgrade@v0.1
    with:
      args: ''

  - name: Run tests # do whatever with upgraded & fetched dependencies
    run: dub test
```

