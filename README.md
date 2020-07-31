# dub-upgrade

GitHub Actions CI Action to run `dub upgrade` with automatic retry on network failure and caching package downloads and optionally also compiled library binaries across builds using dub's native caching functionality.

## Usage

Basic usage:
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

Caching compiled binaries:
```yml
steps:
  - uses: actions/checkout@v1

  - uses: dlang-community/setup-dlang@v1 # install D compiler & Dub
    with:
      compiler: dmd-latest

  - uses: WebFreak001/dub-upgrade@v0.1

  - name: Run tests # do whatever with upgraded & fetched dependencies
    run: dub test

  - uses: WebFreak001/dub-upgrade@v0.1 # second call to cache dependency binaries
    with:
      store: true # set this to true to not run an upgrade but only update cache
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

