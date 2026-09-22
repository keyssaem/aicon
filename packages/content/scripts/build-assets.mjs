// 원본 카드 이미지(JPG)를 웹앱용 WebP로 변환하고, 원본 번호 대신 순서 없는 파일명으로 저장합니다.
// 사용: npm run assets:build   (원본 폴더 위치가 다르면 AICON_SOURCE_DIR 환경변수로 지정)
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const sourceDir = process.env.AICON_SOURCE_DIR ?? path.join(repoRoot, '220425 아이콘 카드 그림(다즐에듀)');
const outDir = path.resolve(here, '../assets/cards');
const map = JSON.parse(await readFile(path.join(here, 'source-images.json'), 'utf8'));

const sourcePath = (n) => path.join(sourceDir, map.sourceFilePattern.replace('{n}', String(n)));

await mkdir(outDir, { recursive: true });

// sharp(libvips)에 한글 경로를 넘기지 않도록 파일은 Node로 읽고 쓰기만 합니다.
let count = 0;
for (const [name, n] of Object.entries(map.cards)) {
  const input = await readFile(sourcePath(n));
  const output = await sharp(input).webp({ quality: 90 }).toBuffer();
  await writeFile(path.join(outDir, `${name}.webp`), output);
  count += 1;
}

const { source, left, top, width, height } = map.token;
const tokenInput = await readFile(sourcePath(source));
const token = await sharp(tokenInput).extract({ left, top, width, height }).webp({ quality: 90 }).toBuffer();
await writeFile(path.join(outDir, 'token.webp'), token);
count += 1;

console.log(`${count}개 이미지를 ${path.relative(repoRoot, outDir)}에 저장했습니다.`);
