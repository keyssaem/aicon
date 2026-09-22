// 학생 기기에 보내도 되는 카드 정보만 둡니다.
// 퀘스트카드의 YES/NO 정답과 해설은 server.ts에만 있습니다. 이 파일에서 server.ts를 import하지 마세요.
import rawQuestCards from './cards.public.json';

export type Stars = 1 | 2 | 3 | 4 | 5;
export type AiType = 'YES' | 'NO';
export type BaseId = `${AiType}${Stars}`;
export type SpecialKind = 'ICON' | 'ATTACK' | 'DEFENSE' | 'RECYCLE';

export interface QuestCardInfo {
  /** 순서 없는 고정 ID. 정답을 짐작할 수 없게 무작위로 정했습니다. */
  id: string;
  name: string;
  stars: Stars;
  /** 카드에 인쇄된 설명 문장 */
  lines: string[];
  /** assets/cards 안의 파일명 */
  image: string;
}

export interface SpecialKindInfo {
  kind: SpecialKind;
  name: string;
  text: string;
  count: number;
  image: string;
}

export interface BaseCardInfo {
  id: BaseId;
  type: AiType;
  stars: Stars;
  image: string;
}

export const questCards: readonly QuestCardInfo[] = rawQuestCards as QuestCardInfo[];

/** 스페셜카드 14장: 아이콘 5 · 공격 3 · 방어 3 · 재활용 3 */
export const specialKinds: readonly SpecialKindInfo[] = [
  { kind: 'ICON', name: '아이콘', text: '연속된 숫자가 3개 이상 있다면 한번에 낼 수 있어요.', count: 5, image: 'special-icon.webp' },
  { kind: 'ATTACK', name: '공격', text: '플레이어 한 명을 지목하면 해당 플레이어는 카드 3장을 추가로 가져가요.', count: 3, image: 'special-attack.webp' },
  { kind: 'DEFENSE', name: '방어', text: '공격 카드를 방어할 수 있어요.', count: 3, image: 'special-defense.webp' },
  { kind: 'RECYCLE', name: '재활용', text: '테이블에 깔려 있는 카드 중 한 장을 가져와서 재사용할 수 있어요.', count: 3, image: 'special-recycle.webp' },
];

const STARS: readonly Stars[] = [1, 2, 3, 4, 5];

export const baseCards: readonly BaseCardInfo[] = (['YES', 'NO'] as const).flatMap((type) =>
  STARS.map((stars) => ({
    id: `${type}${stars}` as BaseId,
    type,
    stars,
    image: `base-${type.toLowerCase()}-${stars}.webp`,
  })),
);

export const backImages = {
  quest: 'back-quest.webp',
  special: 'back-special.webp',
  yes: 'back-yes.webp',
  no: 'back-no.webp',
} as const;

export const tokenImage = 'token.webp';
