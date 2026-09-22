import { questCards } from '@aicon/content/public';
import { expect } from 'vitest';
import { BASE_IDS, baseIdOf, checkInvariants, createGame, reduce } from '../src';
import type { Action, BaseId, GameEvent, GameOptions, GameState, RuleErrorCode, SpecialKind } from '../src';
import { cloneState } from '../src/clone';

const idByName = new Map(questCards.map((card) => [card.name, card.id]));

/** 카드 이름으로 ID 찾기 */
export function id(name: string): string {
  const cardId = idByName.get(name);
  if (!cardId) throw new Error(`없는 카드 이름: ${name}`);
  return cardId;
}

export function ids(...names: string[]): string[] {
  return names.map(id);
}

export const NAMES = ['지우', '민수', '서연', '도윤'];

export function newGame(players = 3, options?: Partial<GameOptions>, seed = 42): GameState {
  return createGame({ players: NAMES.slice(0, players), seed, firstSeat: 0, ...(options ? { options } : {}) }).state;
}

export interface Arrangement {
  active?: number;
  phase?: 'DRAW' | 'ACT';
  /** 좌석별 손패(카드 이름). 지정하지 않은 좌석은 남은 카드 3장을 받습니다. */
  hands?: Record<number, string[]>;
  specials?: Record<number, SpecialKind[]>;
  /** 베이스별 카드 이름, 앞에서부터 아래 → 위 */
  bases?: Partial<Record<BaseId, string[]>>;
  iconPile?: string[];
  /** 퀘스트 더미 맨 위에 올릴 카드 이름 (마지막이 맨 위) */
  deckTop?: string[];
  /** 남은 퀘스트카드를 둘 곳: 더미(기본) · 정답 베이스 위 · 특정 좌석 손 */
  rest?: 'deck' | 'bases' | { hand: number };
  /** 남은 스페셜카드를 둘 곳: 더미(기본) · 버린 더미 */
  specialRest?: 'deck' | 'discard';
  tokens?: Record<number, number>;
  skip?: Record<number, number>;
}

/** 원하는 장면을 카드 보존 규칙을 지키며 만들어 줍니다. */
export function arrange(base: GameState, arr: Arrangement): GameState {
  const s = cloneState(base);
  const questPool = Object.keys(s.catalog.questStars).sort();
  const specialPool = Object.keys(s.catalog.specialKinds).sort();
  const takeQuest = (name: string) => {
    const cardId = id(name);
    const index = questPool.indexOf(cardId);
    if (index < 0) throw new Error(`이미 배치한 카드: ${name}`);
    questPool.splice(index, 1);
    return cardId;
  };
  const takeSpecial = (kind: SpecialKind) => {
    const index = specialPool.findIndex((sid) => s.catalog.specialKinds[sid] === kind);
    if (index < 0) throw new Error(`남은 스페셜카드 없음: ${kind}`);
    return specialPool.splice(index, 1)[0] as string;
  };

  let playId = 900;
  for (const baseId of BASE_IDS) {
    s.bases[baseId] = (arr.bases?.[baseId] ?? []).map((name) => ({ cardId: takeQuest(name), playId: playId++ }));
  }
  s.iconPile = (arr.iconPile ?? []).map(takeQuest);
  const deckTop = (arr.deckTop ?? []).map(takeQuest);
  s.players.forEach((p, seat) => {
    p.quest = (arr.hands?.[seat] ?? []).map(takeQuest);
    p.specials = (arr.specials?.[seat] ?? []).map(takeSpecial);
    p.tokens = arr.tokens?.[seat] ?? 0;
    p.skip = arr.skip?.[seat] ?? 0;
  });
  s.players.forEach((p, seat) => {
    if (!arr.hands?.[seat]) p.quest = questPool.splice(0, 3);
  });

  const rest = arr.rest ?? 'deck';
  if (rest === 'deck') {
    s.questDeck = [...questPool, ...deckTop];
  } else {
    s.questDeck = deckTop;
    for (const cardId of questPool) {
      if (rest === 'bases') {
        const baseId = baseIdOf(s.catalog.answers[cardId]!, s.catalog.questStars[cardId]!);
        s.bases[baseId].push({ cardId, playId: playId++ });
      } else {
        s.players[rest.hand]!.quest.push(cardId);
      }
    }
  }
  if (arr.specialRest === 'discard') {
    s.specialDeck = [];
    s.specialDiscard = specialPool;
  } else {
    s.specialDeck = specialPool;
    s.specialDiscard = [];
  }

  s.active = arr.active ?? 0;
  s.phase = arr.phase ?? 'ACT';
  s.pending = null;
  s.lastPlay = null;
  s.lastChallenge = null;
  s.known = {};
  s.nextPlayId = playId;

  const problems = checkInvariants(s);
  if (problems.length > 0) throw new Error(`장면이 불변 조건을 어김:\n${problems.join('\n')}`);
  return s;
}

/** 행동을 적용하고, 거절되거나 불변 조건이 깨지면 테스트를 실패시킵니다. */
export function act(state: GameState, action: Action): GameState {
  return actEvents(state, action).state;
}

export function actEvents(state: GameState, action: Action): { state: GameState; events: GameEvent[] } {
  const result = reduce(state, action);
  if (!result.ok) throw new Error(`거절됨 ${action.type}: ${result.error.code} (${result.error.message})`);
  const problems = checkInvariants(result.state);
  if (problems.length > 0) throw new Error(`불변 조건 위반 (${action.type}):\n${problems.join('\n')}`);
  return { state: result.state, events: result.events };
}

export function expectRejected(state: GameState, action: Action, code: RuleErrorCode): void {
  const result = reduce(state, action);
  expect(result.ok, `${action.type}이(가) 거절되어야 함`).toBe(false);
  if (!result.ok) expect(result.error.code).toBe(code);
}

/** 검증 창에서 남은 사람이 모두 통과 */
export function passAll(state: GameState): GameState {
  let s = state;
  while (s.phase === 'CHALLENGE' && s.pending?.kind === 'CHALLENGE') {
    const pending = s.pending;
    const seat = pending.eligible.find((i) => !pending.passed.includes(i));
    if (seat === undefined) break;
    s = act(s, { type: 'PASS', seat });
  }
  return s;
}

export function specialOf(state: GameState, seat: number, kind: SpecialKind): string {
  const found = state.players[seat]?.specials.find((sid) => state.catalog.specialKinds[sid] === kind);
  if (!found) throw new Error(`좌석 ${seat}에게 ${kind} 스페셜이 없음`);
  return found;
}

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) deepFreeze(inner);
  }
  return value;
}
