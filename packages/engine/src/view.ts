import { BASE_IDS } from './constants';
import type { AiType, BaseId, GameEvent, GameState, PileEntry, PlayerView, SeatIndex, SpecialCardView, SpecialKind } from './types';

/**
 * 좌석 시점으로 상태를 거릅니다.
 * 빠지는 것: 정답표(catalog), 난수 상태와 시드, 더미 순서, 남의 손패와 스페셜.
 */
export function viewFor(s: GameState, viewer: SeatIndex | 'spectator'): PlayerView {
  if (viewer !== 'spectator' && !s.players[viewer]) throw new Error(`없는 좌석: ${viewer}`);
  const mine = viewer === 'spectator' ? null : (s.players[viewer] ?? null);
  const kindOf = (id: string): SpecialCardView => ({ id, kind: s.catalog.specialKinds[id] as SpecialKind });

  const bases = {} as Record<BaseId, PileEntry[]>;
  const visible = new Set<string>(s.iconPile);
  for (const id of BASE_IDS) {
    bases[id] = s.bases[id].map((entry) => ({ ...entry }));
    for (const entry of s.bases[id]) visible.add(entry.cardId);
  }
  if (mine) for (const id of mine.quest) visible.add(id);

  const known: Record<string, AiType> = {};
  for (const [id, type] of Object.entries(s.known)) if (visible.has(id)) known[id] = type;

  return {
    viewer,
    seq: s.seq,
    round: s.round,
    options: { ...s.options },
    phase: s.phase,
    active: s.active,
    firstSeat: s.firstSeat,
    players: s.players.map((p, seat) => ({
      seat,
      name: p.name,
      tokens: p.tokens,
      skip: p.skip,
      questCount: p.quest.length,
      specialCount: p.specials.length,
    })),
    me:
      mine && viewer !== 'spectator'
        ? { seat: viewer, quest: [...mine.quest], specials: mine.specials.map(kindOf) }
        : null,
    bases,
    questDeckCount: s.questDeck.length,
    specialDeckCount: s.specialDeck.length,
    iconPile: [...s.iconPile],
    specialDiscard: s.specialDiscard.map(kindOf),
    pending:
      s.pending === null
        ? null
        : s.pending.kind === 'CHALLENGE'
          ? { ...s.pending, eligible: [...s.pending.eligible], passed: [...s.pending.passed] }
          : { ...s.pending },
    lastPlay: s.lastPlay,
    lastChallenge: s.lastChallenge,
    known,
    history: [...s.history],
    winners: s.winners === null ? null : [...s.winners],
  };
}

/** 다른 좌석의 카드 ID(secret)를 지운 이벤트 목록 */
export function eventsFor(events: readonly GameEvent[], viewer: SeatIndex | 'spectator'): GameEvent[] {
  return events.map((event) => {
    if (!('secret' in event) || event.secret === undefined || event.secret.seat === viewer) return event;
    const { secret: _hidden, ...rest } = event;
    return rest as GameEvent;
  });
}
