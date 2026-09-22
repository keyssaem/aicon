import { questCards, specialKinds } from '@aicon/content/public';
import { questAnswers } from '@aicon/content/server';
import type { AiType, Catalog, SpecialKind, Stars } from './types';

/** 스페셜카드 한 장 한 장의 ID: sp-icon-1 … sp-recycle-3 */
export function specialCardId(kind: SpecialKind, n: number): string {
  return `sp-${kind.toLowerCase()}-${n}`;
}

function buildDefaultCatalog(): Catalog {
  const questStars: Record<string, Stars> = {};
  for (const card of questCards) questStars[card.id] = card.stars;

  const answers: Record<string, AiType> = {};
  for (const answer of questAnswers) answers[answer.id] = answer.type;

  const kinds: Record<string, SpecialKind> = {};
  for (const info of specialKinds) {
    for (let n = 1; n <= info.count; n += 1) kinds[specialCardId(info.kind, n)] = info.kind;
  }

  for (const id of Object.keys(questStars)) {
    if (!answers[id]) throw new Error(`정답이 없는 퀘스트카드: ${id}`);
  }
  return Object.freeze({
    questStars: Object.freeze(questStars),
    answers: Object.freeze(answers),
    specialKinds: Object.freeze(kinds),
  });
}

let cached: Catalog | null = null;

/** 기본 카드 구성: 퀘스트 50장 + 스페셜 14장 */
export function defaultCatalog(): Catalog {
  cached ??= buildDefaultCatalog();
  return cached;
}
