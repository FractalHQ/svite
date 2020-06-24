const rollupPluginSvelteHot = require('rollup-plugin-svelte-hot');
const { createFilter } = require('@rollup/pluginutils');
const { cosmiconfigSync } = require('cosmiconfig');
const log = require('./tools/log');
const LRU = require('lru-cache');
const svelteDeps = ['svelte/animate', 'svelte/easing', 'svelte/internal', 'svelte/motion', 'svelte/store', 'svelte/transition', 'svelte'];

const rollupPluginDedupeSvelte = require('@rollup/plugin-node-resolve').nodeResolve({
  dedupe: (importee) => svelteDeps.includes(importee) || importee.startsWith('svelte/'),
});

const defaultHotOptions = {
  optimistic: true,
  compatVite: true,
};

const defaultOptions = {
  hot: true,
  useTransformCache: true,
  logLevel: 'info', // 'debug','info','warn','error'  ('silent' for no output)
};

const defaultSvelteOptions = {
  format: 'esm',
  generate: 'dom',
};

const forcedSvelteDevOptions = {
  format: 'esm',
  generate: 'dom',
  css: true,
  emitCss: false,
};
const forcedSvelteBuildOptions = {
  format: 'esm',
  generate: 'dom',
  css: false,
  emitCss: true,
};

const forcedHotOptions = {
  compatVite: true,
};

function overrideConfig(config, overrides, type) {
  const appliedChanges = {};
  for (const [key, value] of Object.entries(overrides)) {
    if (config[key] !== value) {
      if (Object.prototype.hasOwnProperty.call(config, key)) {
        appliedChanges[key] = value;
      }
      config[key] = value;
    }
  }
  if (Object.keys(appliedChanges).length > 0) {
    log.warn(
      `the following values have been forced for svelte config ${type}. Consider adopting or removing them to let svite it.`,
      appliedChanges,
    );
  }
  return config;
}
/**
 * create required configs by merging default config, svelte config (read via cosmiconfig), passed pluginOptions.
 * finally override some options to ensure dev and build work as expected.
 * e.g. not hot mode with production build, when hot is enabled svelte compile needs to be dev: true
 *
 */
function createConfigs(pluginOptions) {
  let baseSvelteOptions;
  try {
    const searchResult = cosmiconfigSync('svelte').search();
    baseSvelteOptions = !searchResult || searchResult.isEmpty ? {} : searchResult.config;
  } catch (e) {
    log.error('failed to load svelte config', e);
    throw e;
  }

  const { svelte: sveltePluginOptions, ...svitePluginOptions } = pluginOptions || {};

  const sviteConfig = {
    ...defaultOptions,
    ...svitePluginOptions,
  };

  const svelteConfig = {
    ...defaultSvelteOptions,
    ...baseSvelteOptions,
    ...sveltePluginOptions,
  };

  const isProduction = process.env.NODE_ENV === 'production';

  if (!svelteConfig.extensions) {
    svelteConfig.extensions = ['.svelte'];
  } else if (svelteConfig.extensions.includes('.html')) {
    log.warn('vite build does not support .html extension for svelte');
    svelteConfig.extensions = svelteConfig.extensions.filter((ex) => ex !== '.html');
  }
  if (!svelteConfig.onwarn) {
    svelteConfig.onwarn = require('./tools/onwarn');
  }

  const dev = overrideConfig({ ...svelteConfig }, forcedSvelteDevOptions, 'dev');
  const build = overrideConfig({ ...svelteConfig }, forcedSvelteBuildOptions, 'build');

  if (sviteConfig.hot) {
    dev.hot =
      sviteConfig.hot === true
        ? defaultHotOptions
        : {
            ...defaultHotOptions,
            ...sviteConfig.hot,
            ...forcedHotOptions,
          };
    // needed, otherwise svelte-hmr doesn't work
    dev.dev = true;
  }

  if (isProduction) {
    build.dev = false;
  }

  const config = {
    dev,
    build,
    svite: sviteConfig,
  };
  log.debug.enabled && log.debug('configurations', config);
  return config;
}

/**
 * builds a filter function that works out if rollup-plugin-svelte would process the request
 * this prevents calling transform when not needed
 *
 */
function createSvelteTransformTest(svelteOptions) {
  const filter = createFilter(svelteOptions.include, svelteOptions.exclude);
  const extensions = svelteOptions.extensions || ['.svelte'];
  return (ctx) => filter(ctx.path) && extensions.some((ext) => ctx.path.endsWith(ext));
}

function updateViteConfig(config) {
  const viteConfig = config.vite;
  let addToOptimize = svelteDeps.concat();

  if (config.dev.hot) {
    addToOptimize.push('svelte-hmr/runtime/esm', 'svelte-hmr/runtime/proxy-adapter-dom', 'svelte-hmr/runtime/hot-api-esm', 'svelte-hmr');
  }
  const optimizeDeps = viteConfig.optimizeDeps;
  if (!optimizeDeps) {
    viteConfig.optimizeDeps = { include: addToOptimize };
  } else {
    if (optimizeDeps.exclude && optimizeDeps.exclude.length > 0) {
      addToOptimize = addToOptimize.filter((dep) => !optimizeDeps.exclude.includes(dep));
    }
    if (addToOptimize.length > 0) {
      if (optimizeDeps.include && optimizeDeps.include.length > 0) {
        addToOptimize = addToOptimize.filter((dep) => !optimizeDeps.include.includes(dep));
        if (addToOptimize.length > 0) {
          optimizeDeps.include.push(...addToOptimize);
        }
      } else {
        optimizeDeps.include = addToOptimize;
      }
    }
  }
}

function createDev(config) {
  const useTransformCache = config.svite.useTransformCache;
  const devPlugin = rollupPluginSvelteHot(config.dev);
  const isSvelteRequest = createSvelteTransformTest(config.dev);

  const transforms = [];
  const configureServer = [
    async ({ config: viteConfig }) => {
      config.vite = viteConfig;
      updateViteConfig(config);
    },
  ];

  if (useTransformCache) {
    // prevent rerunning svelte transform on unmodified files
    // cannot be done from transform alone as it lacks the information to decide
    // use a tandem of middleware and transform to get it done
    const useCacheMarker = '___use-cached-transform___';
    const transformCache = new LRU(10000);

    transforms.push({
      test: (ctx) => !ctx.isBuild && isSvelteRequest(ctx),
      transform: async ({ path: id, code }) => {
        const useCache = code === useCacheMarker;
        if (useCache) {
          log.debug.enabled && log.debug(`transform cache get ${id}`);
          return transformCache.get(id);
        }
        const result = await devPlugin.transform(code, id);
        log.debug.enabled && log.debug(`transform cache set ${id}`);
        transformCache.set(id, result);
        return result;
      },
    });

    configureServer.push(async ({ app, resolver }) => {
      app.use(async (ctx, next) => {
        if (isSvelteRequest(ctx)) {
          if (transformCache.has(ctx.path)) {
            await ctx.read(resolver.requestToFile(ctx.path));
            if (ctx.__notModified) {
              ctx.body = useCacheMarker;
            } else {
              log.debug.enabled && log.debug(`transform cache del ${ctx.path}`);
              transformCache.del(ctx.path);
            }
          }
        }
        await next(); // runs the transform above
      });
    });
  } else {
    transforms.push({
      test: (ctx) => !ctx.isBuild && isSvelteRequest(ctx),
      transform: async ({ path: id, code }) => {
        return devPlugin.transform(code, id);
      },
    });
  }
  return {
    transforms,
    configureServer,
  };
}

function createBuildPlugins(config) {
  const buildPlugin = rollupPluginSvelteHot(config.build);
  return [
    rollupPluginDedupeSvelte, // rollupDedupe vite option cannot be supplied by a plugin, so we add one for svelte here
    buildPlugin,
  ];
}

function createVitePlugin(config) {
  const buildPlugins = createBuildPlugins(config);
  const { transforms, configureServer } = createDev(config);
  return {
    rollupInputOptions: {
      plugins: buildPlugins,
    },
    transforms,
    configureServer,
  };
}

module.exports = function svite(pluginOptions = {}) {
  if (pluginOptions.logLevel) {
    log.setLevel(pluginOptions.logLevel);
  }
  const config = createConfigs(pluginOptions);
  log.setLevel(config.svite.logLevel);
  return createVitePlugin(config);
};
