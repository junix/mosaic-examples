import {spawn} from 'node:child_process';
import {mkdir, readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {PNG} from 'pngjs';
import {chromium} from 'playwright-core';

const root = resolve(import.meta.dirname, '..');
const renderOnly = process.argv.includes('--render-only');
const port = 41732;
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const vite = resolve(root, 'node_modules/vite/bin/vite.js');
const server = spawn(process.execPath, [vite, 'preview', '--host', '127.0.0.1', '--port', String(port)], {cwd: root, stdio: 'pipe'});
const failures = [];

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) return; } catch {}
    await new Promise(resolveWait => setTimeout(resolveWait, 120));
  }
  throw new Error('Vite preview did not become ready');
}

function inspectTransparentPng(buffer, scene) {
  const image = PNG.sync.read(buffer);
  let clear = 0;
  let ink = 0;
  let saturated = 0;
  for (let index = 0; index < image.data.length; index += 4) {
    const r = image.data[index];
    const g = image.data[index + 1];
    const b = image.data[index + 2];
    const alpha = image.data[index + 3];
    if (alpha < 8) clear += 1;
    if (alpha > 32) ink += 1;
    if (alpha > 80 && Math.max(r, g, b) - Math.min(r, g, b) > 28) saturated += 1;
  }
  const pixels = image.width * image.height;
  if (clear < pixels * 0.18) failures.push(`${scene}: transparent area too small (${clear}/${pixels})`);
  if (ink < 8_000) failures.push(`${scene}: visible content too small (${ink} pixels)`);
  if (saturated < 1_200) failures.push(`${scene}: colored data marks missing (${saturated} pixels)`);
  return {width: image.width, height: image.height, clear, ink};
}

try {
  await mkdir(resolve(root, 'out'), {recursive: true});
  await waitForServer();
  const browser = await chromium.launch({headless: true, executablePath: chrome});
  for (const scene of ['density', 'signals', 'linked']) {
    const page = await browser.newPage({viewport: {width: 1400, height: 900}, deviceScaleFactor: 1});
    const errors = [];
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === '127.0.0.1' || ['blob:', 'data:'].includes(url.protocol)) route.continue();
      else { failures.push(`${scene}: blocked external request ${url.href}`); route.abort(); }
    });
    await page.goto(`http://127.0.0.1:${port}/?scene=${scene}&export=1`, {waitUntil: 'networkidle'});
    await page.waitForFunction(() => window.__mosaicDemo?.ready === true || Boolean(window.__mosaicDemo?.error), undefined, {timeout: 40_000});
    const state = await page.evaluate(() => ({...window.__mosaicDemo}));
    if (state.error) throw new Error(`${scene}: ${state.error}`);
    await page.waitForSelector('#chart svg, #chart canvas', {timeout: 10_000});
    await page.waitForTimeout(450);
    const path = resolve(root, 'out', `${scene}-transparent.png`);
    await page.screenshot({path, omitBackground: true});
    const stats = inspectTransparentPng(await readFile(path), scene);
    if (!renderOnly) {
      const plot = page.locator('#chart svg, #chart canvas').first();
      const box = await plot.boundingBox();
      if (!box) throw new Error(`${scene}: plot has no bounds`);
      await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.42);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.63, box.y + box.height * 0.64, {steps: 8});
      await page.mouse.up();
      await page.waitForFunction(() => (window.__mosaicDemo?.interactions ?? 0) > 0);
    }
    if (errors.length) failures.push(`${scene}: console errors: ${errors.join(' | ')}`);
    console.log(`rendered ${scene}: ${state.rows} DB rows -> ${stats.width}x${stats.height} transparent PNG`);
    await page.close();
  }
  await browser.close();
} finally {
  server.kill('SIGTERM');
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`Mosaic ${renderOnly ? 'render' : 'validation'} passed: 3 transparent PNGs`);
