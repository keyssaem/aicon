import { BASE_IDS } from './constants';
import type { BaseId, GameState, PileEntry } from './types';

/**
 * reduce가 입력 상태를 건드리지 않도록 바뀔 수 있는 부분만 복사합니다.
 * catalog, Play, PileEntry, ChallengeOutcome, RoundSummary 객체는 만든 뒤 바꾸지 않으므로 공유합니다.
 */
export function cloneState(s: GameState): GameState {
  const bases = {} as Record<BaseId, PileEntry[]>;
  for (const id of BASE_IDS) bases[id] = [...s.bases[id]];

  return {
    ...s,
    options: { ...s.options },
    players: s.players.map((p) => ({ ...p, quest: [...p.quest], specials: [...p.specials] })),
    questDeck: [...s.questDeck],
    specialDeck: [...s.specialDeck],
    iconPile: [...s.iconPile],
    specialDiscard: [...s.specialDiscard],
    bases,
    pending:
      s.pending === null
        ? null
        : s.pending.kind === 'CHALLENGE'
          ? { ...s.pending, eligible: [...s.pending.eligible], passed: [...s.pending.passed] }
          : { ...s.pending },
    known: { ...s.known },
    history: [...s.history],
    winners: s.winners === null ? null : [...s.winners],
  };
}

export function emptyBases(): Record<BaseId, PileEntry[]> {
  const bases = {} as Record<BaseId, PileEntry[]>;
  for (const id of BASE_IDS) bases[id] = [];
  return bases;
}
