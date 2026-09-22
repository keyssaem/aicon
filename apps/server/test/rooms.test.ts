import { questCards } from '@aicon/content/public';
import type { BaseId, GameSnapshot, RoomOptions, RoomState } from '@aicon/protocol';
import { describe, expect, it } from 'vitest';
import { ROOM_IDLE_MS, type Result, RoomManager } from '../src/rooms';

interface Sent {
  socketId: string;
  event: string;
  payload: unknown;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const starsOf = (cardId: string) => questCards.find((card) => card.id === cardId)?.stars ?? 1;

function data<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`실패: ${result.error.code} (${result.error.message})`);
  return result.data;
}

function setup(options: { now?: () => number; disconnectTurnSec?: number } = {}) {
  const sent: Sent[] = [];
  const manager = new RoomManager({
    deliver: (socketId, event, payload) => sent.push({ socketId, event, payload }),
    ...options,
  });
  const lastOf = <T,>(socketId: string, event: string): T | undefined =>
    [...sent].reverse().find((m) => m.socketId === socketId && m.event === event)?.payload as T | undefined;
  const room = (socketId: string) => lastOf<RoomState>(socketId, 'room:state');
  const view = (socketId: string) => lastOf<GameSnapshot>(socketId, 'game:view');
  return { manager, sent, lastOf, room, view };
}

/** 4명이 들어와 시작한 방 */
function startedRoom(options: { disconnectTurnSec?: number; room?: Partial<RoomOptions> } = {}) {
  const context = setup(options.disconnectTurnSec === undefined ? {} : { disconnectTurnSec: options.disconnectTurnSec });
  const created = data(context.manager.create('s0', '지우', options.room));
  ['민수', '서연', '도윤'].forEach((name, index) => data(context.manager.join(`s${index + 1}`, created.code, name)));
  data(context.manager.start('s0'));
  return { ...context, code: created.code, hostToken: created.seatToken };
}

describe('방 만들기와 입장', () => {
  it('방을 만들면 6자리 코드와 좌석 0(방장), 재접속 토큰을 받는다', () => {
    const { manager, room } = setup();
    const created = data(manager.create('s0', '지우'));
    expect(created.code).toMatch(/^\d{6}$/);
    expect(created.seat).toBe(0);
    expect(created.seatToken.length).toBeGreaterThan(8);
    expect(room('s0')).toMatchObject({ status: 'LOBBY', hostSeat: 0, you: 0 });
    expect(room('s0')?.players).toEqual([{ seat: 0, name: '지우', connected: true }]);
  });

  it('4명까지 들어오고 5번째는 거절, 없는 코드도 거절', () => {
    const { manager } = setup();
    const { code } = data(manager.create('s0', '지우'));
    ['민수', '서연', '도윤'].forEach((name, index) => expect(manager.join(`s${index + 1}`, code, name).ok).toBe(true));
    expect(manager.join('s4', code, '다섯째')).toMatchObject({ ok: false, error: { code: 'ROOM_FULL' } });
    expect(manager.join('s9', '000000', '누구')).toMatchObject({ ok: false, error: { code: 'ROOM_NOT_FOUND' } });
  });

  it('시작 전에 나가면 자리가 비고, 방장이 나가면 다음 사람이 방장이 된다', () => {
    const { manager, room } = setup();
    const { code } = data(manager.create('s0', '지우'));
    manager.join('s1', code, '민수');
    manager.join('s2', code, '서연');

    manager.disconnect('s0');
    expect(room('s1')?.players.map((p) => p.name)).toEqual(['민수', '서연']);
    expect(room('s1')).toMatchObject({ hostSeat: 0, you: 0 });
    expect(room('s2')).toMatchObject({ you: 1 });
  });

  it('2명 미만이면 시작할 수 없고, 방장만 시작할 수 있으며, 시작 뒤에는 입장할 수 없다', () => {
    const { manager } = setup();
    const { code } = data(manager.create('s0', '지우'));
    expect(manager.start('s0')).toMatchObject({ ok: false, error: { code: 'NEED_PLAYERS' } });
    manager.join('s1', code, '민수');
    expect(manager.start('s1')).toMatchObject({ ok: false, error: { code: 'NOT_HOST' } });
    expect(manager.start('s0').ok).toBe(true);
    expect(manager.join('s2', code, '서연')).toMatchObject({ ok: false, error: { code: 'ALREADY_STARTED' } });
  });

  it('방장은 대기실에서 내보낼 수 있고, 나간 사람에게는 이유가 전달된다', () => {
    const { manager, lastOf, room } = setup();
    const { code } = data(manager.create('s0', '지우'));
    manager.join('s1', code, '민수');
    expect(manager.kick('s1', 0)).toMatchObject({ ok: false, error: { code: 'NOT_HOST' } });
    expect(manager.kick('s0', 1).ok).toBe(true);
    expect(lastOf<{ reason: string }>('s1', 'room:closed')?.reason).toContain('내보냈');
    expect(room('s0')?.players).toHaveLength(1);
  });

  it('30분 동안 아무 일도 없으면 방이 닫힌다', () => {
    let clock = 1_000_000;
    const { manager, lastOf } = setup({ now: () => clock });
    const { code } = data(manager.create('s0', '지우'));
    manager.join('s1', code, '민수');

    clock += ROOM_IDLE_MS - 1;
    expect(manager.sweep()).toBe(0);
    clock += 2;
    expect(manager.sweep()).toBe(1);
    expect(manager.size).toBe(0);
    expect(lastOf<{ reason: string }>('s1', 'room:closed')?.reason).toContain('오래');
  });
});

describe('게임 진행과 정보 은닉', () => {
  it('시작하면 좌석마다 자기 화면만 받는다 (남의 손패·정답표 없음)', () => {
    const { manager, view } = startedRoom();
    const mine = view('s0');
    const other = view('s1');
    expect(mine?.view.me?.seat).toBe(0);
    expect(other?.view.me?.seat).toBe(1);
    expect(mine?.view.players).toHaveLength(4);

    const json = JSON.stringify(mine);
    for (const cardId of other?.view.me?.quest ?? []) expect(json).not.toContain(`"${cardId}"`);
    for (const key of ['"catalog"', '"answers"', '"rng"', '"seed"', '"questDeck"']) expect(json).not.toContain(key);
    expect(manager.stats()).toEqual({ rooms: 1, players: 4 });
  });

  it('남의 자리로는 행동할 수 없다 (서버가 좌석을 소켓 기준으로 덮어씀)', () => {
    const { manager, view } = startedRoom();
    const active = view('s0')!.view.active;
    expect(manager.action(`s${(active + 1) % 4}`, { type: 'DRAW', source: 'QUEST' })).toMatchObject({
      ok: false,
      error: { code: 'NOT_YOUR_TURN' },
    });
    expect(manager.action(`s${active}`, { type: 'DRAW', source: 'QUEST' }).ok).toBe(true);
  });

  it('게임 중 끊겨도 자리가 남고, 토큰으로 다시 들어오면 같은 자리에서 이어 한다', () => {
    const { manager, view, room, code, hostToken } = startedRoom();
    const before = view('s0')!.view.me?.quest;

    manager.disconnect('s0');
    expect(room('s1')?.players).toHaveLength(4);
    expect(room('s1')?.players.map((p) => p.connected)).toEqual([false, true, true, true]);

    expect(data(manager.rejoin('s9', code, hostToken)).seat).toBe(0);
    expect(view('s9')?.view.me?.quest).toEqual(before);
    expect(room('s1')?.players.map((p) => p.connected)).toEqual([true, true, true, true]);
  });

  it('토큰이 맞지 않으면 자리를 주지 않는다', () => {
    const { manager, code } = startedRoom();
    expect(manager.rejoin('s9', code, 'not-a-real-token')).toMatchObject({
      ok: false,
      error: { code: 'SEAT_NOT_FOUND' },
    });
  });

  it('검증 창은 제한시간이 지나면 저절로 닫히고 다음 사람 차례가 된다', async () => {
    const { manager, view } = startedRoom({ room: { challengeSec: 0.05 } as Partial<RoomOptions> });
    const active = view('s0')!.view.active;
    const socket = `s${active}`;
    manager.action(socket, { type: 'DRAW', source: 'QUEST' });
    const card = view(socket)!.view.me!.quest[0]!;
    manager.action(socket, { type: 'PLAY_QUEST', cardIds: [card], base: `YES${starsOf(card)}` as BaseId });

    expect(view(socket)!.view.phase).toBe('CHALLENGE');
    expect(view(socket)!.timer).toMatchObject({ kind: 'CHALLENGE' });
    await wait(200);
    expect(view(socket)!.view.phase).toBe('DRAW');
    expect(view(socket)!.view.active).toBe((active + 1) % 4);
  });

  it('접속이 끊긴 사람의 차례는 잠시 뒤 자동으로 넘어간다', async () => {
    const { manager, view } = startedRoom({ disconnectTurnSec: 0.05 });
    const active = view('s0')!.view.active;
    const watcher = `s${(active + 1) % 4}`;

    manager.disconnect(`s${active}`);
    expect(view(watcher)!.timer).toMatchObject({ kind: 'TURN', seat: active });
    await wait(200);
    expect(view(watcher)!.view.active).not.toBe(active);
  });

  it('방에 들어가 있지 않으면 행동할 수 없다', () => {
    const { manager } = startedRoom();
    expect(manager.action('낯선소켓', { type: 'DRAW', source: 'QUEST' })).toMatchObject({
      ok: false,
      error: { code: 'NOT_IN_ROOM' },
    });
  });
});
