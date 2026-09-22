// 방 관리: 6자리 코드, 좌석과 재접속 토큰, 서버 타이머, 좌석별 화면 전송.
// 소켓을 직접 알지 못하고 deliver 콜백으로만 내보내므로 테스트하기 쉽습니다.
import { randomInt, randomUUID } from 'node:crypto';
import { createGame, eventsFor, reduce, viewFor } from '@aicon/engine';
import type { GameState } from '@aicon/engine';
import { DEFAULT_ROOM_OPTIONS } from '@aicon/protocol';
import type {
  Action,
  AppError,
  ClientAction,
  GameEvent,
  GameSnapshot,
  RoomOptions,
  RoomState,
  SeatIndex,
  TimerInfo,
} from '@aicon/protocol';

export const MAX_PLAYERS = 4;
export const MIN_PLAYERS = 2;
export const ROOM_IDLE_MS = 30 * 60 * 1000;

const MESSAGES: Record<string, string> = {
  ROOM_NOT_FOUND: '그런 방이 없어요. 코드를 다시 확인해 주세요.',
  ROOM_FULL: '방에 4명이 모두 찼어요.',
  ALREADY_STARTED: '이미 시작한 방이에요.',
  NOT_IN_ROOM: '방에 들어가 있지 않아요.',
  NOT_HOST: '방장만 할 수 있어요.',
  NEED_PLAYERS: '2명 이상 모여야 시작할 수 있어요.',
  SEAT_NOT_FOUND: '이 방에서 자리를 찾지 못했어요. 코드로 다시 입장해 주세요.',
  GAME_NOT_STARTED: '아직 게임이 시작되지 않았어요.',
  BAD_REQUEST: '잘못된 요청이에요.',
  TOO_MANY_TRIES: '잠시 후에 다시 시도해 주세요.',
};

export const error = (code: string): AppError => ({ code, message: MESSAGES[code] ?? '문제가 생겼어요.' });

export type Result<T> = { ok: true; data: T } | { ok: false; error: AppError };
const ok = <T,>(data: T): Result<T> => ({ ok: true, data });
const fail = <T,>(code: string): Result<T> => ({ ok: false, error: error(code) });

export interface SeatRecord {
  seat: SeatIndex;
  name: string;
  /** 재접속용. 이 사람에게만 나갑니다. */
  token: string;
  socketId: string | null;
}

export interface Room {
  code: string;
  status: 'LOBBY' | 'PLAYING' | 'ENDED';
  hostSeat: SeatIndex;
  seats: SeatRecord[];
  options: RoomOptions;
  game: GameState | null;
  timer: { info: TimerInfo; handle: NodeJS.Timeout } | null;
  createdAt: number;
  lastActivity: number;
}

export type Deliver = (socketId: string, event: string, payload: unknown) => void;

export interface ManagerOptions {
  deliver: Deliver;
  now?: () => number;
  /** 접속이 끊긴 사람의 차례를 자동으로 넘기기까지의 시간(초) */
  disconnectTurnSec?: number;
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly bySocket = new Map<string, { code: string; seat: SeatIndex }>();
  private readonly deliver: Deliver;
  private readonly now: () => number;
  private readonly disconnectTurnSec: number;

  constructor(options: ManagerOptions) {
    this.deliver = options.deliver;
    this.now = options.now ?? Date.now;
    this.disconnectTurnSec = options.disconnectTurnSec ?? 45;
  }

  create(
    socketId: string,
    nickname: string,
    options?: Partial<RoomOptions>,
  ): Result<{ code: string; seat: SeatIndex; seatToken: string }> {
    const code = this.newCode();
    const seat: SeatRecord = { seat: 0, name: nickname, token: randomUUID(), socketId };
    const room: Room = {
      code,
      status: 'LOBBY',
      hostSeat: 0,
      seats: [seat],
      options: { ...DEFAULT_ROOM_OPTIONS, ...options },
      game: null,
      timer: null,
      createdAt: this.now(),
      lastActivity: this.now(),
    };
    this.rooms.set(code, room);
    this.bind(socketId, room, 0);
    this.broadcastRoom(room);
    return ok({ code, seat: 0, seatToken: seat.token });
  }

  join(socketId: string, code: string, nickname: string): Result<{ code: string; seat: SeatIndex; seatToken: string }> {
    const room = this.rooms.get(code);
    if (!room) return fail('ROOM_NOT_FOUND');
    if (room.status !== 'LOBBY') return fail('ALREADY_STARTED');
    if (room.seats.length >= MAX_PLAYERS) return fail('ROOM_FULL');

    const record: SeatRecord = { seat: room.seats.length, name: nickname, token: randomUUID(), socketId };
    room.seats.push(record);
    room.lastActivity = this.now();
    this.bind(socketId, room, record.seat);
    this.broadcastRoom(room);
    return ok({ code, seat: record.seat, seatToken: record.token });
  }

  /** 새로고침·와이파이 끊김 뒤 같은 자리로 돌아옵니다. */
  rejoin(socketId: string, code: string, token: string): Result<{ code: string; seat: SeatIndex; seatToken: string }> {
    const room = this.rooms.get(code);
    if (!room) return fail('ROOM_NOT_FOUND');
    const record = room.seats.find((s) => s.token === token);
    if (!record) return fail('SEAT_NOT_FOUND');

    if (record.socketId && record.socketId !== socketId) {
      this.bySocket.delete(record.socketId);
      this.deliver(record.socketId, 'room:closed', { reason: '다른 기기에서 같은 자리로 접속했어요.' });
    }
    record.socketId = socketId;
    this.bind(socketId, room, record.seat);
    this.broadcastRoom(room);
    if (room.game) {
      // 돌아왔으니 자동 넘김 타이머를 풀고, 모두에게 새 화면을 보냅니다.
      this.armTimer(room);
      this.broadcastGame(room, []);
    }
    return ok({ code, seat: record.seat, seatToken: record.token });
  }

  /** 접속이 끊겼을 때: 시작 전이면 자리를 비우고, 게임 중이면 자리를 남겨 둡니다. */
  disconnect(socketId: string): void {
    const bound = this.bySocket.get(socketId);
    this.bySocket.delete(socketId);
    if (!bound) return;
    const room = this.rooms.get(bound.code);
    if (!room) return;
    const record = room.seats.find((s) => s.seat === bound.seat);
    if (record && record.socketId === socketId) record.socketId = null;

    if (room.status === 'LOBBY') {
      room.seats = room.seats.filter((s) => s.seat !== bound.seat);
      room.seats.forEach((s, index) => {
        if (s.seat === index) return;
        s.seat = index;
        if (s.socketId) this.bySocket.set(s.socketId, { code: room.code, seat: index });
      });
      if (room.seats.length === 0) {
        this.close(room, '방에 아무도 없어 닫혔어요.');
        return;
      }
      if (bound.seat === room.hostSeat || room.hostSeat >= room.seats.length) room.hostSeat = 0;
    }
    this.broadcastRoom(room);
    if (room.status === 'PLAYING') {
      // 차례인 사람이 끊기면 자동 넘김 타이머가 걸립니다. 남은 사람들도 그 사실을 볼 수 있어야 합니다.
      this.armTimer(room);
      this.broadcastGame(room, []);
    }
  }

  leave(socketId: string): Result<null> {
    this.disconnect(socketId);
    return ok(null);
  }

  kick(socketId: string, seat: SeatIndex): Result<null> {
    const bound = this.require(socketId);
    if (!bound.ok) return bound;
    const { room, seat: mySeat } = bound.data;
    if (mySeat !== room.hostSeat) return fail('NOT_HOST');
    if (room.status !== 'LOBBY') return fail('ALREADY_STARTED');
    const target = room.seats.find((s) => s.seat === seat);
    if (!target || seat === mySeat) return fail('BAD_REQUEST');

    if (target.socketId) {
      this.deliver(target.socketId, 'room:closed', { reason: '방장이 내보냈어요.' });
      this.disconnect(target.socketId);
    } else {
      room.seats = room.seats.filter((s) => s.seat !== seat);
      room.seats.forEach((s, index) => (s.seat = index));
      this.broadcastRoom(room);
    }
    return ok(null);
  }

  setOptions(socketId: string, options: Partial<RoomOptions>): Result<null> {
    const bound = this.require(socketId);
    if (!bound.ok) return bound;
    const { room, seat } = bound.data;
    if (seat !== room.hostSeat) return fail('NOT_HOST');
    if (room.status !== 'LOBBY') return fail('ALREADY_STARTED');
    room.options = { ...room.options, ...options };
    room.lastActivity = this.now();
    this.broadcastRoom(room);
    return ok(null);
  }

  start(socketId: string): Result<null> {
    const bound = this.require(socketId);
    if (!bound.ok) return bound;
    const { room, seat } = bound.data;
    if (seat !== room.hostSeat) return fail('NOT_HOST');
    if (room.status !== 'LOBBY') return fail('ALREADY_STARTED');
    if (room.seats.length < MIN_PLAYERS) return fail('NEED_PLAYERS');

    const { state, events } = createGame({
      players: room.seats.map((s) => s.name),
      seed: randomInt(0, 2 ** 31 - 1),
      options: { rounds: room.options.rounds, expertIcon: room.options.expertIcon },
    });
    room.game = state;
    room.status = 'PLAYING';
    room.lastActivity = this.now();
    this.broadcastRoom(room);
    this.armTimer(room);
    this.broadcastGame(room, events);
    return ok(null);
  }

  /** 기기가 보낸 행동. seat은 접속된 좌석으로 덮어써서, 남의 자리로는 행동할 수 없습니다. */
  action(socketId: string, clientAction: ClientAction): Result<null> {
    const bound = this.require(socketId);
    if (!bound.ok) return bound;
    const { room, seat } = bound.data;
    if (room.status !== 'PLAYING' || !room.game) return fail('GAME_NOT_STARTED');

    const action: Action =
      clientAction.type === 'NEXT_ROUND' ? { type: 'NEXT_ROUND' } : ({ ...clientAction, seat } as Action);
    const failure = this.dispatch(room, action);
    return failure ? { ok: false, error: failure } : ok(null);
  }

  /** 30분 넘게 아무 일도 없던 방을 닫습니다. */
  sweep(): number {
    const now = this.now();
    let closed = 0;
    for (const room of [...this.rooms.values()]) {
      if (now - room.lastActivity <= ROOM_IDLE_MS) continue;
      this.close(room, '오래 사용하지 않아 방이 닫혔어요.');
      closed += 1;
    }
    return closed;
  }

  stats(): { rooms: number; players: number } {
    let players = 0;
    for (const room of this.rooms.values()) players += room.seats.filter((s) => s.socketId).length;
    return { rooms: this.rooms.size, players };
  }

  roomOf(socketId: string): Room | null {
    const bound = this.bySocket.get(socketId);
    return bound ? (this.rooms.get(bound.code) ?? null) : null;
  }

  get size(): number {
    return this.rooms.size;
  }

  // ── 내부 ───────────────────────────────────────────────────────────

  private dispatch(room: Room, action: Action): AppError | null {
    const state = room.game;
    if (!state) return error('GAME_NOT_STARTED');
    const result = reduce(state, action);
    if (!result.ok) return result.error;

    room.game = result.state;
    room.lastActivity = this.now();
    if (result.state.phase === 'GAME_END') room.status = 'ENDED';
    this.armTimer(room);
    this.broadcastGame(room, result.events);
    if (room.status === 'ENDED') this.broadcastRoom(room);
    return null;
  }

  /**
   * 지금 상태에 맞는 서버 타이머를 겁니다.
   * 검증 창·방어 창은 규칙상 제한시간이 있고, 접속이 끊긴 사람의 차례는 게임이 멈추지 않게 넘깁니다.
   */
  private armTimer(room: Room): void {
    this.clearTimer(room);
    const state = room.game;
    if (!state || room.status !== 'PLAYING') return;

    const now = this.now();
    let info: TimerInfo | null = null;
    if (state.phase === 'CHALLENGE') {
      info = { kind: 'CHALLENGE', endsAt: now + room.options.challengeSec * 1000, seat: null };
    } else if (state.phase === 'DEFENSE' && state.pending?.kind === 'DEFENSE') {
      info = { kind: 'DEFENSE', endsAt: now + room.options.defenseSec * 1000, seat: state.pending.target };
    } else if ((state.phase === 'DRAW' || state.phase === 'ACT') && !this.isConnected(room, state.active)) {
      info = { kind: 'TURN', endsAt: now + this.disconnectTurnSec * 1000, seat: state.active };
    }
    if (!info) return;

    const handle = setTimeout(
      () => {
        room.timer = null;
        if (this.rooms.get(room.code) !== room) return;
        this.dispatch(room, { type: 'TIMEOUT' });
      },
      Math.max(0, info.endsAt - now),
    );
    handle.unref?.();
    room.timer = { info, handle };
  }

  private clearTimer(room: Room): void {
    if (!room.timer) return;
    clearTimeout(room.timer.handle);
    room.timer = null;
  }

  private isConnected(room: Room, seat: SeatIndex): boolean {
    return Boolean(room.seats.find((s) => s.seat === seat)?.socketId);
  }

  private bind(socketId: string, room: Room, seat: SeatIndex): void {
    this.bySocket.set(socketId, { code: room.code, seat });
  }

  private require(socketId: string): Result<{ room: Room; seat: SeatIndex }> {
    const bound = this.bySocket.get(socketId);
    if (!bound) return fail('NOT_IN_ROOM');
    const room = this.rooms.get(bound.code);
    if (!room) return fail('ROOM_NOT_FOUND');
    return ok({ room, seat: bound.seat });
  }

  private newCode(): string {
    for (let tries = 0; tries < 50; tries += 1) {
      const code = String(randomInt(100000, 1000000));
      if (!this.rooms.has(code)) return code;
    }
    throw new Error('방 코드를 만들지 못했습니다.');
  }

  private close(room: Room, reason: string): void {
    this.clearTimer(room);
    for (const seat of room.seats) {
      if (!seat.socketId) continue;
      this.deliver(seat.socketId, 'room:closed', { reason });
      this.bySocket.delete(seat.socketId);
    }
    this.rooms.delete(room.code);
  }

  private roomStateFor(room: Room, seat: SeatIndex): RoomState {
    return {
      code: room.code,
      status: room.status,
      hostSeat: room.hostSeat,
      you: seat,
      players: room.seats.map((s) => ({ seat: s.seat, name: s.name, connected: Boolean(s.socketId) })),
      options: { ...room.options },
    };
  }

  private snapshotFor(room: Room, seat: SeatIndex): GameSnapshot | null {
    if (!room.game) return null;
    return { view: viewFor(room.game, seat), timer: room.timer ? { ...room.timer.info } : null, now: this.now() };
  }

  private broadcastRoom(room: Room): void {
    for (const seat of room.seats) {
      if (!seat.socketId) continue;
      this.deliver(seat.socketId, 'room:state', this.roomStateFor(room, seat.seat));
    }
  }

  /** 좌석마다 볼 수 있는 이벤트와 화면 상태를 보냅니다. */
  private broadcastGame(room: Room, events: GameEvent[]): void {
    const state = room.game;
    if (!state) return;
    for (const seat of room.seats) {
      if (!seat.socketId) continue;
      if (events.length > 0) {
        this.deliver(seat.socketId, 'game:events', { seq: state.seq, events: eventsFor(events, seat.seat) });
      }
      const snapshot = this.snapshotFor(room, seat.seat);
      if (snapshot) this.deliver(seat.socketId, 'game:view', snapshot);
    }
  }
}
