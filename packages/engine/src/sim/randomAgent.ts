// 테스트와 핫시트 '자동 진행'용 무작위 플레이어. 전체 상태(정답 포함)를 보고 대체로 규칙에 맞는 행동을 고릅니다.
import { BASE_IDS, baseIdOf } from '../constants';
import { canDrawQuest, canDrawSpecial, specialsOfKind } from '../rules';
import type { Action, AiType, BaseId, GameState, Stars } from '../types';

export interface AgentStyle {
  /** 카드를 낼 때 정답대로 낼 확률 */
  accuracy: number;
  /** 검증 창에서 검증을 누를 확률 */
  challengeRate: number;
  /** 먹기에서 스페셜을 고를 확률 (가능할 때) */
  specialDrawRate: number;
}

export const DEFAULT_STYLE: AgentStyle = { accuracy: 0.8, challengeRate: 0.25, specialDrawRate: 0.35 };

const flip = (type: AiType): AiType => (type === 'YES' ? 'NO' : 'YES');

export function randomAction(s: GameState, rand: () => number, style: AgentStyle = DEFAULT_STYLE): Action | null {
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)] as T;

  switch (s.phase) {
    case 'GAME_END':
      return null;
    case 'ROUND_END':
      return { type: 'NEXT_ROUND' };
    case 'CHALLENGE': {
      const pending = s.pending;
      if (pending?.kind !== 'CHALLENGE') return null;
      if (rand() < 0.03) return { type: 'TIMEOUT' };
      const open = pending.eligible.filter((seat) => !pending.passed.includes(seat));
      const seat = pick(open);
      return rand() < style.challengeRate ? { type: 'CHALLENGE', seat } : { type: 'PASS', seat };
    }
    case 'DEFENSE': {
      const pending = s.pending;
      if (pending?.kind !== 'DEFENSE') return null;
      const target = s.players[pending.target];
      if (!target) return null;
      if (rand() < 0.03) return { type: 'TIMEOUT' };
      const defense = specialsOfKind(s, target, 'DEFENSE')[0];
      if (defense && rand() < 0.7) return { type: 'DEFEND', seat: pending.target, specialId: defense };
      return { type: 'ACCEPT_ATTACK', seat: pending.target };
    }
    case 'DRAW': {
      const seat = s.active;
      const p = s.players[seat];
      if (!p) return null;
      const quest = canDrawQuest(s);
      const special = canDrawSpecial(s, p);
      if (special && (!quest || rand() < style.specialDrawRate)) return { type: 'DRAW', seat, source: 'SPECIAL' };
      return { type: 'DRAW', seat, source: 'QUEST' };
    }
    case 'ACT':
      return randomTurnAction(s, rand, style, pick);
  }
}

function randomTurnAction(
  s: GameState,
  rand: () => number,
  style: AgentStyle,
  pick: <T>(items: readonly T[]) => T,
): Action | null {
  const seat = s.active;
  const p = s.players[seat];
  if (!p || p.quest.length === 0) return null;
  const starsOf = (id: string) => s.catalog.questStars[id] as Stars;
  const declare = (id: string): BaseId => {
    const truth = s.catalog.answers[id] as AiType;
    return baseIdOf(rand() < style.accuracy ? truth : flip(truth), starsOf(id));
  };

  const icon = specialsOfKind(s, p, 'ICON')[0];
  if (icon && rand() < 0.6) {
    const byStars = new Map<number, string[]>();
    for (const id of p.quest) byStars.set(starsOf(id), [...(byStars.get(starsOf(id)) ?? []), id]);
    const runs: [number, number][] = [];
    for (let low = 1; low <= 3; low += 1) {
      for (let high = low + 2; high <= 5; high += 1) {
        let complete = true;
        for (let k = low; k <= high; k += 1) if (!byStars.has(k)) complete = false;
        if (complete) runs.push([low, high]);
      }
    }
    if (runs.length > 0) {
      const [low, high] = pick(runs);
      const cardIds: string[] = [];
      for (let k = low; k <= high; k += 1) cardIds.push(pick(byStars.get(k) ?? []));
      const bases = s.options.expertIcon ? cardIds.map(declare) : undefined;
      return { type: 'USE_ICON', seat, specialId: icon, cardIds, ...(bases ? { bases } : {}) };
    }
  }

  const attack = specialsOfKind(s, p, 'ATTACK')[0];
  if (attack && rand() < 0.3) {
    const others = s.players.map((_, i) => i).filter((i) => i !== seat);
    return { type: 'USE_ATTACK', seat, specialId: attack, target: pick(others) };
  }

  const recycle = specialsOfKind(s, p, 'RECYCLE')[0];
  const piles = BASE_IDS.filter((base) => s.bases[base].length > 0);
  if (recycle && piles.length > 0 && rand() < 0.2) {
    return { type: 'USE_RECYCLE', seat, specialId: recycle, base: pick(piles) };
  }

  // 같은 별 카드를 0~전부 섞어서, 기준 카드의 정답(또는 틀린 답)으로 한꺼번에 냅니다.
  const anchor = pick(p.quest);
  const sameStars = p.quest.filter((id) => id !== anchor && starsOf(id) === starsOf(anchor));
  const extraCount = Math.floor(rand() * (sameStars.length + 1));
  const extras: string[] = [];
  const pool = [...sameStars];
  while (extras.length < extraCount) {
    const index = Math.floor(rand() * pool.length);
    extras.push(...pool.splice(index, 1));
  }
  return { type: 'PLAY_QUEST', seat, cardIds: [anchor, ...extras], base: declare(anchor) };
}
