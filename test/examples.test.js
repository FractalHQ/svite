const fs = require('fs-extra');
const path = require('path');
const execa = require('execa');

const { closeKillAll, closeKill, throttledWrite, deleteDir, launchPuppeteer, sleep, hmrUpdateComplete } = require('./utils');

jest.setTimeout(35000);

const tempDir = path.join(__dirname, 'temp');
const sviteDir = path.join(__dirname, '..');

// global refs so we can stop them
let installCmd;
let buildServer;
let buildScript;
let devServer;
let browser;
let page;

const examples = ['minimal', 'postcss-tailwind', 'routify-mdsvex', 'svelte-preprocess-auto'];

const pmOptions = ['npm', 'pnpm', 'yarn', 'yarn2'];
const scriptOptions = ['javascript', 'typescript'];

describe('examples', () => {
  let svitePackage;
  beforeAll(async () => {
    await deleteDir(tempDir);
    await fs.mkdirp(tempDir);
    try {
      const packCmd = await execa('npm', ['pack', sviteDir], { cwd: tempDir });
      svitePackage = path.join(tempDir, packCmd.stdout);
    } catch (e) {
      console.error('pack failed', e);
      throw e;
    }
  });
  for (let script of scriptOptions) {
    describe(script, () => {
      for (let pm of pmOptions) {
        describe(pm, () => {
          const pmCmd = pm === 'yarn2' ? 'yarn' : pm;
          for (let example of examples) {
            describe(example, () => {
              const exampleDir = path.join(__dirname, '..', 'examples', script === 'typescript' ? `typescript/${example}` : example);

              const exampleTempDir = path.join(tempDir, script, pm, example);
              const updateExampleFile = updateFile.bind(null, exampleTempDir);
              const browserLogs = [];
              const serverLogs = [];

              beforeAll(async () => {
                try {
                  await deleteDir(exampleTempDir);
                  await fs.mkdirp(exampleTempDir);
                  await fs.copy(exampleDir, exampleTempDir, {
                    filter: (file) => !/dist|node_modules/.test(file),
                  });
                  const testPackageName = `svite-test-${script}-${pm}-${example}`;
                  await updateExampleFile('package.json', (c) =>
                    c
                      .replace(/"svite": ?"[^"]+"/, `"svite": "${svitePackage}"`)
                      .replace(/"name": ?"([^"]+)"/, `"name": "${testPackageName}","private":true,"license":"UNLICENSED"`),
                  );
                  await updateExampleFile('src/App.svelte', (c) => `${c}\n<div id="test-div">__xxx__</div>`);
                } catch (e) {
                  console.error(e);
                  throw e;
                }
                try {
                  if (pm === 'yarn2') {
                    await execa(pmCmd, ['set', 'version', 'berry'], { cwd: exampleTempDir });
                    await fs.writeFile(path.join(exampleTempDir, 'yarn.lock'), '');
                  }

                  installCmd = await execa(pmCmd, ['install'], { cwd: exampleTempDir });
                  await fs.writeFile(path.join(exampleTempDir, 'install.stdout.log'), installCmd.stdout);
                  await fs.writeFile(path.join(exampleTempDir, 'install.stderr.log'), installCmd.stderr);
                } catch (e) {
                  try {
                    await fs.writeFile(path.join(exampleTempDir, 'install.stdout.log'), installCmd.stdout);
                    await fs.writeFile(path.join(exampleTempDir, 'install.stderr.log'), installCmd.stderr);
                  } catch (e) {
                    console.error('failed to write logs to disk', e);
                  }
                  console.error(`${pm} install failed in ${exampleTempDir}`, e);
                  throw e;
                }
              });

              afterAll(async () => {
                if (browser) await browser.close();
                if (devServer) {
                  await closeKill(devServer);
                }
                await fs.writeFile(path.join(exampleTempDir, 'browser.log'), browserLogs.join('\n'));
                await fs.writeFile(path.join(exampleTempDir, 'server.log'), serverLogs.join('\n'));
              });
              describe('svite', () => {
                beforeAll(async () => {
                  browser = await launchPuppeteer();
                });

                function declareTests(isBuild) {
                  test('should render App.svelte', async () => {
                    await expectByPolling(async () => await getText('#test-div'), '__xxx__');
                  });

                  test('should not have failed requests', () => {
                    const has404 = browserLogs.some((msg) => msg.match('404'));
                    expect(has404).toBe(false);
                  });

                  if (!isBuild) {
                    describe('hmr', () => {
                      test('should accept update to App.svelte', async () => {
                        if (example.indexOf('routify') > -1) {
                          await sleep(250); // let routify route update complete first
                        }
                        expect(await getText('#test-div')).toBe('__xxx__');
                        await updateExampleFile('src/App.svelte', (c) => c.replace('__xxx__', '__yyy__'));
                        await hmrUpdateComplete(page, 'src/App.svelte', 5000);
                        expect(await getText('#test-div')).toBe('__yyy__');
                      });
                    });
                  }
                }

                // test build first since we are going to edit the fixtures when testing dev
                // no need to run build tests when testing service worker mode since it's
                // dev only
                if (!process.env.USE_SW) {
                  describe('build', () => {
                    beforeAll(async () => {
                      try {
                        buildScript = await execa(pmCmd, ['run', 'build'], {
                          cwd: exampleTempDir,
                        });
                        try {
                          await fs.writeFile(path.join(exampleTempDir, 'build.stdout.log'), buildScript.stdout);
                          await fs.writeFile(path.join(exampleTempDir, 'build.stderr.log'), buildScript.stderr);
                        } catch (e) {
                          console.error('failed to write logs to disk', e);
                        }
                        expect(buildScript.stdout).toMatch('Build completed');
                        expect(buildScript.stderr).toBe('');
                      } catch (e) {
                        try {
                          await fs.writeFile(path.join(exampleTempDir, 'build.stdout.log'), buildScript.stdout);
                          await fs.writeFile(path.join(exampleTempDir, 'build.stderr.log'), buildScript.stderr);
                        } catch (e) {
                          console.error('failed to write logs to disk', e);
                        }
                        console.error('svite build failed', e);
                        throw e;
                      }
                    });

                    afterAll(async () => {
                      closeKillAll([buildScript, buildServer]);
                    });

                    describe('app', () => {
                      beforeAll(async () => {
                        // start a static file server
                        try {
                          const app = new (require('koa'))();
                          app.use(require('koa-static')(path.join(exampleTempDir, 'dist')));
                          buildServer = require('http').createServer(app.callback());
                          await new Promise((r) => buildServer.listen(4001, r));

                          page = await browser.newPage();
                          await page.goto('http://localhost:4001', { waitUntil: 'networkidle2' });
                          await page.screenshot({ path: path.join(exampleTempDir, 'built.png'), type: 'png' });
                        } catch (e) {
                          console.error(`failed to serve build and open page for example ${example}`, e);
                          throw e;
                        }
                      });

                      declareTests(true);
                    });
                  });
                }

                describe('dev', () => {
                  beforeAll(async () => {
                    browserLogs.push('------------------- dev -------------------------');
                    try {
                      devServer = execa(pmCmd, ['run', 'dev'], {
                        cwd: exampleTempDir,
                      });
                      devServer.stderr.on('data', (data) => {
                        serverLogs.push(`stderr: ${data.toString()}`);
                      });
                      devServer.stdout.on('data', (data) => {
                        serverLogs.push(`stdout: ${data.toString()}`);
                      });
                      const url = await new Promise((resolve) => {
                        const resolveLocalUrl = (data) => {
                          const match = data.toString().match(/http:\/\/localhost:\d+/);
                          if (match) {
                            devServer.stdout.off('data', resolveLocalUrl);
                            resolve(match[0]);
                          }
                        };
                        devServer.stdout.on('data', resolveLocalUrl);
                      });
                      page = await browser.newPage();
                      page.on('console', (msg) => {
                        browserLogs.push(msg.text());
                      });
                      await page.goto(url, { waitUntil: 'networkidle2' });
                      if (!browserLogs.some((log) => log.indexOf('connected.') > -1)) {
                        await new Promise((resolve) => {
                          const resolveConnected = (log) => {
                            if (log.indexOf('connected.') > -1) {
                              page.off('console', resolveConnected);
                              resolve();
                            }
                          };
                          page.on('console', resolveConnected);
                        });
                      }
                    } catch (e) {
                      console.error(`failed to start devserver and open page in dev mode for example ${example}`, e);
                      throw e;
                    }
                  });
                  describe('app', () => {
                    declareTests(false);
                  });
                });
              });
            });
          }
        });
      }
    });
  }
});

async function updateFile(dir, file, replacer) {
  const compPath = path.join(dir, file);
  const content = await fs.readFile(compPath, 'utf-8');
  const newContent = replacer(content);
  await throttledWrite(compPath, newContent, 100);
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
      await sleep(50);
    }
  }
}

const getEl = async (selectorOrEl) => {
  return typeof selectorOrEl === 'string' ? await page.$(selectorOrEl) : selectorOrEl;
};

const getText = async (selectorOrEl) => {
  const el = await getEl(selectorOrEl);
  return el ? el.evaluate((el) => el.textContent) : null;
};

const killAll = () => {
  closeKillAll([installCmd, buildServer, buildScript, devServer, page, browser, process]);
};

process.once('SIGINT', () => killAll());
process.once('SIGTERM', () => killAll());
