// 한 브라우저에서 4좌석을 번갈아 조작하는 디버그용 세션.
// 규칙 엔진을 그대로 불러 쓰고, 모든 상태를 기록해 되돌리기와 다시보기를 지원합니다.
import { checkInvariants, createGame, reduce } from '@aicon/engine';
import type { Action, GameEvent, GameState, RuleError, SeatIndex } from '@aicon/engine';

export interface SessionConfig {
  players: string[];
  seed: number;
  rounds: number;
  expertIcon: boolean;
  firstSeat: SeatIndex | 'random';
}

export interface Step {
  action: Action | null;
  events: GameEvent[];
  state: GameState;
}

export interface Session {
  config: SessionConfig;
  steps: Step[];
}

export const DEFAULT_CONFIG: SessionConfig = {
  players: ['지우', '민수', '서연', '도윤'],
  seed: 2026,
  rounds: 2,
  expertIcon: false,
  firstSeat: 0,
};

export function startSession(config: SessionConfig): Session {
  const { state, events } = createGame({
    players: config.players,
    seed: config.seed,
    options: { rounds: config.rounds, expertIcon: config.expertIcon },
    ...(config.firstSeat === 'random' ? {} : { firstSeat: config.firstSeat }),
  });
  return { config, steps: [{ action: null, events, state }] };
}

export function current(session: Session): GameState {
  return session.steps[session.steps.length - 1]!.state;
}

export function applyAction(session: Session, action: Action): { session: Session; error?: RuleError } {
  const result = reduce(current(session), action);
  if (!result.ok) return { session, error: result.error };
  return { session: { ...session, steps: [...session.steps, { action, events: result.events, state: result.state }] } };
}

export function undo(session: Session): Session {
  if (session.steps.length <= 1) return session;
  return { ...session, steps: session.steps.slice(0, -1) };
}

export function problems(session: Session): string[] {
  return checkInvariants(current(session));
}

/** 버그 재현용: 시드와 행동 기록만 있으면 같은 판을 그대로 되살릴 수 있습니다. */
export function exportSession(session: Session): string {
  return JSON.stringify(
    { version: 1, config: session.config, actions: session.steps.slice(1).map((step) => step.action) },
    null,
    2,
  );
}

export function importSession(json: string): Session {
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed !== 'object' || parsed === null) throw new Error('기록 형식이 아닙니다.');
  const { config, actions } = parsed as { config?: SessionConfig; actions?: Action[] };
  if (!config || !Array.isArray(actions)) throw new Error('config와 actions가 필요합니다.');
  let session = startSession(config);
  actions.forEach((action, index) => {
    const result = applyAction(session, action);
    if (result.error) throw new Error(`${index + 1}번째 행동에서 막힘: ${result.error.message}`);
    session = result.session;
  });
  return session;
}
