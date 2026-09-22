// 연결 테스트용 상대. 서버에 직접 붙어 간단한 규칙으로 플레이합니다.
// 사용: node apps/server/scripts/testbot.mjs <방코드> [이름]
// 같은 방 코드로 다시 실행하면 저장해 둔 좌석 토큰으로 재접속합니다.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io } from 'socket.io-client';

const [, , code, nickname = '민수'] = process.argv;
if (!code) {
  console.log('사용: node apps/server/scripts/testbot.mjs <방코드> [이름]');
  process.exit(1);
}

const url = process.env.AICON_SERVER ?? 'http://localhost:5175';
const cards = JSON.parse(readFileSync(new URL('../../../packages/content/src/cards.public.json', import.meta.url), 'utf8'));
const starsOf = (id) => cards.find((card) => card.id === id)?.stars ?? 1;
const sessionPath = path.join(os.tmpdir(), `aicon-bot-${nickname}.json`);

const socket = io(url, { transports: ['polling', 'websocket'] });
let me = null;
let latest = null;
let acting = false;

const send = (action) => new Promise((resolve) => socket.emit('game:action', action, resolve));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function decide(view) {
  const pending = view.pending;
  if (view.phase === 'ROUND_END') return { type: 'NEXT_ROUND' };
  if (view.phase === 'CHALLENGE' && pending?.eligible.includes(me) && !pending.passed.includes(me)) {
    return { type: Math.random() < Number(process.env.AICON_BOT_CHALLENGE ?? 0.35) ? 'CHALLENGE' : 'PASS' };
  }
  if (view.phase === 'DEFENSE' && pending?.target === me) {
    const defense = view.me.specials.find((special) => special.kind === 'DEFENSE');
    return defense ? { type: 'DEFEND', specialId: defense.id } : { type: 'ACCEPT_ATTACK' };
  }
  if (view.active !== me) return null;
  if (view.phase === 'DRAW') return { type: 'DRAW', source: 'QUEST' };
  if (view.phase === 'ACT') {
    const cardId = view.me.quest[0];
    if (!cardId) return null;
    const type = Math.random() < 0.7 ? 'YES' : 'NO';
    return { type: 'PLAY_QUEST', cardIds: [cardId], base: `${type}${starsOf(cardId)}` };
  }
  return null;
}

async function tick() {
  if (acting || me === null) return;
  acting = true;
  try {
    for (let step = 0; step < 50; step += 1) {
      const view = latest;
      if (!view) break;
      const action = decide(view);
      if (!action) break;
      await wait(600);
      const result = await send(action);
      if (!result?.ok) {
        console.log('행동 거절:', action.type, result?.error?.code ?? '');
        break;
      }
      console.log('행동:', action.type);
      if (latest === view) break;
    }
  } finally {
    acting = false;
  }
}

socket.on('connect', () => {
  const saved = existsSync(sessionPath) ? JSON.parse(readFileSync(sessionPath, 'utf8')) : null;
  const rejoin = saved && saved.code === code;
  const event = rejoin ? 'room:rejoin' : 'room:join';
  const payload = rejoin ? { code, seatToken: saved.seatToken } : { code, nickname };
  socket.emit(event, payload, (result) => {
    if (!result.ok) {
      console.log(`${rejoin ? '재접속' : '입장'} 실패:`, result.error.code, result.error.message);
      process.exit(1);
    }
    me = result.data.seat;
    writeFileSync(sessionPath, JSON.stringify({ code, seatToken: result.data.seatToken }));
    console.log(`${rejoin ? '재접속' : '입장'} 완료 · 좌석 ${me}`);
    void tick();
  });
});

socket.on('room:state', (state) =>
  console.log('[방]', state.status, state.players.map((p) => `${p.name}${p.connected ? '' : '(끊김)'}`).join(', ')),
);
socket.on('room:closed', (payload) => {
  console.log('[방 닫힘]', payload.reason);
  process.exit(0);
});
socket.on('game:view', ({ view }) => {
  latest = view;
  void tick();
});
