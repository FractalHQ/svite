<h1><img width=24 alt="svite-logo" src="svite-logo.svg" style="vertical-align: middle">&nbsp;svite&nbsp;<img width=24 alt="svite-logo" src="svite-logo.svg" style="vertical-align: middle"></h1>

[svelte](https://svelte.dev) + [vite](https://github.com/vitejs/vite#readme) = sweet

## features

- reads svelte configruation with [cosmiconfig](https://github.com/davidtheclark/cosmiconfig#readme)
- svelte preprocessor support
- svelte dependency optimization in dev
- svelte compiler result caching in dev
- hot module reloading thanks to [svelte-hmr](https://github.com/rixo/svelte-hmr#readme)
- logging with configurable level
- drop-in installation as vite plugin

# quickstart

```shell script
npx degit dominikg/svite/examples/minimal my-first-svite-project
cd my-first-svite-project
npm install
npm run dev # starts dev-server with hot-module-reloading
npm run build # builds to /dist
```

# usage

## installation

Install svite and vite as a dev dependency

```shell script
npm install -D svite vite
```

Add as plugin to `vite.config.js`

```js
const svite = require('svite');
module.exports = {
  plugins: [svite()],
};
```

## run

just use regular `vite` or `vite build` commands

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  }
}
```

## svite options

you can pass options to svite via vite.config.js

```js
const svite = require('svite');
const sviteConfig = {
  hot: true, // boolean or options object for svelte-hmr
  useTransformCache: true, // boolean
  svelte: {}, // options for rollup-plugin-svelte
};
module.exports = {
  plugins: [svite(sviteConfig)],
};
```

| option                    | type                      | default        | values                                                                                                                                      |
| ------------------------- | ------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **hot**<br><br>           | `boolean`<br>`object`<br> | `true`<br><br> | &bull;&nbsp;`true` use default svelte-hmr config<br>&bull;&nbsp;`false` disable svelte-hmr<br>&bull;&nbsp;`object` custom svelte-hmr config |
| **useTransformCache**<br> | `boolean`<br>             | `true`<br>     | &bull;&nbsp;`true` enable transform cache<br>&bull;&nbsp;`false` disable transform cache                                                    |
| **logLevel**              | `string`                  | `'info'`       | &bull;&nbsp;`'debug'` &bull;&nbsp;`'info'` &bull;&nbsp;`'warn'` &bull;&nbsp;`'error'` &bull;&nbsp;`'silent'`                                |
| **svelte**<br>            | `object`<br>              | `not set`<br>  | &bull;&nbsp;`object` rollup-plugin-svelte config object                                                                                     |

### hot

Only change this option if you have to. See [svelte-hmr](https://github.com/rixo/svelte-hmr#readme) for more Information

### useTransformCache

Improves performance for reloads.

When a reload request hits the dev server, vite runs transforms again. this option caches the result of the last transform and reuses it if the file was not modified. Uses more ram, less cpu and is a bit faster.

### logLevel

Set this to `'debug'` if you want to see more output, use `'warn'`, `'error'` or `'silent'` for less.
This only applies to svites own logging. Logging of vite remains unaffected.

### svelte

use this option if you don't want to use any of the ways you can provide a svelte config via [cosmiconfig](https://github.com/davidtheclark/cosmiconfig#readme) or need a quick override.

## check out the examples

### [minimal](/examples/minimal)

as barebones as it gets, just an essential App.svelte

### [postcss-tailwind](/examples/postcss-tailwind)

postcss and [tailwindcss](https://tailwindcss.com)

### [routify-mdsvex](/examples/routify-mdsvex)

[routify](https://routify.dev) with support for [mdsvex](https://mdsvex.com)

## limitations

This is an early version, some things may not work as expected. Please report findings.

# TODO

- more features
  - vite options
- release process
- tests

# Credits

- [svelte](https://svelte.dev) and [vite](https://github.com/vitejs/vite#readme) obviously
- [rixo](https://github.com/rixo) - without svelte-hmr and your support this would not have been possible
- [vite-plugin-svelte](https://github.com/intrnl/vite-plugin-svelte) - initial inspiration
