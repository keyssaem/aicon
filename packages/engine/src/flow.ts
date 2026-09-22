// 라운드 준비 → 차례 시작 → 차례 정리 → 라운드 정산 → 게임 결과로 이어지는 자동 진행 단계
import { BASE_IDS, FINISH_TOKENS, QUEST_DEAL, RANK_TOKENS, SPECIAL_DEAL } from './constants';
import { emptyBases } from './clone';
import { rngOf, shuffleInPlace } from './rng';
import { canDrawQuest, canDrawSpecial } from './rules';
import type { GameEvent, GameState, RoundSummary, SeatIndex } from './types';

/** reduce 한 번이 다루는 작업 공간: 복사된 상태와 이번 행동에서 생긴 이벤트 */
export interface Ctx {
  s: GameState;
  events: GameEvent[];
}

export function startRound(ctx: Ctx, round: number, firstSeat: SeatIndex): void {
  const { s, events } = ctx;
  const rng = rngOf(s);
  s.round = round;
  s.firstSeat = firstSeat;
  s.questDeck = shuffleInPlace(Object.keys(s.catalog.questStars).sort(), rng);
  s.specialDeck = shuffleInPlace(Object.keys(s.catalog.specialKinds).sort(), rng);
  s.iconPile = [];
  s.specialDiscard = [];
  s.bases = emptyBases();
  s.known = {};
  s.pending = null;
  s.lastPlay = null;
  s.lastChallenge = null;
  events.push({ type: 'ROUND_STARTED', round, firstSeat });

  s.players.forEach((p, seat) => {
    p.quest = s.questDeck.splice(-QUEST_DEAL);
    p.specials = s.specialDeck.splice(-SPECIAL_DEAL);
    // 라운드가 바뀌면 '한 턴 쉬기'는 넘어가지 않습니다.
    p.skip = 0;
    events.push({
      type: 'CARDS_DEALT',
      seat,
      quest: p.quest.length,
      special: p.specials.length,
      secret: { seat, cardIds: [...p.quest, ...p.specials] },
    });
  });

  startTurn(ctx, firstSeat);
}

export function startTurn(ctx: Ctx, seat: SeatIndex): void {
  const { s, events } = ctx;
  const p = s.players[seat];
  if (!p) throw new Error(`없는 좌석: ${seat}`);
  s.active = seat;
  s.phase = 'DRAW';
  events.push({ type: 'TURN_STARTED', seat });
  if (!canDrawQuest(s) && !canDrawSpecial(s, p)) {
    events.push({ type: 'DRAW_SKIPPED', seat });
    s.phase = 'ACT';
  }
}

/** 차례 정리: 손패가 비었으면 라운드 정산, 아니면 쉬는 사람을 건너뛰고 다음 사람 */
export function endTurn(ctx: Ctx): void {
  const { s, events } = ctx;
  s.pending = null;
  const current = s.active;
  if (s.players[current]?.quest.length === 0) {
    endRound(ctx, current);
    return;
  }

  const n = s.players.length;
  let next = (current + 1) % n;
  // 쉬기를 건너뛸 때마다 누군가의 skip이 1씩 줄어들므로 반드시 끝납니다.
  for (let p = s.players[next]; p && p.skip > 0; p = s.players[next]) {
    p.skip -= 1;
    events.push({ type: 'TURN_SKIPPED', seat: next, remaining: p.skip });
    next = (next + 1) % n;
  }
  startTurn(ctx, next);
}

function endRound(ctx: Ctx, finisher: SeatIndex): void {
  const { s, events } = ctx;
  const gained: number[] = s.players.map((_, seat) => (seat === finisher ? FINISH_TOKENS : 0));

  // 나머지는 퀘스트카드가 적은 순서. 장수가 같으면 같은 토큰, 다음 사람은 바로 다음 토큰 (2·2·1)
  const others = s.players.map((_, seat) => seat).filter((seat) => seat !== finisher);
  const counts = [...new Set(others.map((seat) => s.players[seat]?.quest.length ?? 0))].sort((a, b) => a - b);
  for (const seat of others) {
    const rank = counts.indexOf(s.players[seat]?.quest.length ?? 0);
    gained[seat] = RANK_TOKENS[rank] ?? 0;
  }

  const summary: RoundSummary = {
    round: s.round,
    finisher,
    entries: s.players.map((p, seat) => ({ seat, questLeft: p.quest.length, tokens: gained[seat] ?? 0 })),
  };
  s.history.push(summary);
  s.pending = null;
  events.push({ type: 'ROUND_ENDED', summary });

  s.players.forEach((p, seat) => {
    const amount = gained[seat] ?? 0;
    if (amount === 0) return;
    p.tokens += amount;
    events.push({ type: 'TOKENS_AWARDED', seat, amount, reason: seat === finisher ? 'FINISH' : 'RANK' });
  });

  if (s.round >= s.options.rounds) {
    finishGame(ctx);
  } else {
    s.phase = 'ROUND_END';
  }
}

function finishGame(ctx: Ctx): void {
  const { s, events } = ctx;
  const tokens = s.players.map((p) => p.tokens);
  const best = Math.max(...tokens);
  // 최다 토큰이 여러 명이면 모두 공동 우승
  s.winners = tokens.flatMap((t, seat) => (t === best ? [seat] : []));
  s.phase = 'GAME_END';
  events.push({ type: 'GAME_ENDED', winners: [...s.winners], tokens });
}

/** 퀘스트 더미 맨 위 1장. 비었으면 베이스 위 카드와 아이콘 더미를 섞어 다시 만듭니다. */
export function takeQuestCard(ctx: Ctx): string | null {
  const { s, events } = ctx;
  if (s.questDeck.length === 0) {
    const cards: string[] = [];
    for (const id of BASE_IDS) {
      for (const entry of s.bases[id]) cards.push(entry.cardId);
      s.bases[id] = [];
    }
    cards.push(...s.iconPile);
    s.iconPile = [];
    if (cards.length === 0) return null;
    s.questDeck = shuffleInPlace(cards, rngOf(s));
    events.push({ type: 'DECK_REBUILT', deck: 'QUEST', count: cards.length });
  }
  return s.questDeck.pop() ?? null;
}

/** 스페셜 더미 맨 위 1장. 비었으면 버린 스페셜을 섞어 다시 만듭니다. */
export function takeSpecialCard(ctx: Ctx): string | null {
  const { s, events } = ctx;
  if (s.specialDeck.length === 0) {
    if (s.specialDiscard.length === 0) return null;
    s.specialDeck = shuffleInPlace(s.specialDiscard, rngOf(s));
    s.specialDiscard = [];
    events.push({ type: 'DECK_REBUILT', deck: 'SPECIAL', count: s.specialDeck.length });
  }
  return s.specialDeck.pop() ?? null;
}
