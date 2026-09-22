// 배포 전 안전장치: 학생 기기로 가는 빌드에 퀘스트카드 정답·해설이 섞여 들어갔는지 확인합니다.
// 사용: npm run check:bundle   (apps/web을 먼저 빌드해 두어야 합니다)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const distDir = path.join(root, 'apps', 'web', 'dist');
const answers = JSON.parse(readFileSync(path.join(root, 'packages', 'content', 'src', 'answers.server.json'), 'utf8'));

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

const texts = files(distDir)
  .filter((file) => /\.(js|css|html|json|map)$/.test(file))
  .map((file) => ({ file, body: readFileSync(file, 'utf8') }));

const problems = [];
for (const { file, body } of texts) {
  if (body.includes('answers.server')) problems.push(`${path.relative(root, file)}: answers.server 참조`);
  for (const answer of answers) {
    const clue = answer.explain.slice(0, 14);
    if (body.includes(clue)) problems.push(`${path.relative(root, file)}: 해설 문장 발견 (${answer.id})`);
    // "q-xxxx":"YES" 같은 정답 짝이 들어갔는지
    if (body.includes(`"${answer.id}":"${answer.type}"`) || body.includes(`${answer.id}":"${answer.type}`)) {
      problems.push(`${path.relative(root, file)}: 정답 짝 발견 (${answer.id})`);
    }
  }
}

if (problems.length > 0) {
  console.error('정답이 화면 빌드에 섞였습니다:');
  for (const line of [...new Set(problems)]) console.error(' -', line);
  process.exit(1);
}
console.log(`화면 빌드 ${texts.length}개 파일 검사 완료 — 정답·해설 없음.`);
