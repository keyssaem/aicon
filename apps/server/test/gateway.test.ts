// 진짜 소켓으로 붙어서 방 만들기 → 입장 → 시작 → 행동 → 재접속까지 확인합니다.
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Ack, GameSnapshot, JoinResult, RoomState } from '@aicon/protocol';
import { Server } from 'socket.io';
import { type Socket, io } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { attachGateway, socketDeliver } from '../src/gateway';
import { RoomManager } from '../src/rooms';

let httpServer: ReturnType<typeof createServer>;
let ioServer: Server;
let url = '';
const clients: Socket[] = [];

beforeAll(async () => {
  httpServer = createServer();
  ioServer = new Server(httpServer, { cors: { origin: '*' } });
  const manager = new RoomManager({ deliver: socketDeliver(ioServer), disconnectTurnSec: 60 });
  attachGateway(ioServer, manager);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
});

afterAll(async () => {
  for (const client of clients) client.disconnect();
  ioServer.close();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

function connect(): Socket {
  const socket = io(url, { transports: ['websocket'], forceNew: true });
  clients.push(socket);
  return socket;
}

const ready = (socket: Socket) => new Promise<void>((resolve) => socket.on('connect', () => resolve()));

function ask<T>(socket: Socket, event: string, payload: unknown = {}): Promise<Ack<T>> {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

function nextEvent<T>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event, resolve));
}

describe('소켓 통합', () => {
  it('방 만들기 → 입장 → 시작 → 행동 → 재접속', async () => {
    const host = connect();
    const guest = connect();
    await Promise.all([ready(host), ready(guest)]);

    const created = await ask<JoinResult>(host, 'room:create', { nickname: '지우' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const code = created.data.code;

    const joined = await ask<JoinResult>(guest, 'room:join', { code, nickname: '민수' });
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;
    expect(joined.data.seat).toBe(1);

    // 잘못된 요청은 거절합니다.
    expect(await ask(guest, 'room:join', { code: '12', nickname: '' })).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
    expect(await ask(guest, 'room:start')).toMatchObject({ ok: false, error: { code: 'NOT_HOST' } });

    const hostView = nextEvent<GameSnapshot>(host, 'game:view');
    const guestView = nextEvent<GameSnapshot>(guest, 'game:view');
    expect(await ask(host, 'room:start')).toMatchObject({ ok: true });
    const [mine, theirs] = await Promise.all([hostView, guestView]);

    expect(mine.view.me?.seat).toBe(0);
    expect(theirs.view.me?.seat).toBe(1);
    // 남의 손패는 내 화면에 없습니다.
    const json = JSON.stringify(mine);
    for (const cardId of theirs.view.me?.quest ?? []) expect(json).not.toContain(`"${cardId}"`);

    const active = mine.view.active;
    const actor = active === 0 ? host : guest;
    const other = active === 0 ? guest : host;

    // 남의 자리로는 행동할 수 없습니다 (seat을 실어 보내도 무시됩니다).
    expect(await ask(other, 'game:action', { type: 'DRAW', source: 'QUEST', seat: active })).toMatchObject({
      ok: false,
      error: { code: 'NOT_YOUR_TURN' },
    });

    const afterDraw = nextEvent<GameSnapshot>(actor, 'game:view');
    expect(await ask(actor, 'game:action', { type: 'DRAW', source: 'QUEST' })).toMatchObject({ ok: true });
    const drawn = await afterDraw;
    expect(drawn.view.me?.quest).toHaveLength(7);
    expect(drawn.view.seq).toBeGreaterThan(mine.view.seq);

    // 끊고 토큰으로 다시 들어오면 같은 자리, 같은 손패
    const token = active === 0 ? created.data.seatToken : joined.data.seatToken;
    actor.disconnect();
    const back = connect();
    await ready(back);
    const restored = nextEvent<GameSnapshot>(back, 'game:view');
    const rejoined = await ask<JoinResult>(back, 'room:rejoin', { code, seatToken: token });
    expect(rejoined).toMatchObject({ ok: true, data: { seat: active } });
    expect((await restored).view.me?.quest).toEqual(drawn.view.me?.quest);

    // 토큰이 틀리면 거절
    const stranger = connect();
    await ready(stranger);
    expect(await ask(stranger, 'room:rejoin', { code, seatToken: 'wrong-token-1234' })).toMatchObject({
      ok: false,
      error: { code: 'SEAT_NOT_FOUND' },
    });
  });

  it('방에 들어가지 않은 소켓은 행동할 수 없다', async () => {
    const stranger = connect();
    await ready(stranger);
    expect(await ask(stranger, 'game:action', { type: 'DRAW', source: 'QUEST' })).toMatchObject({
      ok: false,
      error: { code: 'NOT_IN_ROOM' },
    });
  });

  it('없는 방 코드로는 들어갈 수 없다', async () => {
    const stranger = connect();
    await ready(stranger);
    const result = await ask<RoomState>(stranger, 'room:join', { code: '999999', nickname: '누구' });
    expect(result).toMatchObject({ ok: false, error: { code: 'ROOM_NOT_FOUND' } });
  });
});
