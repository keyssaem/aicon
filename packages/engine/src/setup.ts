import { defaultCatalog } from './catalog';
import { emptyBases } from './clone';
import { DEFAULT_OPTIONS, MAX_PLAYERS, MIN_PLAYERS } from './constants';
import { type Ctx, startRound } from './flow';
import { rngOf } from './rng';
import type { GameConfig, GameEvent, GameOptions, GameState } from './types';

/** 새 게임을 만들고 1라운드 배분까지 마친 상태를 돌려줍니다. 설정 오류는 예외로 알립니다. */
export function createGame(config: GameConfig): { state: GameState; events: GameEvent[] } {
  const names = config.players.map((name) => name.trim());
  if (names.length < MIN_PLAYERS || names.length > MAX_PLAYERS) {
    throw new Error(`플레이어는 ${MIN_PLAYERS}~${MAX_PLAYERS}명이어야 합니다.`);
  }
  if (names.some((name) => name.length === 0)) throw new Error('닉네임이 비어 있습니다.');

  const options: GameOptions = { ...DEFAULT_OPTIONS, ...config.options };
  if (!Number.isInteger(options.rounds) || options.rounds < 1) {
    throw new Error('라운드 수는 1 이상의 정수여야 합니다.');
  }

  const seed = config.seed >>> 0;
  const state: GameState = {
    schema: 1,
    seq: 0,
    seed,
    rng: seed,
    options,
    catalog: config.catalog ?? defaultCatalog(),
    round: 0,
    firstSeat: 0,
    active: 0,
    phase: 'DRAW',
    players: names.map((name) => ({ name, quest: [], specials: [], tokens: 0, skip: 0 })),
    questDeck: [],
    specialDeck: [],
    iconPile: [],
    specialDiscard: [],
    bases: emptyBases(),
    nextPlayId: 1,
    pending: null,
    lastPlay: null,
    lastChallenge: null,
    known: {},
    history: [],
    winners: null,
  };

  const firstSeat = config.firstSeat ?? rngOf(state).int(names.length);
  if (!Number.isInteger(firstSeat) || firstSeat < 0 || firstSeat >= names.length) {
    throw new Error('첫 차례 좌석 번호가 올바르지 않습니다.');
  }

  const ctx: Ctx = { s: state, events: [] };
  startRound(ctx, 1, firstSeat);
  return { state, events: ctx.events };
}
