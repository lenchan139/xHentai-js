import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const root = path.resolve(import.meta.dirname, '..');
const shot = path.join(root, 'shots', 'live');
fs.mkdirSync(shot, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1');
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 180)); });

const script = fs.readFileSync(path.join(root, 'ehentai-app.user.js'), 'utf8');
await page.evaluateOnNewDocument(script);

console.log('Opening live e-hentai.org …');
await page.goto('https://e-hentai.org/', { waitUntil: 'domcontentloaded', timeout: 60000 });
try {
  await page.waitForSelector('.ehx-card', { timeout: 45000 });
  const n = await page.$$eval('.ehx-card', (els) => els.length);
  const title = await page.$eval('.ehx-card-title', (el) => el.textContent.trim());
  const href = await page.$eval('.ehx-card', (a) => a.href);
  console.log('cards:', n, '| first:', title, '|', href);
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(shot, 'home.png') });

  await page.click('.ehx-card');
  await page.waitForSelector('.ehx-dtitle', { timeout: 30000 });
  const dtitle = await page.$eval('.ehx-dtitle', (el) => el.textContent.trim());
  const thumbs = await page.$$eval('.ehx-thumb', (els) => els.length);
  const tags = await page.$$eval('.ehx-tagpill', (els) => els.length);
  console.log('detail:', dtitle.slice(0, 80), '| thumbs:', thumbs, '| tags:', tags);
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(shot, 'detail.png') });

  await page.click('[data-act="read"]');
  await page.waitForSelector('.ehx-reader .ehx-rpage img', { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2500));
  const count = await page.$eval('.ehx-rcount', (el) => el.textContent.trim());
  const img = await page.$eval('.ehx-reader .ehx-rpage img', (el) => ({ w: el.naturalWidth, h: el.naturalHeight, src: el.src.slice(0, 90) }));
  console.log('reader:', count, '| image:', img.w + 'x' + img.h, '|', img.src);
  await page.evaluate(() => document.querySelector('.ehx-rchrome')?.classList.remove('ehx-hidden'));
  await page.screenshot({ path: path.join(shot, 'reader.png') });
} catch (e) {
  console.log('LIVE TEST FAILED:', e.message);
  await page.screenshot({ path: path.join(shot, 'failure.png') });
}
await browser.close();
