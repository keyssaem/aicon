// 기기 ↔ 서버 메시지 정의와 입력 검사(zod). 서버는 이 스키마를 통과한 요청만 엔진에 넘깁니다.
import { z } from 'zod';
import type { GameEvent, GameOptions, PlayerView, SeatIndex } from './game';

export interface RoomOptions extends GameOptions {
  /** 검증 창 제한시간(초) */
  challengeSec: number;
  /** 방어 창 제한시간(초) */
  defenseSec: number;
}

export const DEFAULT_ROOM_OPTIONS: RoomOptions = { rounds: 2, expertIcon: false, challengeSec: 10, defenseSec: 5 };

export interface RoomPlayer {
  seat: SeatIndex;
  name: string;
  connected: boolean;
}

export interface RoomState {
  code: string;
  status: 'LOBBY' | 'PLAYING' | 'ENDED';
  hostSeat: SeatIndex;
  you: SeatIndex;
  players: RoomPlayer[];
  options: RoomOptions;
}

/** 서버 타이머가 도는 창. endsAt은 서버 시계 기준 epoch(ms) */
export interface TimerInfo {
  kind: 'CHALLENGE' | 'DEFENSE' | 'TURN';
  endsAt: number;
  seat: SeatIndex | null;
}

export interface GameSnapshot {
  view: PlayerView;
  timer: TimerInfo | null;
  /** 서버 시계. 기기 시계가 틀려도 남은 시간을 맞게 보여 주기 위해 함께 보냅니다. */
  now: number;
}

export interface EventBatch {
  seq: number;
  events: GameEvent[];
}

export interface JoinResult {
  code: string;
  seat: SeatIndex;
  seatToken: string;
}

/** 규칙 위반(RuleError)과 방 관련 오류를 함께 담는 모양 */
export interface AppError {
  code: string;
  message: string;
}

export type Ack<T> = { ok: true; data: T } | { ok: false; error: AppError };

export const MAX_PLAYERS = 4;
export const NICKNAME_MAX = 8;

export const nicknameSchema = z
  .string()
  .trim()
  .min(1)
  .max(NICKNAME_MAX)
  .regex(/^[^\p{C}]+$/u, '이름에 쓸 수 없는 문자가 있어요.');

export const codeSchema = z.string().regex(/^\d{6}$/, '방 코드는 숫자 6자리예요.');
export const seatTokenSchema = z.string().min(8).max(64);
export const seatSchema = z.number().int().min(0).max(MAX_PLAYERS - 1);

export const roomOptionsSchema = z.object({
  rounds: z.number().int().min(1).max(3),
  expertIcon: z.boolean(),
  challengeSec: z.number().int().min(3).max(60),
  defenseSec: z.number().int().min(3).max(60),
});

export const createRoomSchema = z.object({
  nickname: nicknameSchema,
  options: roomOptionsSchema.partial().optional(),
});

export const joinRoomSchema = z.object({ code: codeSchema, nickname: nicknameSchema });
export const rejoinRoomSchema = z.object({ code: codeSchema, seatToken: seatTokenSchema });
export const kickSchema = z.object({ seat: seatSchema });
export const optionsSchema = z.object({ options: roomOptionsSchema.partial() });

const cardIdSchema = z.string().min(1).max(40);
const baseIdSchema = z.enum(['YES1', 'YES2', 'YES3', 'YES4', 'YES5', 'NO1', 'NO2', 'NO3', 'NO4', 'NO5']);

/** 기기가 보낼 수 있는 행동. seat은 서버가 접속된 좌석으로 덮어씁니다. TIMEOUT은 서버만 씁니다. */
export const clientActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('DRAW'), source: z.enum(['QUEST', 'SPECIAL']) }),
  z.object({ type: z.literal('PLAY_QUEST'), cardIds: z.array(cardIdSchema).min(1).max(12), base: baseIdSchema }),
  z.object({
    type: z.literal('USE_ICON'),
    specialId: cardIdSchema,
    cardIds: z.array(cardIdSchema).min(3).max(5),
    bases: z.array(baseIdSchema).min(3).max(5).optional(),
  }),
  z.object({ type: z.literal('USE_ATTACK'), specialId: cardIdSchema, target: seatSchema }),
  z.object({ type: z.literal('USE_RECYCLE'), specialId: cardIdSchema, base: baseIdSchema }),
  z.object({ type: z.literal('CHALLENGE') }),
  z.object({ type: z.literal('PASS') }),
  z.object({ type: z.literal('DEFEND'), specialId: cardIdSchema }),
  z.object({ type: z.literal('ACCEPT_ATTACK') }),
  z.object({ type: z.literal('NEXT_ROUND') }),
]);

export type ClientAction = z.infer<typeof clientActionSchema>;

/** 서버 → 기기 */
export interface ServerToClientEvents {
  'room:state': (state: RoomState) => void;
  'room:closed': (payload: { reason: string }) => void;
  'game:view': (snapshot: GameSnapshot) => void;
  'game:events': (batch: EventBatch) => void;
  'game:error': (error: AppError) => void;
}

/** 기기 → 서버 (모두 응답 콜백을 받습니다) */
export interface ClientToServerEvents {
  'room:create': (payload: unknown, ack: (result: Ack<JoinResult>) => void) => void;
  'room:join': (payload: unknown, ack: (result: Ack<JoinResult>) => void) => void;
  'room:rejoin': (payload: unknown, ack: (result: Ack<JoinResult>) => void) => void;
  'room:leave': (payload: unknown, ack: (result: Ack<null>) => void) => void;
  'room:options': (payload: unknown, ack: (result: Ack<null>) => void) => void;
  'room:start': (payload: unknown, ack: (result: Ack<null>) => void) => void;
  'room:kick': (payload: unknown, ack: (result: Ack<null>) => void) => void;
  'game:action': (payload: unknown, ack: (result: Ack<null>) => void) => void;
}
