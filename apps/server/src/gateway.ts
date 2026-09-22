// 소켓 입구. 들어온 값은 반드시 스키마로 검사한 뒤 방 관리자에게 넘깁니다.
import type { Server, Socket } from 'socket.io';
import {
  clientActionSchema,
  createRoomSchema,
  joinRoomSchema,
  kickSchema,
  optionsSchema,
  rejoinRoomSchema,
} from '@aicon/protocol';
import type { ZodType } from 'zod';
import { type Result, RoomManager, error } from './rooms';

type Ack = ((result: unknown) => void) | undefined;

/** 방 만들기·입장 시도 제한 (한 소켓당 1분에 20번) */
const TRY_WINDOW_MS = 60_000;
const TRY_LIMIT = 20;

export function attachGateway(io: Server, manager: RoomManager): void {
  io.on('connection', (socket: Socket) => {
    const tries: number[] = [];

    const overLimit = (): boolean => {
      const now = Date.now();
      while (tries.length > 0 && now - (tries[0] as number) > TRY_WINDOW_MS) tries.shift();
      tries.push(now);
      return tries.length > TRY_LIMIT;
    };

    const on = <T,>(
      event: string,
      schema: ZodType<T>,
      handler: (data: T) => Result<unknown>,
      options: { limited?: boolean } = {},
    ): void => {
      socket.on(event, (payload: unknown, ack: Ack) => {
        if (options.limited && overLimit()) {
          ack?.({ ok: false, error: error('TOO_MANY_TRIES') });
          return;
        }
        const parsed = schema.safeParse(payload ?? {});
        if (!parsed.success) {
          ack?.({ ok: false, error: error('BAD_REQUEST') });
          return;
        }
        ack?.(handler(parsed.data));
      });
    };

    const empty = { safeParse: (value: unknown) => ({ success: true as const, data: value ?? {} }) } as ZodType<unknown>;

    on('room:create', createRoomSchema, (data) => manager.create(socket.id, data.nickname, data.options), { limited: true });
    on('room:join', joinRoomSchema, (data) => manager.join(socket.id, data.code, data.nickname), { limited: true });
    on('room:rejoin', rejoinRoomSchema, (data) => manager.rejoin(socket.id, data.code, data.seatToken), { limited: true });
    on('room:leave', empty, () => manager.leave(socket.id));
    on('room:options', optionsSchema, (data) => manager.setOptions(socket.id, data.options));
    on('room:start', empty, () => manager.start(socket.id));
    on('room:kick', kickSchema, (data) => manager.kick(socket.id, data.seat));
    on('game:action', clientActionSchema, (action) => manager.action(socket.id, action));

    socket.on('disconnect', () => manager.disconnect(socket.id));
  });
}

/** 방 관리자가 좌석별로 보내는 메시지를 실제 소켓으로 내보냅니다. */
export function socketDeliver(io: Server) {
  return (socketId: string, event: string, payload: unknown): void => {
    io.sockets.sockets.get(socketId)?.emit(event, payload);
  };
}
