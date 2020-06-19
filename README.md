# svite

[svelte](https://svelte.dev) integration plugin for [vite](https://github.com/vitejs/vite#readme)

## features

- read svelte configruation with [cosmiconfig](https://github.com/davidtheclark/cosmiconfig#readme)
- svelte preprocessor support
- hot module reloading thanks to [svelte-hmr](https://github.com/rixo/svelte-hmr#readme)
- drop-in installation as vite plugin

# quickstart

```shell script
npx degit dominikg/svite/examples/minimal my-first-svite-project
cd my-first-svite-project
npm install
npm run dev
```


# usage

## installation

Install svite as a dev dependency
```shell script
npm install -D svite
```
Don't forget to install missing peer dependencies


Add as plugin to `vite.config.js`
```js 
const svite = require('svite');
module.exports = {
  plugins:[
    svite()
  ]
}
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

## check out the examples
### [minimal](/examples/minimal)
as barebones as it gets, just an essential App.svelte 


## limitations

- this is a very early version, expect things to break, hard.
- vite options like --ssr or --sourcemap
- dev mode with externalized css

# TODO
- more examples
  - preprocessor support (postcss with tailwind)
  - config 
  - routify
  
- more features  
  - vite options
  
# Credits

- [rixo](https://github.com/rixo) - without svelte-hmr and your support this would not have been possible
- [vite-plugin-svelte](https://github.com/intrnl/vite-plugin-svelte) - initial inspiration


