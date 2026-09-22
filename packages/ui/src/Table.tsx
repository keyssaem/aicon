import { BASE_IDS } from '@aicon/protocol';
import type { AiType, BaseId, PileEntry, SpecialCardView as SpecialView } from '@aicon/protocol';
import { backImage, baseImage, baseLabel, cardLabel } from './cards';
import { QuestCardView, SpecialCardView } from './Card';

interface TableProps {
  bases: Record<BaseId, PileEntry[]>;
  iconPile: string[];
  questDeckCount: number;
  specialDeckCount: number;
  specialDiscard: SpecialView[];
  known: Record<string, AiType>;
  answers: Record<string, AiType> | null;
  highlight: BaseId[];
  lastPlay: string[];
  onBase?: ((base: BaseId) => void) | undefined;
  onDrawQuest?: (() => void) | undefined;
  onDrawSpecial?: (() => void) | undefined;
}

export function Table(props: TableProps) {
  const { bases, iconPile, known, answers, highlight, lastPlay } = props;
  const topIcon = iconPile[iconPile.length - 1];
  const topSpecial = props.specialDiscard[props.specialDiscard.length - 1];

  return (
    <div className="table">
      <div className="bases">
        {BASE_IDS.map((base) => {
          const pile = bases[base];
          const top = pile[pile.length - 1];
          const active = highlight.includes(base);
          return (
            <div
              key={base}
              className={`pile ${active ? 'is-target' : ''} ${props.onBase ? 'is-clickable' : ''}`}
              onClick={active && props.onBase ? () => props.onBase?.(base) : undefined}
              title={pile.length > 0 ? pile.map((entry) => cardLabel(entry.cardId)).join('\n') : baseLabel(base)}
            >
              <img className="base-img" src={baseImage(base)} alt={baseLabel(base)} draggable={false} />
              {top ? (
                <span className={`pile-top ${lastPlay.includes(top.cardId) ? 'is-fresh' : ''}`}>
                  <QuestCardView id={top.cardId} width={70} known={known[top.cardId]} answer={answers?.[top.cardId]} />
                </span>
              ) : null}
              {pile.length > 0 ? <span className="pile-count">{pile.length}</span> : null}
            </div>
          );
        })}
      </div>

      <div className="decks">
        <div className={`deck ${props.onDrawQuest ? 'is-clickable' : ''}`} onClick={props.onDrawQuest}>
          <img src={backImage('quest')} alt="퀘스트 더미" draggable={false} />
          <span>퀘스트 {props.questDeckCount}</span>
        </div>
        <div className={`deck ${props.onDrawSpecial ? 'is-clickable' : ''}`} onClick={props.onDrawSpecial}>
          <img src={backImage('special')} alt="스페셜 더미" draggable={false} />
          <span>스페셜 {props.specialDeckCount}</span>
        </div>
        <div className="deck">
          {topIcon ? (
            <QuestCardView id={topIcon} width={64} known={known[topIcon]} answer={answers?.[topIcon]} />
          ) : (
            <div className="deck-empty">비어 있음</div>
          )}
          <span>아이콘 더미 {iconPile.length}</span>
        </div>
        <div className="deck">
          {topSpecial ? <SpecialCardView kind={topSpecial.kind} width={64} /> : <div className="deck-empty">비어 있음</div>}
          <span>버린 스페셜 {props.specialDiscard.length}</span>
        </div>
      </div>
    </div>
  );
}
