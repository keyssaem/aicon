import { backImages, baseCards, questCards, specialKinds, tokenImage } from '@aicon/content/public';
import type { BaseId, SpecialKind } from '@aicon/protocol';

const questById = new Map(questCards.map((card) => [card.id, card]));
const baseById = new Map(baseCards.map((base) => [base.id, base]));
const kindById = new Map(specialKinds.map((info) => [info.kind, info]));

export const imageUrl = (file: string) => `/cards/${file}`;
export const questCard = (id: string) => questById.get(id);
export const questName = (id: string) => questById.get(id)?.name ?? id;
export const questStars = (id: string) => questById.get(id)?.stars ?? 0;
export const questImage = (id: string) => imageUrl(questById.get(id)?.image ?? backImages.quest);
export const baseImage = (id: BaseId) => imageUrl(baseById.get(id)?.image ?? backImages.quest);
export const specialImage = (kind: SpecialKind) => imageUrl(kindById.get(kind)?.image ?? backImages.special);
export const specialName = (kind: SpecialKind) => kindById.get(kind)?.name ?? kind;
export const specialText = (kind: SpecialKind) => kindById.get(kind)?.text ?? '';
export const backImage = (which: keyof typeof backImages) => imageUrl(backImages[which]);
export const tokenUrl = imageUrl(tokenImage);
export const stars = (count: number) => '★'.repeat(count);

export function baseLabel(id: BaseId): string {
  const base = baseById.get(id);
  if (!base) return id;
  return `${base.type === 'YES' ? 'Yes!' : 'No!'} AI ${stars(base.stars)}`;
}

export function cardLabel(id: string): string {
  const card = questById.get(id);
  return card ? `${card.name} ${stars(card.stars)}` : id;
}
