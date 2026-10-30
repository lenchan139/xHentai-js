import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const file = path.join(root, 'ehentai-app.user.js');
let src = fs.readFileSync(file, 'utf8');
const before = src;

src = src.replace(/^\/\/ @version\s+\S+$/m, `// @version      ${version}`);
src = src.replace(/const VERSION = '[^']*';/, `const VERSION = '${version}';`);

if (src !== before) fs.writeFileSync(file, src);
console.log(`version: ${version}`);
