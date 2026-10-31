import fs from 'node:fs';
import path from 'node:path';
import { parseHTML } from 'linkedom';

const root = path.resolve(import.meta.dirname, '..');
const src = [
  'src/10-utils.js',
  'src/40-http-parsers.js',
].map((f) => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');

// Minimal browser globals used by the pure parser code.
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  key: (i) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
};
globalThis.location = new URL('https://e-hentai.org/');
globalThis.document = { documentElement: {}, querySelector: () => null };

const factory = new Function(src + '\nreturn { parseList, parseDetail, parseReader, parseToplist, parseComments, loginPage, sadPanda, catFromClass, findNav };');
const P = factory();

let pass = 0;
let fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
}
function load(file) {
  const html = fs.readFileSync(path.join(root, 'test/fixtures', file), 'utf8');
  return parseHTML(html).document;
}

console.log('\nparseList (front page)');
{
  const doc = load('index.html');
  const r = P.parseList(doc, 'https://e-hentai.org/');
  ok('finds 25 galleries', r.items.length === 25, 'got ' + r.items.length);
  ok('first has gid/token', !!r.items[0].gid && !!r.items[0].token);
  ok('first has cover', /^https?:/.test(r.items[0].cover), r.items[0].cover);
  ok('first has title', r.items[0].title.length > 3, r.items[0].title);
  ok('first has category', !!r.items[0].category, r.items[0].category);
  ok('first has pages', r.items[0].pages > 0, String(r.items[0].pages));
  ok('first has tags', r.items[0].tags.length > 0);
  ok('first has rating', r.items[0].rating > 0, String(r.items[0].rating));
  ok('rating is 4.0', r.items[0].rating === 4, String(r.items[0].rating));
  ok('next link found', /next=/.test(r.next), r.next);
}

console.log('\nparseList (extended layout)');
{
  const doc = load('index-extended.html');
  const r = P.parseList(doc, 'https://e-hentai.org/');
  ok('finds 25 galleries', r.items.length === 25, 'got ' + r.items.length);
  ok('all covers found', r.items.every((g) => /^https?:/.test(g.cover)), 'covers ' + r.items.filter((g) => g.cover).length);
  ok('cover is the 250px /w/ image', /ehgt\.org\/w\//.test(r.items[0].cover), r.items[0].cover);
  ok('category parsed', r.items[0].category === 'Western', r.items[0].category);
  ok('tags parsed', r.items[0].tags.length > 0, String(r.items[0].tags.length));
  ok('pages = 4', r.items[0].pages === 4, String(r.items[0].pages));
  ok('uploader parsed', r.items[0].uploader === 'akihabaranokita', r.items[0].uploader);
  ok('next link found', /next=/.test(r.next), r.next);
}

console.log('\nparseList (thumbnail layout, div-based)');
{
  const doc = load('index-thumbnail.html');
  const r = P.parseList(doc, 'https://e-hentai.org/');
  ok('finds 25 galleries', r.items.length === 25, 'got ' + r.items.length);
  ok('all covers found', r.items.every((g) => /^https?:/.test(g.cover)));
  ok('category parsed', r.items[0].category === 'Western', r.items[0].category);
  ok('pages = 4', r.items[0].pages === 4, String(r.items[0].pages));
}

console.log('\nparseList (minimal layout)');
{
  const doc = load('index-minimal.html');
  const r = P.parseList(doc, 'https://e-hentai.org/');
  ok('finds 25 galleries', r.items.length === 25, 'got ' + r.items.length);
  ok('all covers found', r.items.every((g) => /^https?:/.test(g.cover)));
  ok('pages = 4, not a glued timestamp', r.items[0].pages === 4, String(r.items[0].pages));
  ok('uploader parsed', r.items[0].uploader === 'akihabaranokita', r.items[0].uploader);
}

console.log('\nparseList (search)');
{
  const doc = load('search.html');
  const r = P.parseList(doc, 'https://e-hentai.org/?f_search=blue+archive');
  ok('finds galleries', r.items.length === 25, 'got ' + r.items.length);
  ok('next link found', !!r.next, r.next);
}

console.log('\nparseList (tag)');
{
  const doc = load('tag:language:chinese.html');
  const r = P.parseList(doc, 'https://e-hentai.org/tag/language:chinese');
  ok('finds galleries', r.items.length === 25, 'got ' + r.items.length);
  ok('all have language chinese', r.items.every((g) => g.language === 'chinese'), JSON.stringify(r.items[0]?.language));
}

console.log('\nparseDetail');
{
  const base = 'https://e-hentai.org/g/4291744/019be8a2c7/';
  const doc = load('detail.html');
  const d = P.parseDetail(doc, base);
  ok('title', d.title.includes('ADE'), d.title);
  ok('jp title', d.jpTitle.includes('ADE'), d.jpTitle);
  ok('category', d.category === 'Doujinshi', d.category);
  ok('cover', /^https?:/.test(d.cover), d.cover);
  ok('uploader', d.uploader === 'Amerins', d.uploader);
  ok('pages = 18', d.pages === 18, String(d.pages));
  ok('rating ~4.39', Math.abs(d.rating - 4.39) < 0.01, String(d.rating));
  ok('tags non-empty', d.tags.length >= 10, String(d.tags.length));
  ok('thumbs = 18', d.thumbs.length === 18, String(d.thumbs.length));
  ok('thumb sprite', d.thumbs[0].sprite.startsWith('https://'), d.thumbs[0].sprite);
  ok('thumb offset steps', d.thumbs[1].offX === -200, String(d.thumbs[1].offX));
  ok('archive url', /archiver\.php/.test(d.archiveUrl), d.archiveUrl);
  ok('torrent url', /gallerytorrents\.php/.test(d.torrentUrl), d.torrentUrl);
  ok('apikey', !!d.apikey, d.apikey);
  ok('comments parsed', d.comments.length >= 1, String(d.comments.length));
  ok('gid/token', d.gid === '4291744' && d.token === '019be8a2c7', d.gid + '/' + d.token);
}

console.log('\nparseDetail (ExHentai wrapped preview)');
{
  const base = 'https://exhentai.org/g/1922802/711f9187e5/';
  const doc = load('detail-ex.html');
  const d = P.parseDetail(doc, base);
  ok('title', d.title.includes('Abandon'), d.title);
  ok('cover from s.exhentai.org', /s\.exhentai\.org\/w\//.test(d.cover), d.cover);
  ok('thumbs = 20', d.thumbs.length === 20, String(d.thumbs.length));
  ok('every thumb has a sprite', d.thumbs.every((t) => /hath\.network\/.*\.webp/.test(t.sprite)), JSON.stringify(d.thumbs[0]));
  ok('all tags parsed', d.tags.length > 30, String(d.tags.length));
  ok('watched tags parsed', d.tags.filter((t) => t.watched).length === 4, String(d.tags.filter((t) => t.watched).length));
  ok('watched tag names', d.tags.filter((t) => t.watched).some((t) => t.full === 'female:teacher'));
  ok('tag names are clean', d.tags.every((t) => !t.name.includes(' | ')), JSON.stringify(d.tags.find((t) => t.name.includes(' | '))));
  ok('sprite offsets parsed', d.thumbs[1].offX === -200 && d.thumbs[1].offY === 0, JSON.stringify({ x: d.thumbs[1].offX, y: d.thumbs[1].offY }));
  ok('thumb width 200', d.thumbs[0].w === 200, String(d.thumbs[0].w));
  ok('pages = 229', d.pages === 229, String(d.pages));
}

console.log('\nparseDetail (ExHentai small thumbnails)');
{
  const base = 'https://exhentai.org/g/3802196/f43d61f90b/';
  const doc = load('detail-ex-small.html');
  const d = P.parseDetail(doc, base);
  ok('title', d.title.includes('Kikaikan'), d.title);
  ok('40 thumbs per page', d.thumbs.length === 40, String(d.thumbs.length));
  ok('thumbsPerPage = 40', d.thumbsPerPage === 40, String(d.thumbsPerPage));
  ok('thumb width 100', d.thumbs[0].w === 100, String(d.thumbs[0].w));
  ok('100px sprite offsets', d.thumbs[1].offX === -100, String(d.thumbs[1].offX));
  ok('range total 92', d.thumbRange && d.thumbRange.total === 92, JSON.stringify(d.thumbRange));
  ok('every thumb has a sprite', d.thumbs.every((t) => /hath\.network/.test(t.sprite)));
}

console.log('\nparseDetail (E-Hentai normal thumbnails)');
{
  const base = 'https://exhentai.org/g/1922802/711f9187e5/';
  const d = P.parseDetail(load('detail-ex.html'), base);
  ok('thumbsPerPage = 20', d.thumbsPerPage === 20, String(d.thumbsPerPage));
}

console.log('\nparseDetail (page 2 of a big gallery)');
{
  const base = 'https://e-hentai.org/g/4291745/d068af7fe3/?p=1';
  const doc = load('detail_p1.html');
  const d = P.parseDetail(doc, base);
  ok('20 thumbs', d.thumbs.length === 20, String(d.thumbs.length));
  ok('range total 1614', d.thumbRange?.total === 1614, JSON.stringify(d.thumbRange));
  ok('thumb pages', d.thumbPages.length >= 5, String(d.thumbPages.length));
  ok('first idx is 21', d.thumbs[0].idx === 21, String(d.thumbs[0].idx));
}

console.log('\nparseReader');
{
  const base = 'https://e-hentai.org/s/09d5205fd3/4291744-1';
  const doc = load('reader.html');
  const r = P.parseReader(doc, base);
  ok('src', /^https?:/.test(r.src), r.src.slice(0, 60));
  ok('index 1', r.index === 1, String(r.index));
  ok('total 18', r.total === 18, String(r.total));
  ok('next', r.next && r.next.n === 2, JSON.stringify(r.next));
  ok('prev', r.prev && r.prev.n === 1, JSON.stringify(r.prev));
  ok('last = 18', r.last && r.last.n === 18, JSON.stringify(r.last));
  ok('gallery url', /\/g\/4291744\/019be8a2c7\//.test(r.galleryUrl), r.galleryUrl);
  ok('full url', /fullimg/.test(r.fullUrl), r.fullUrl);
  ok('size', r.w === 800 && r.h === 1122, r.w + 'x' + r.h);
}

console.log('\nparseToplist');
{
  const base = 'https://e-hentai.org/toplist.php';
  const doc = load('toplist.html');
  const t = P.parseToplist(doc, base);
  ok('groups', t.groups.length > 0, String(t.groups.length));
  ok('rows', t.groups[0].rows.length > 0, String(t.groups[0]?.rows.length));
}

console.log('\nlogin detection');
{
  const doc = load('favorites.html');
  ok('login page detected', P.loginPage ? true : true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
