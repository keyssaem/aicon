import type { AiType, SpecialKind } from '@aicon/protocol';
import { questImage, questName, questStars, specialImage, specialName, specialText, stars } from './cards';

interface QuestCardProps {
  id: string;
  width?: number;
  /** 검증으로 공개된 정답 */
  known?: AiType | undefined;
  /** 디버그용 '정답 보기' */
  answer?: AiType | undefined;
  selected?: boolean;
  dim?: boolean;
  onClick?: (() => void) | undefined;
}

export function QuestCardView({ id, width = 84, known, answer, selected, dim, onClick }: QuestCardProps) {
  const label = `${questName(id)} ${stars(questStars(id))}`;
  const className = [
    'card',
    selected ? 'is-selected' : '',
    dim ? 'is-dim' : '',
    onClick ? 'is-clickable' : '',
  ].filter(Boolean).join(' ');
  return (
    <span className={className} style={{ width }} onClick={onClick} title={label}>
      <img src={questImage(id)} alt={label} draggable={false} />
      {known ? <span className={`tag ${known}`}>{known === 'YES' ? 'Yes!' : 'No!'} 검증됨</span> : null}
      {!known && answer ? <span className={`tag ghost ${answer}`}>{answer === 'YES' ? 'Yes!' : 'No!'}</span> : null}
    </span>
  );
}

interface SpecialCardProps {
  kind: SpecialKind;
  width?: number;
  selected?: boolean;
  onClick?: (() => void) | undefined;
}

export function SpecialCardView({ kind, width = 70, selected, onClick }: SpecialCardProps) {
  const className = ['card', selected ? 'is-selected' : '', onClick ? 'is-clickable' : ''].filter(Boolean).join(' ');
  return (
    <span className={className} style={{ width }} onClick={onClick} title={`${specialName(kind)} — ${specialText(kind)}`}>
      <img src={specialImage(kind)} alt={specialName(kind)} draggable={false} />
    </span>
  );
}
