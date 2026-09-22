import { useEffect, useState } from 'react';
import { BASE_IDS, baseOf } from '@aicon/protocol';
import type { AiType, BaseId, ClientAction, GameSnapshot, RoomState, SpecialKind } from '@aicon/protocol';
import { QuestCardView, SpecialCardView, Table, baseLabel, cardLabel, questStars, stars } from '@aicon/ui';
import { Countdown, GameEnd, LogPanel, Players, Reveal, RoundEnd } from '../components/GameParts';

interface GameScreenProps {
  room: RoomState;
  snapshot: GameSnapshot | null;
  log: string[];
  notice: string | null;
  onAction: (action: ClientAction) => void;
  onLeave: () => void;
}

export function GameScreen({ room, snapshot, log, notice, onAction, onLeave }: GameScreenProps) {
  const [selQuest, setSelQuest] = useState<string[]>([]);
  const [selSpecial, setSelSpecial] = useState<string | null>(null);
  const [iconBases, setIconBases] = useState<Record<string, AiType>>({});
  const [revealId, setRevealId] = useState<number | null>(null);

  const view = snapshot?.view ?? null;
  const seq = view?.seq ?? -1;
  const challengeId = view?.lastChallenge?.playId ?? null;

  // 새 상태가 오면 고르던 카드를 정리합니다.
  useEffect(() => {
    setSelQuest([]);
    setSelSpecial(null);
    setIconBases({});
  }, [seq]);

  // 검증 결과가 나오면 정답 공개 화면을 잠깐 띄웁니다.
  useEffect(() => {
    if (challengeId === null) return;
    setRevealId(challengeId);
    const id = window.setTimeout(() => setRevealId(null), 6000);
    return () => window.clearTimeout(id);
  }, [challengeId]);

  if (!view || view.viewer === 'spectator') {
    return <main className="waiting">게임을 준비하는 중…</main>;
  }

  const me = view.viewer;
  const names = view.players.map((player) => player.name);
  const hand = view.me;
  const pending = view.pending;
  const isActive = view.active === me;
  const canChallenge = pending?.kind === 'CHALLENGE' && pending.eligible.includes(me) && !pending.passed.includes(me);
  const isDefender = pending?.kind === 'DEFENSE' && pending.target === me;
  const selectedKind: SpecialKind | null = hand?.specials.find((s) => s.id === selSpecial)?.kind ?? null;
  const canSelect = view.phase === 'ACT' && isActive;
  const selectedStars = new Set(selQuest.map(questStars));
  const onlyStars = selectedStars.size === 1 ? ([...selectedStars][0] ?? null) : null;

  const highlight: BaseId[] = !canSelect
    ? []
    : selectedKind === 'RECYCLE'
      ? BASE_IDS.filter((base) => view.bases[base].length > 0)
      : !selSpecial && onlyStars !== null
        ? BASE_IDS.filter((base) => baseOf(base).stars === onlyStars)
        : [];

  const onBase = (base: BaseId) => {
    if (!canSelect) return;
    if (selectedKind === 'RECYCLE' && selSpecial) {
      onAction({ type: 'USE_RECYCLE', specialId: selSpecial, base });
      return;
    }
    if (!selSpecial && selQuest.length > 0) onAction({ type: 'PLAY_QUEST', cardIds: selQuest, base });
  };

  const iconReady =
    selectedKind === 'ICON' && selQuest.length >= 3 && (!view.options.expertIcon || selQuest.every((id) => iconBases[id]));

  const useIcon = () => {
    if (!selSpecial) return;
    const bases = view.options.expertIcon
      ? selQuest.map((id) => `${iconBases[id] ?? 'YES'}${questStars(id)}` as BaseId)
      : undefined;
    onAction({ type: 'USE_ICON', specialId: selSpecial, cardIds: selQuest, ...(bases ? { bases } : {}) });
  };

  const timerTotal =
    snapshot?.timer?.kind === 'CHALLENGE'
      ? room.options.challengeSec
      : snapshot?.timer?.kind === 'DEFENSE'
        ? room.options.defenseSec
        : 45;

  const instruction = (() => {
    if (view.phase === 'DRAW') {
      return isActive ? '카드를 한 장 가져오세요.' : `${names[view.active]}님이 카드를 가져오는 중…`;
    }
    if (view.phase === 'ACT') {
      if (!isActive) return `${names[view.active]}님이 카드를 내는 중…`;
      if (selectedKind === 'ICON') return `아이콘: 숫자가 이어지는 카드 3장 이상을 고르세요. (${selQuest.length}장)`;
      if (selectedKind === 'ATTACK') return '공격할 사람을 고르세요.';
      if (selectedKind === 'RECYCLE') return '가져올 베이스카드를 누르세요. (맨 위 카드 1장)';
      if (selectedKind === 'DEFENSE') return '방어 카드는 공격받았을 때만 쓸 수 있어요.';
      if (selQuest.length === 0) return '같은 별 카드를 고른 뒤 베이스카드를 누르세요.';
      return onlyStars === null
        ? '별 개수가 다른 카드는 함께 낼 수 없어요.'
        : `${stars(onlyStars)} ${selQuest.length}장 — 베이스카드를 누르세요.`;
    }
    if (view.phase === 'CHALLENGE' && pending?.kind === 'CHALLENGE') {
      const where = baseLabel(pending.play.items[0]!.base);
      const what = pending.play.items.map((item) => cardLabel(item.cardId)).join(', ');
      return `${names[pending.play.seat]}: ${where}에 ${what}`;
    }
    if (view.phase === 'DEFENSE' && pending?.kind === 'DEFENSE') {
      return `${names[pending.attacker]} → ${names[pending.target]} 공격!`;
    }
    return '';
  })();

  const defenseCard = hand?.specials.find((special) => special.kind === 'DEFENSE');

  return (
    <main className="game">
      <header className="status">
        <span className="round">
          {view.round}/{view.options.rounds}R
        </span>
        <span className="instruction">{instruction}</span>
        {snapshot?.timer ? <Countdown timer={snapshot.timer} serverNow={snapshot.now} total={timerTotal} /> : null}
        <button type="button" className="small" onClick={onLeave}>나가기</button>
      </header>

      {notice ? <p className="notice">{notice}</p> : null}

      <div className="board">
        <Table
          bases={view.bases}
          iconPile={view.iconPile}
          questDeckCount={view.questDeckCount}
          specialDeckCount={view.specialDeckCount}
          specialDiscard={view.specialDiscard}
          known={view.known}
          answers={null}
          highlight={highlight}
          lastPlay={view.lastPlay?.items.map((item) => item.cardId) ?? []}
          onBase={canSelect ? onBase : undefined}
          onDrawQuest={view.phase === 'DRAW' && isActive ? () => onAction({ type: 'DRAW', source: 'QUEST' }) : undefined}
          onDrawSpecial={
            view.phase === 'DRAW' && isActive && (hand?.specials.length ?? 0) < 3
              ? () => onAction({ type: 'DRAW', source: 'SPECIAL' })
              : undefined
          }
        />

        <aside className="side">
          <Players
            view={view}
            room={room}
            onPick={
              canSelect && selectedKind === 'ATTACK' && selSpecial
                ? (seat) => onAction({ type: 'USE_ATTACK', specialId: selSpecial, target: seat })
                : undefined
            }
            pickLabel="공격"
          />
          <LogPanel lines={log} />
        </aside>
      </div>

      <div className="actions">
        {view.phase === 'DRAW' && isActive ? (
          <>
            <button type="button" className="primary" onClick={() => onAction({ type: 'DRAW', source: 'QUEST' })}>
              퀘스트 카드 가져오기
            </button>
            <button
              type="button"
              disabled={(hand?.specials.length ?? 0) >= 3}
              onClick={() => onAction({ type: 'DRAW', source: 'SPECIAL' })}
            >
              스페셜 카드 가져오기 ({hand?.specials.length ?? 0}/3)
            </button>
          </>
        ) : null}

        {canChallenge ? (
          <>
            <button type="button" className="danger big" onClick={() => onAction({ type: 'CHALLENGE' })}>
              검증!
            </button>
            <button type="button" onClick={() => onAction({ type: 'PASS' })}>통과</button>
          </>
        ) : null}

        {isDefender ? (
          <>
            <button
              type="button"
              className="primary"
              disabled={!defenseCard}
              onClick={() => defenseCard && onAction({ type: 'DEFEND', specialId: defenseCard.id })}
            >
              {defenseCard ? '방어 카드 사용' : '방어 카드가 없어요'}
            </button>
            <button type="button" onClick={() => onAction({ type: 'ACCEPT_ATTACK' })}>공격 받기 (3장)</button>
          </>
        ) : null}

        {selectedKind === 'ICON' ? (
          <>
            {view.options.expertIcon
              ? selQuest.map((id) => (
                  <span key={id} className="icon-base">
                    {cardLabel(id)}
                    <button
                      type="button"
                      className={iconBases[id] === 'YES' ? 'yes on' : 'yes'}
                      onClick={() => setIconBases((prev) => ({ ...prev, [id]: 'YES' }))}
                    >
                      Yes!
                    </button>
                    <button
                      type="button"
                      className={iconBases[id] === 'NO' ? 'no on' : 'no'}
                      onClick={() => setIconBases((prev) => ({ ...prev, [id]: 'NO' }))}
                    >
                      No!
                    </button>
                  </span>
                ))
              : null}
            <button type="button" className="primary" disabled={!iconReady} onClick={useIcon}>
              아이콘 사용 ({selQuest.length}장)
            </button>
          </>
        ) : null}

        {selQuest.length > 0 || selSpecial ? (
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setSelQuest([]);
              setSelSpecial(null);
              setIconBases({});
            }}
          >
            선택 취소
          </button>
        ) : null}
      </div>

      <section className="hand">
        <div className="hand-cards">
          {hand?.quest.map((id) => (
            <QuestCardView
              key={id}
              id={id}
              width={78}
              known={view.known[id]}
              selected={selQuest.includes(id)}
              dim={!selSpecial && selQuest.length > 0 && onlyStars !== null && questStars(id) !== onlyStars}
              onClick={
                canSelect
                  ? () => setSelQuest((prev) => (prev.includes(id) ? prev.filter((card) => card !== id) : [...prev, id]))
                  : undefined
              }
            />
          ))}
        </div>
        <div className="hand-specials">
          {hand?.specials.map((special) => (
            <SpecialCardView
              key={special.id}
              kind={special.kind}
              width={64}
              selected={selSpecial === special.id}
              onClick={
                canSelect
                  ? () => {
                      setSelSpecial((prev) => (prev === special.id ? null : special.id));
                      setSelQuest([]);
                      setIconBases({});
                    }
                  : undefined
              }
            />
          ))}
          {(hand?.specials.length ?? 0) === 0 ? <span className="hint">스페셜카드 없음</span> : null}
        </div>
      </section>

      {revealId !== null && view.lastChallenge?.playId === revealId ? (
        <Reveal outcome={view.lastChallenge} names={names} onClose={() => setRevealId(null)} />
      ) : null}

      {view.phase === 'ROUND_END' && view.history.length > 0 ? (
        <RoundEnd
          summary={view.history[view.history.length - 1]!}
          names={names}
          canAdvance
          onNext={() => onAction({ type: 'NEXT_ROUND' })}
        />
      ) : null}

      {view.phase === 'GAME_END' ? <GameEnd view={view} names={names} onLeave={onLeave} /> : null}
    </main>
  );
}
