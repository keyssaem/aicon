import { checkInvariants } from '../invariants';
import { reduce } from '../reduce';
import { randomFn } from '../rng';
import { createGame } from '../setup';
import type { Action, GameEvent, GameOptions, GameState } from '../types';
import { type AgentStyle, DEFAULT_STYLE, randomAction } from './randomAgent';

export interface SimulationOptions {
  seed: number;
  players: number;
  options?: Partial<GameOptions>;
  style?: AgentStyle;
  /** 이 수를 넘기면 끝나지 않는 게임으로 보고 멈춥니다. */
  maxActions?: number;
  /** 매 행동 뒤 불변 조건을 검사합니다. */
  checkEachStep?: boolean;
}

export interface SimulationResult {
  state: GameState;
  actions: Action[];
  finished: boolean;
  /** 규칙 위반으로 거절된 무작위 행동 (정상이라면 비어 있어야 함) */
  rejected: { action: Action; code: string }[];
  problems: string[];
  events: GameEvent[];
}

const NAMES = ['지우', '민수', '서연', '도윤'];

export function simulateGame(opts: SimulationOptions): SimulationResult {
  const { state: initial, events } = createGame({
    players: NAMES.slice(0, opts.players),
    seed: opts.seed,
    ...(opts.options ? { options: opts.options } : {}),
  });
  const rand = randomFn(opts.seed ^ 0x9e3779b9);
  const style = opts.style ?? DEFAULT_STYLE;
  const maxActions = opts.maxActions ?? 20_000;
  const actions: Action[] = [];
  const rejected: SimulationResult['rejected'] = [];
  const allEvents: GameEvent[] = [...events];
  let state = initial;
  let problems = opts.checkEachStep ? checkInvariants(state) : [];

  while (state.phase !== 'GAME_END' && actions.length < maxActions && problems.length === 0) {
    const action = randomAction(state, rand, style);
    if (!action) break;
    const result = reduce(state, action);
    if (!result.ok) {
      rejected.push({ action, code: result.error.code });
      break;
    }
    actions.push(action);
    allEvents.push(...result.events);
    state = result.state;
    if (opts.checkEachStep) problems = checkInvariants(state);
  }

  return { state, actions, finished: state.phase === 'GAME_END', rejected, problems, events: allEvents };
}
