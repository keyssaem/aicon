// 서버와의 연결. 새로고침·와이파이 끊김 뒤에는 저장해 둔 좌석 토큰으로 스스로 같은 자리에 돌아갑니다.
import type { AppError, ClientAction, EventBatch, GameSnapshot, JoinResult, RoomOptions, RoomState } from '@aicon/protocol';
import { type Socket, io } from 'socket.io-client';

const STORAGE_KEY = 'aicon.session';

export interface SavedSession {
  code: string;
  seatToken: string;
  nickname: string;
}

export function loadSession(): SavedSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { code, seatToken, nickname } = parsed as Partial<SavedSession>;
    if (!code || !seatToken || !nickname) return null;
    return { code, seatToken, nickname };
  } catch {
    return null;
  }
}

export function saveSession(session: SavedSession | null): void {
  try {
    if (session) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 시크릿 모드 등에서 저장이 막혀도 게임은 계속할 수 있습니다.
  }
}

export type ConnectionStatus = 'connecting' | 'online' | 'offline';

export interface ClientHandlers {
  onRoom: (state: RoomState) => void;
  onView: (snapshot: GameSnapshot) => void;
  onEvents: (batch: EventBatch) => void;
  onClosed: (reason: string) => void;
  onStatus: (status: ConnectionStatus) => void;
}

export class GameClient {
  private readonly socket: Socket;
  private nickname = '';

  constructor(private readonly handlers: ClientHandlers, url?: string) {
    const target = url ?? (import.meta.env.VITE_SERVER_URL as string | undefined) ?? window.location.origin;
    this.socket = io(target, {
      // 학교망에서 웹소켓이 막혀도 이어지도록 롱폴링을 남겨 둡니다.
      transports: ['polling', 'websocket'],
      reconnectionDelayMax: 4000,
    });

    this.socket.on('connect', () => {
      handlers.onStatus('online');
      const saved = loadSession();
      if (saved) void this.rejoin(saved);
    });
    this.socket.on('disconnect', () => handlers.onStatus('offline'));
    this.socket.io.on('reconnect_attempt', () => handlers.onStatus('connecting'));
    this.socket.on('room:state', (state: RoomState) => handlers.onRoom(state));
    this.socket.on('game:view', (snapshot: GameSnapshot) => handlers.onView(snapshot));
    this.socket.on('game:events', (batch: EventBatch) => handlers.onEvents(batch));
    this.socket.on('room:closed', (payload: { reason: string }) => {
      saveSession(null);
      handlers.onClosed(payload.reason);
    });
  }

  private request<T>(event: string, payload: unknown = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      this.socket.timeout(8000).emit(event, payload, (timeout: unknown, result?: { ok: boolean; data?: T; error?: AppError }) => {
        if (timeout) {
          reject({ code: 'TIMEOUT', message: '서버가 응답하지 않아요. 잠시 뒤 다시 시도해 주세요.' } satisfies AppError);
          return;
        }
        if (!result || !result.ok) {
          reject(result?.error ?? { code: 'UNKNOWN', message: '문제가 생겼어요.' });
          return;
        }
        resolve(result.data as T);
      });
    });
  }

  private remember(result: JoinResult): JoinResult {
    saveSession({ code: result.code, seatToken: result.seatToken, nickname: this.nickname });
    return result;
  }

  async create(nickname: string, options?: Partial<RoomOptions>): Promise<JoinResult> {
    this.nickname = nickname;
    return this.remember(await this.request<JoinResult>('room:create', { nickname, options }));
  }

  async join(code: string, nickname: string): Promise<JoinResult> {
    this.nickname = nickname;
    return this.remember(await this.request<JoinResult>('room:join', { code, nickname }));
  }

  async rejoin(saved: SavedSession): Promise<JoinResult | null> {
    this.nickname = saved.nickname;
    try {
      return this.remember(await this.request<JoinResult>('room:rejoin', { code: saved.code, seatToken: saved.seatToken }));
    } catch (error) {
      saveSession(null);
      this.handlers.onClosed((error as AppError).message);
      return null;
    }
  }

  async leave(): Promise<void> {
    saveSession(null);
    await this.request('room:leave');
  }

  start(): Promise<unknown> {
    return this.request('room:start');
  }

  setOptions(options: Partial<RoomOptions>): Promise<unknown> {
    return this.request('room:options', { options });
  }

  kick(seat: number): Promise<unknown> {
    return this.request('room:kick', { seat });
  }

  action(action: ClientAction): Promise<unknown> {
    return this.request('game:action', action);
  }
}
