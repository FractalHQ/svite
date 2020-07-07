# Changelog

### 0.2.1 (2020-07-06)

### Features

- use standard-version to manage releases ([21fa0a5](https://github.com/dominikg/svite/commit/21fa0a5c8c767593ea64617a937690cce6619a12))

## 0.2.0

### BREAKING

- removed cosmiconfig support for svelte config
  - `svelte.config.js` is now the only file where you may specify svelte options (besides plugin initialization)

### Added

- support proposed `compilerOptions` in `svelte.config.js`
- testsuite that ensures examples are working

### Changed

- bumped vite to 1.0.0-beta.10

## 0.1.0

### BREAKING

- update to rollup-plugin-svelte-hot/svelte-hmr 0.10.0
  - hmr updates behave differently (less buggy) with noPreserveState=true

### Added

- new hmr-showcase example with guided demonstration
- hmr-benchmark with cool gif output

### Other improvements

- cut down test execution time

## 0.0.10

### BREAKING

- default to `noPreserveState: true` in svelte-hmr options. Custom stores can be used for preservable state

### Added

- Initial work on testsuite based on vite's test.js
- prevent purging when using dynamic class bindings like `class:p-4={true}` in tailwind example

### 0.0.9

### Added

- upated changelog

### 0.0.8

### Changed

- fixed default svelte extensions list

## 0.0.7

### Added

- deferred initialization of rollup plugin
- improved log output

## 0.0.6

### Added

- tiny logo
- correct evaluation of vite mode for build

## 0.0.5

### Added

- logLevel option
- debug log output
- useTransformCache option

### Changed

- reenabled overriding svelte config for dev and build

### Removed

- workaround for emitCss

## 0.0.4

### Added

- updated dependencies of examples

### Fixed

- optimizeDeps were not built correctly in 0.0.3

## 0.0.3

### Added

- logging util with colors and more helpful output

### Changed

- use vite transform instead of middleware in dev mode
- workaround for emitCss

## 0.0.2

### Added

- force removal of .html extension from svelte config
- linting for svite and examples

## 0.0.1 Initial Release

### Added

- initial support for `vite` and `vite build` commands
- read svelte configruation with cosmiconfig
- svelte preprocessor support
- hot module reloading thanks to svelte-hmr
- drop-in installation as vite plugin
