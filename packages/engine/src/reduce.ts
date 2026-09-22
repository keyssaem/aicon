import { ATTACK_DRAW, CHALLENGE_REWARD, ICON_MIN, SPECIAL_LIMIT, baseOf, isBaseId } from './constants';
import { cloneState } from './clone';
import { RuleViolation, fail } from './errors';
import { type Ctx, endTurn, startRound, takeQuestCard, takeSpecialCard } from './flow';
import { isConsecutiveRun } from './rules';
import type {
  Action,
  ChallengeOutcome,
  GameState,
  Pending,
  Play,
  PlayItem,
  PlayerState,
  ReduceResult,
  SeatIndex,
  SpecialKind,
  Stars,
} from './types';

type ActionOf<T extends Action['type']> = Extract<Action, { type: T }>;

/**
 * 규칙 엔진의 유일한 입구. 입력 상태는 바꾸지 않고 새 상태와 이벤트를 돌려줍니다.
 * 규칙에 어긋나면 상태를 그대로 두고 { ok: false, error }를 돌려줍니다.
 */
export function reduce(state: GameState, action: Action): ReduceResult {
  const ctx: Ctx = { s: cloneState(state), events: [] };
  try {
    apply(ctx, action);
  } catch (error) {
    if (error instanceof RuleViolation) return { ok: false, error: error.error };
    throw error;
  }
  ctx.s.seq += 1;
  return { ok: true, state: ctx.s, events: ctx.events };
}

function apply(ctx: Ctx, action: Action): void {
  if (typeof action !== 'object' || action === null) fail('BAD_ACTION');
  if (ctx.s.phase === 'GAME_END') fail('GAME_OVER');
  switch (action.type) {
    case 'DRAW':
      return draw(ctx, action);
    case 'PLAY_QUEST':
      return playQuest(ctx, action);
    case 'USE_ICON':
      return useIcon(ctx, action);
    case 'USE_ATTACK':
      return useAttack(ctx, action);
    case 'USE_RECYCLE':
      return useRecycle(ctx, action);
    case 'CHALLENGE':
      return challenge(ctx, action);
    case 'PASS':
      return pass(ctx, action);
    case 'DEFEND':
      return defend(ctx, action);
    case 'ACCEPT_ATTACK':
      return acceptAttack(ctx, action);
    case 'TIMEOUT':
      return timeout(ctx);
    case 'NEXT_ROUND':
      return nextRound(ctx);
    default:
      fail('BAD_ACTION');
  }
}

// ── 먹기 ────────────────────────────────────────────────────────────

function draw(ctx: Ctx, a: ActionOf<'DRAW'>): void {
  const { s, events } = ctx;
  expectPhase(s, 'DRAW');
  const [seat, p] = activePlayer(s, a.seat);
  if (a.source === 'SPECIAL') {
    if (p.specials.length >= SPECIAL_LIMIT) fail('SPECIAL_LIMIT');
    const cardId = takeSpecialCard(ctx);
    if (cardId === null) fail('SPECIAL_DECK_EMPTY');
    p.specials.push(cardId);
    events.push({ type: 'CARD_DRAWN', seat, source: 'SPECIAL', secret: { seat, cardIds: [cardId] } });
  } else if (a.source === 'QUEST') {
    const cardId = takeQuestCard(ctx);
    if (cardId === null) fail('QUEST_DECK_EMPTY');
    p.quest.push(cardId);
    events.push({ type: 'CARD_DRAWN', seat, source: 'QUEST', secret: { seat, cardIds: [cardId] } });
  } else {
    fail('BAD_ACTION');
  }
  s.phase = 'ACT';
}

// ── 내기: 퀘스트 ────────────────────────────────────────────────────

function playQuest(ctx: Ctx, a: ActionOf<'PLAY_QUEST'>): void {
  const { s, events } = ctx;
  expectPhase(s, 'ACT');
  const [seat, p] = activePlayer(s, a.seat);
  const cardIds = questCardsFromHand(p, a.cardIds);
  const base = a.base;
  if (!isBaseId(base)) fail('INVALID_BASE');
  // 별 개수만 막습니다. YES/NO가 맞는지는 막지 않아야 검증이 성립합니다.
  const { stars } = baseOf(base);
  for (const id of cardIds) if (starsOf(s, id) !== stars) fail('STARS_MISMATCH');

  removeFromHand(p, cardIds);
  const play = placePlay(s, seat, 'QUEST', cardIds.map((cardId) => ({ cardId, base })));
  events.push({ type: 'QUEST_PLAYED', play });
  openChallenge(ctx, play);
}

// ── 내기: 스페셜 ────────────────────────────────────────────────────

function useIcon(ctx: Ctx, a: ActionOf<'USE_ICON'>): void {
  const { s, events } = ctx;
  expectPhase(s, 'ACT');
  const [seat, p] = activePlayer(s, a.seat);
  const specialId = specialFromHand(s, p, a.specialId, 'ICON');
  const cardIds = questCardsFromHand(p, a.cardIds);
  if (cardIds.length < ICON_MIN) fail('ICON_TOO_FEW');
  const stars = cardIds.map((id) => starsOf(s, id));
  if (!isConsecutiveRun(stars)) fail('ICON_NOT_CONSECUTIVE');

  let items: PlayItem[] | null = null;
  if (s.options.expertIcon) {
    const bases: unknown = a.bases;
    if (!Array.isArray(bases) || bases.length !== cardIds.length) fail('ICON_BASES_REQUIRED');
    items = cardIds.map((cardId, i) => {
      const base: unknown = bases[i];
      if (!isBaseId(base)) fail('INVALID_BASE');
      if (baseOf(base).stars !== stars[i]) fail('STARS_MISMATCH');
      return { cardId, base };
    });
  }

  discardSpecial(s, p, specialId);
  removeFromHand(p, cardIds);
  if (items) {
    const play = placePlay(s, seat, 'ICON', items);
    events.push({ type: 'ICON_PLAYED', seat, specialId, cardIds: [...cardIds], play });
    openChallenge(ctx, play);
  } else {
    s.iconPile.push(...cardIds);
    events.push({ type: 'ICON_PLAYED', seat, specialId, cardIds: [...cardIds], play: null });
    endTurn(ctx);
  }
}

function useAttack(ctx: Ctx, a: ActionOf<'USE_ATTACK'>): void {
  const { s, events } = ctx;
  expectPhase(s, 'ACT');
  const [seat, p] = activePlayer(s, a.seat);
  const specialId = specialFromHand(s, p, a.specialId, 'ATTACK');
  const target: unknown = a.target;
  if (
    typeof target !== 'number' ||
    !Number.isInteger(target) ||
    target < 0 ||
    target >= s.players.length ||
    target === seat
  ) {
    fail('INVALID_TARGET');
  }

  discardSpecial(s, p, specialId);
  // 방어 카드가 없어도 방어 창을 엽니다. 바로 넘기면 '방어 카드 없음'이 드러나기 때문입니다.
  s.pending = { kind: 'DEFENSE', attacker: seat, target };
  s.phase = 'DEFENSE';
  events.push({ type: 'ATTACK_DECLARED', seat, target, specialId });
}

function useRecycle(ctx: Ctx, a: ActionOf<'USE_RECYCLE'>): void {
  const { s, events } = ctx;
  expectPhase(s, 'ACT');
  const [seat, p] = activePlayer(s, a.seat);
  const specialId = specialFromHand(s, p, a.specialId, 'RECYCLE');
  const base = a.base;
  if (!isBaseId(base)) fail('INVALID_BASE');
  // 베이스 더미의 맨 위 카드만 가져올 수 있습니다.
  const top = s.bases[base].pop();
  if (!top) fail('PILE_EMPTY');

  p.quest.push(top.cardId);
  discardSpecial(s, p, specialId);
  events.push({ type: 'CARD_RECYCLED', seat, specialId, base, cardId: top.cardId });
  endTurn(ctx);
}

// ── 공격받은 사람 ───────────────────────────────────────────────────

function defend(ctx: Ctx, a: ActionOf<'DEFEND'>): void {
  const { s, events } = ctx;
  const pending = defensePending(s);
  const seat = seatOf(s, a.seat);
  if (seat !== pending.target) fail('NOT_TARGET');
  const p = playerAt(s, seat);
  const specialId = specialFromHand(s, p, a.specialId, 'DEFENSE');
  discardSpecial(s, p, specialId);
  events.push({ type: 'ATTACK_DEFENDED', seat, specialId });
  endTurn(ctx);
}

function acceptAttack(ctx: Ctx, a: ActionOf<'ACCEPT_ATTACK'>): void {
  const pending = defensePending(ctx.s);
  if (seatOf(ctx.s, a.seat) !== pending.target) fail('NOT_TARGET');
  resolveAttack(ctx, pending.target);
}

function resolveAttack(ctx: Ctx, target: SeatIndex): void {
  const { s, events } = ctx;
  const p = playerAt(s, target);
  const drawn: string[] = [];
  while (drawn.length < ATTACK_DRAW) {
    const cardId = takeQuestCard(ctx);
    if (cardId === null) break;
    drawn.push(cardId);
  }
  p.quest.push(...drawn);
  events.push({ type: 'ATTACK_ACCEPTED', seat: target, drawn: drawn.length, secret: { seat: target, cardIds: drawn } });
  endTurn(ctx);
}

// ── 검증 ────────────────────────────────────────────────────────────

function openChallenge(ctx: Ctx, play: Play): void {
  const { s, events } = ctx;
  // 쉬는 중인 사람을 포함해 카드를 낸 사람을 뺀 모두가 검증할 수 있습니다.
  const eligible = s.players.map((_, seat) => seat).filter((seat) => seat !== play.seat);
  s.pending = { kind: 'CHALLENGE', play, eligible, passed: [] };
  s.phase = 'CHALLENGE';
  events.push({ type: 'CHALLENGE_OPENED', playId: play.id, eligible: [...eligible] });
}

function challenge(ctx: Ctx, a: ActionOf<'CHALLENGE'>): void {
  const { s, events } = ctx;
  const pending = challengePending(s);
  const seat = seatOf(s, a.seat);
  if (!pending.eligible.includes(seat)) fail('NOT_ELIGIBLE');
  if (pending.passed.includes(seat)) fail('ALREADY_PASSED');

  const { play } = pending;
  const reveals = play.items.map((item) => {
    const actual = s.catalog.answers[item.cardId];
    if (!actual) fail('BAD_ACTION');
    return { cardId: item.cardId, declared: baseOf(item.base).type, actual };
  });
  const success = reveals.some((r) => r.declared !== r.actual);
  const outcome: ChallengeOutcome = { playId: play.id, challenger: seat, offender: play.seat, success, reveals };
  for (const r of reveals) s.known[r.cardId] = r.actual;
  s.lastChallenge = outcome;

  const returnedCardIds: string[] = [];
  if (success) {
    // 한 장이라도 틀렸으면 그 묶음 전체를 낸 사람 손으로 돌려보냅니다.
    for (const item of play.items) {
      s.bases[item.base] = s.bases[item.base].filter((entry) => entry.cardId !== item.cardId);
      returnedCardIds.push(item.cardId);
    }
    playerAt(s, play.seat).quest.push(...returnedCardIds);
  }
  events.push({ type: 'CHALLENGE_RESOLVED', outcome, returnedCardIds });

  const challenger = playerAt(s, seat);
  if (success) {
    challenger.tokens += CHALLENGE_REWARD;
    events.push({ type: 'TOKENS_AWARDED', seat, amount: CHALLENGE_REWARD, reason: 'CHALLENGE' });
  } else {
    challenger.skip += 1;
    events.push({ type: 'SKIP_ADDED', seat, skip: challenger.skip });
  }
  endTurn(ctx);
}

function pass(ctx: Ctx, a: ActionOf<'PASS'>): void {
  const { s, events } = ctx;
  const pending = challengePending(s);
  const seat = seatOf(s, a.seat);
  if (!pending.eligible.includes(seat)) fail('NOT_ELIGIBLE');
  if (pending.passed.includes(seat)) fail('ALREADY_PASSED');
  pending.passed.push(seat);
  events.push({ type: 'CHALLENGE_PASSED', seat });
  if (pending.passed.length === pending.eligible.length) closeChallenge(ctx, 'ALL_PASSED');
}

function closeChallenge(ctx: Ctx, reason: 'ALL_PASSED' | 'TIMEOUT'): void {
  const pending = challengePending(ctx.s);
  ctx.events.push({ type: 'CHALLENGE_CLOSED', playId: pending.play.id, reason });
  endTurn(ctx);
}

// ── 시스템 ──────────────────────────────────────────────────────────

function timeout(ctx: Ctx): void {
  const { s } = ctx;
  if (s.phase === 'CHALLENGE') return closeChallenge(ctx, 'TIMEOUT');
  if (s.phase === 'DEFENSE') return resolveAttack(ctx, defensePending(s).target);
  if (s.phase === 'DRAW' || s.phase === 'ACT') return timeoutTurn(ctx);
  fail('NOTHING_TO_TIMEOUT');
}

/**
 * 차례 제한시간이 끝났거나 접속이 끊긴 사람의 차례를 넘깁니다.
 * 규칙상 '패스'는 없지만, 멈춘 게임을 이어가기 위한 시스템 처리입니다. 카드는 먹기만 하고 내지 않습니다.
 */
function timeoutTurn(ctx: Ctx): void {
  const { s, events } = ctx;
  const seat = s.active;
  if (s.phase === 'DRAW') {
    const cardId = takeQuestCard(ctx);
    if (cardId !== null) {
      playerAt(s, seat).quest.push(cardId);
      events.push({ type: 'CARD_DRAWN', seat, source: 'QUEST', secret: { seat, cardIds: [cardId] } });
    }
  }
  events.push({ type: 'TURN_TIMED_OUT', seat });
  endTurn(ctx);
}

function nextRound(ctx: Ctx): void {
  const { s } = ctx;
  expectPhase(s, 'ROUND_END');
  // 2라운드부터는 앞 라운드 첫 차례의 다음 사람이 먼저 합니다.
  startRound(ctx, s.round + 1, (s.firstSeat + 1) % s.players.length);
}

// ── 공통 확인 ───────────────────────────────────────────────────────

function expectPhase(s: GameState, phase: GameState['phase']): void {
  if (s.phase !== phase) fail('WRONG_PHASE');
}

function seatOf(s: GameState, seat: unknown): SeatIndex {
  if (typeof seat !== 'number' || !Number.isInteger(seat) || seat < 0 || seat >= s.players.length) {
    fail('BAD_ACTION');
  }
  return seat;
}

function playerAt(s: GameState, seat: SeatIndex): PlayerState {
  const p = s.players[seat];
  if (!p) fail('BAD_ACTION');
  return p;
}

function activePlayer(s: GameState, seat: unknown): [SeatIndex, PlayerState] {
  const index = seatOf(s, seat);
  if (index !== s.active) fail('NOT_YOUR_TURN');
  return [index, playerAt(s, index)];
}

function questCardsFromHand(p: PlayerState, cardIds: unknown): string[] {
  if (!Array.isArray(cardIds) || cardIds.some((id) => typeof id !== 'string')) fail('BAD_ACTION');
  if (cardIds.length === 0) fail('NO_CARDS_SELECTED');
  if (new Set(cardIds).size !== cardIds.length) fail('DUPLICATE_CARD');
  for (const id of cardIds) if (!p.quest.includes(id as string)) fail('CARD_NOT_IN_HAND');
  return cardIds as string[];
}

function starsOf(s: GameState, cardId: string): Stars {
  const stars = s.catalog.questStars[cardId];
  if (stars === undefined) fail('BAD_ACTION');
  return stars;
}

function specialFromHand(s: GameState, p: PlayerState, specialId: unknown, kind: SpecialKind): string {
  if (typeof specialId !== 'string' || !p.specials.includes(specialId)) fail('SPECIAL_NOT_IN_HAND');
  if (s.catalog.specialKinds[specialId] !== kind) fail('WRONG_SPECIAL_KIND');
  return specialId;
}

function discardSpecial(s: GameState, p: PlayerState, specialId: string): void {
  p.specials = p.specials.filter((id) => id !== specialId);
  s.specialDiscard.push(specialId);
}

function removeFromHand(p: PlayerState, cardIds: readonly string[]): void {
  const remove = new Set(cardIds);
  p.quest = p.quest.filter((id) => !remove.has(id));
}

function placePlay(s: GameState, seat: SeatIndex, via: Play['via'], items: PlayItem[]): Play {
  const play: Play = { id: s.nextPlayId, seat, via, items };
  s.nextPlayId += 1;
  for (const item of items) s.bases[item.base].push({ cardId: item.cardId, playId: play.id });
  s.lastPlay = play;
  return play;
}

function challengePending(s: GameState): Extract<Pending, { kind: 'CHALLENGE' }> {
  const pending = s.pending;
  if (s.phase !== 'CHALLENGE' || pending?.kind !== 'CHALLENGE') fail('WRONG_PHASE');
  return pending;
}

function defensePending(s: GameState): Extract<Pending, { kind: 'DEFENSE' }> {
  const pending = s.pending;
  if (s.phase !== 'DEFENSE' || pending?.kind !== 'DEFENSE') fail('WRONG_PHASE');
  return pending;
}
