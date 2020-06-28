const fs = require('fs-extra');
const path = require('path');
const execa = require('execa');
const puppeteer = require('puppeteer');

jest.setTimeout(30000);

const timeout = (n) => new Promise((r) => setTimeout(r, n));

const testAppDir = path.join(__dirname, 'app');
const tempDir = path.join(__dirname, 'temp');
const binPath = path.join(__dirname, '../node_modules/.bin/vite');

let devServer;
let browser;
let page;
const browserLogs = [];
const serverLogs = [];

const getEl = async (selectorOrEl) => {
  return typeof selectorOrEl === 'string' ? await page.$(selectorOrEl) : selectorOrEl;
};

const getText = async (selectorOrEl) => {
  const el = await getEl(selectorOrEl);
  return el ? el.evaluate((el) => el.textContent) : null;
};

const getComputedColor = async (selectorOrEl) => {
  return (await getEl(selectorOrEl)).evaluate((el) => getComputedStyle(el).color);
};

async function deleteTempDir() {
  try {
    await fs.remove(tempDir);
  } catch (e) {
    console.error(`failed to delete ${tempDir}`, e);
  }
}

beforeAll(async () => {
  await deleteTempDir();
  await fs.copy(testAppDir, tempDir, {
    filter: (file) => !/dist|node_modules/.test(file),
  });
  await execa('npm', ['install'], { cwd: tempDir });
});

afterAll(async () => {
  await deleteTempDir();
  if (browser) await browser.close();
  if (devServer) {
    devServer.kill('SIGTERM', {
      forceKillAfterTimeout: 2000,
    });
  }
  // console.log(browserLogs)
  // console.log(serverLogs)
});

describe('vite', () => {
  beforeAll(async () => {
    browser = await puppeteer.launch(process.env.CI ? { args: ['--no-sandbox', '--disable-setuid-sandbox'] } : {});
  });

  function declareTests(isBuild) {
    test('should render App', async () => {
      expect(await getText('#app-header')).toBe('Test-App');
    });
    test('should render static import', async () => {
      expect(await getText('#static-import .label')).toBe('static-import');
    });
    test('should render dependency import', async () => {
      expect(await getText('#dependency-import .label')).toBe('dependency-import');
    });
    test('should render dynamic import', async () => {
      expect(await getEl('#dynamic-import')).toBe(null);
      let dynamicImportButton = await getEl('#button-import-dynamic');
      expect(dynamicImportButton).toBeDefined();
      await dynamicImportButton.click();
      await expectByPolling(() => getText('#dynamic-import .label'), 'dynamic-import');
    });
    test('should not have failed requests', async () => {
      const has404 = browserLogs.some((msg) => msg.match('404'));
      if (has404) {
        console.log(browserLogs);
      }
      expect(has404).toBe(false);
    });

    if (!isBuild) {
      describe('hmr', () => {
        const updateHmrTest = updateFile.bind(null, 'src/components/HmrTest.svelte');
        const updateApp = updateFile.bind(null, 'src/App.svelte');
        test('should have expected initial state', async () => {
          // initial state, both counters 0, both labels red
          expect(await getText(`#hmr-test-1 .counter`)).toBe('0');
          expect(await getText(`#hmr-test-2 .counter`)).toBe('0');
          expect(await getComputedColor(`#hmr-test-1 .label`)).toBe('rgb(255, 0, 0)');
          expect(await getComputedColor(`#hmr-test-2 .label`)).toBe('rgb(255, 0, 0)');
        });
        test('should have working increment button', async () => {
          // increment counter of one instance to have local state to verify after hmr updates
          (await getEl(`#hmr-test-1 .increment`)).click();
          await timeout(50);

          // counter1 = 1, counter2 = 0
          expect(await getText(`#hmr-test-1 .counter`)).toBe('1');
          expect(await getText(`#hmr-test-2 .counter`)).toBe('0');
        });
        test('should apply css changes', async () => {
          // update style, change label color from red to green
          await updateHmrTest((content) => content.replace('color: red', 'color: green'));

          // counter state should remain
          expect(await getText(`#hmr-test-1 .counter`)).toBe('1');
          expect(await getText(`#hmr-test-2 .counter`)).toBe('0');

          // color should have changed
          expect(await getComputedColor(`#hmr-test-1 .label`)).toBe('rgb(0, 128, 0)');
          expect(await getComputedColor(`#hmr-test-2 .label`)).toBe('rgb(0, 128, 0)');
        });
        test('should preserve state of component instances', async () => {
          // update script, change initial counter value
          await updateHmrTest((content) => content.replace('let counter = 0;', 'let counter = 2;'));

          // counter state should remain
          await expect(await getText(`#hmr-test-1 .counter`)).toBe('1');
          await expect(await getText(`#hmr-test-2 .counter`)).toBe('0');
        });
        test('should not preserve state of nested component instances', async () => {
          // update App, add a new instance of HmrTest
          await updateApp((content) => `${content}\n<HmrTest/>`);

          // counter state is reset as instances are recreated
          await expect(await getText(`#hmr-test-1 .counter`)).toBe('2');
          await expect(await getText(`#hmr-test-2 .counter`)).toBe('2');

          // a third instance has been added
          await expect(await getText(`#hmr-test-3 .counter`)).toBe('2');
        });
      });
    }
  }

  // test build first since we are going to edit the fixtures when testing dev
  // no need to run build tests when testing service worker mode since it's
  // dev only
  if (!process.env.USE_SW) {
    describe('build', () => {
      let staticServer;
      beforeAll(async () => {
        console.log('building...');
        const buildOutput = await execa(binPath, ['build'], {
          cwd: tempDir,
        });
        expect(buildOutput.stdout).toMatch('Build completed');
        expect(buildOutput.stderr).toBe('');
        console.log('build complete. running build tests...');
      });

      afterAll(() => {
        console.log('build test done.');
        if (staticServer) staticServer.close();
      });

      describe('app', () => {
        beforeAll(async () => {
          // start a static file server
          const app = new (require('koa'))();
          app.use(require('koa-static')(path.join(tempDir, 'dist')));
          staticServer = require('http').createServer(app.callback());
          await new Promise((r) => staticServer.listen(3001, r));

          page = await browser.newPage();
          await page.goto('http://localhost:3001');
        });

        declareTests(true);
      });
    });
  }

  describe('dev', () => {
    beforeAll(async () => {
      browserLogs.length = 0;
      console.log('starting dev server...');
      // start dev server
      devServer = execa(binPath, {
        cwd: tempDir,
      });
      devServer.stderr.on('data', (data) => {
        serverLogs.push(data.toString());
      });
      await new Promise((resolve) => {
        devServer.stdout.on('data', (data) => {
          serverLogs.push(data.toString());
          if (data.toString().match('running')) {
            console.log('dev server running.');
            resolve();
          }
        });
      });

      console.log('launching browser');
      page = await browser.newPage();
      page.on('console', (msg) => {
        browserLogs.push(msg.text());
      });
      await page.goto('http://localhost:3000');
    });
    describe('app', () => {
      declareTests(false);
    });
  });
});

async function updateFile(file, replacer) {
  const compPath = path.join(tempDir, file);
  const content = await fs.readFile(compPath, 'utf-8');
  await fs.writeFile(compPath, replacer(content));
  // wait for hmr update to complete
  // TODO find more efficient way
  await timeout(200);
}

// poll until it updates
async function expectByPolling(poll, expected) {
  const maxTries = 20;
  for (let tries = 0; tries < maxTries; tries++) {
    const actual = (await poll()) || '';
    if (actual.indexOf(expected) > -1 || tries === maxTries - 1) {
      expect(actual).toMatch(expected);
      break;
    } else {
      await timeout(50);
    }
  }
}
