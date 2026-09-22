// 화면(정적 파일)과 게임 소켓을 같은 주소에서 제공합니다. CORS·쿠키 문제가 없고 배포도 하나로 끝납니다.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { Server } from 'socket.io';
import { attachGateway, socketDeliver } from './gateway';
import { RoomManager } from './rooms';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const webDist = process.env.AICON_WEB_DIST ?? path.join(repoRoot, 'apps', 'web', 'dist');
const cardsDir = process.env.AICON_CARDS_DIR ?? path.join(repoRoot, 'packages', 'content', 'assets', 'cards');
const port = Number(process.env.PORT ?? 5175);
const host = process.env.HOST ?? '0.0.0.0';
const corsOrigin = process.env.AICON_CORS_ORIGIN ?? '*';

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

await app.register(fastifyStatic, {
  root: cardsDir,
  prefix: '/cards/',
  maxAge: '7d',
});

const hasWeb = existsSync(path.join(webDist, 'index.html'));
if (hasWeb) {
  await app.register(fastifyStatic, { root: webDist, prefix: '/', decorateReply: false });
  // 새로고침해도 방 화면으로 돌아올 수 있게, 없는 경로는 화면 앱에 맡깁니다.
  app.setNotFoundHandler((request, reply) => {
    if (request.raw.url?.startsWith('/socket.io')) return reply.code(404).send({ error: 'not found' });
    return reply.sendFile('index.html', webDist);
  });
} else {
  app.log.warn(`화면 빌드를 찾지 못했습니다: ${webDist} (개발 중에는 Vite 개발 서버를 쓰세요)`);
}

const io = new Server(app.server, {
  serveClient: false,
  cors: { origin: corsOrigin },
  // 학교망에서 웹소켓이 막혀도 이어지도록 롱폴링을 남겨 둡니다.
  transports: ['polling', 'websocket'],
  pingTimeout: 20_000,
});

const manager = new RoomManager({ deliver: socketDeliver(io) });
attachGateway(io, manager);

app.get('/healthz', async () => ({ ok: true, ...manager.stats(), uptime: Math.round(process.uptime()) }));

const sweeper = setInterval(() => {
  const closed = manager.sweep();
  if (closed > 0) app.log.info(`오래 쓰지 않은 방 ${closed}개를 닫았습니다.`);
}, 60_000);
sweeper.unref();

await app.listen({ port, host });
app.log.info(`아이콘 서버 시작 · http://localhost:${port} (화면 ${hasWeb ? '포함' : '없음'})`);
