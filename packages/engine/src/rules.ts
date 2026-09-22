// reduce와 시뮬레이터가 함께 쓰는 규칙 판정 함수
import { BASE_IDS, SPECIAL_LIMIT } from './constants';
import type { GameState, PlayerState, SpecialKind } from './types';

/** 퀘스트 더미가 비었을 때 다시 섞어 넣을 수 있는 카드 수 (베이스 위 + 아이콘 더미) */
export function rebuildableQuestCount(s: GameState): number {
  let count = s.iconPile.length;
  for (const id of BASE_IDS) count += s.bases[id].length;
  return count;
}

export function canDrawQuest(s: GameState): boolean {
  return s.questDeck.length > 0 || rebuildableQuestCount(s) > 0;
}

export function canDrawSpecial(s: GameState, p: PlayerState): boolean {
  return p.specials.length < SPECIAL_LIMIT && (s.specialDeck.length > 0 || s.specialDiscard.length > 0);
}

/**
 * 아이콘으로 낼 수 있는 별 조합인지: 서로 다른 숫자이면서 하나씩 이어져야 합니다.
 * 1-2-3-4 가능, 1-1-2-2-3-3 불가. (장수 조건은 따로 확인)
 */
export function isConsecutiveRun(stars: readonly number[]): boolean {
  if (stars.length === 0 || new Set(stars).size !== stars.length) return false;
  return Math.max(...stars) - Math.min(...stars) === stars.length - 1;
}

export function specialsOfKind(s: GameState, p: PlayerState, kind: SpecialKind): string[] {
  return p.specials.filter((id) => s.catalog.specialKinds[id] === kind);
}
