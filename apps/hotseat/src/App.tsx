import { useState } from 'react';
import { BASE_IDS, baseOf, randomFn, viewFor } from '@aicon/engine';
import type { Action, AiType, BaseId, GameState, SeatIndex, SpecialKind } from '@aicon/engine';
import { randomAction } from '@aicon/engine/sim';
import { QuestCardView, SpecialCardView, Table, baseLabel, cardLabel, describeEvent, questStars, stars } from '@aicon/ui';
import { NewGame } from './components/NewGame';
import { Side } from './components/Side';
import {
  DEFAULT_CONFIG,
  applyAction,
  current,
  exportSession,
  importSession,
  problems,
  startSession,
  undo,
} from './session';
import type { Session, SessionConfig } from './session';

type Viewer = SeatIndex | 'debug';

/** 지금 행동할 수 있는 좌석들 */
function actorSeats(state: GameState): SeatIndex[] {
  const pending = state.pending;
  switch (state.phase) {
    case 'DRAW':
    case 'ACT':
      return [state.active];
    case 'DEFENSE':
      return pending?.kind === 'DEFENSE' ? [pending.target] : [];
    case 'CHALLENGE':
      return pending?.kind === 'CHALLENGE' ? pending.eligible.filter((seat) => !pending.passed.includes(seat)) : [];
    default:
      return [];
  }
}

export default function App() {
  const [session, setSession] = useState<Session>(() => startSession(DEFAULT_CONFIG));
  const [viewer, setViewer] = useState<Viewer>(0);
  const [autoFollow, setAutoFollow] = useState(true);
  const [showAnswers, setShowAnswers] = useState(false);
  const [showNewGame, setShowNewGame] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selQuest, setSelQuest] = useState<string[]>([]);
  const [selSpecial, setSelSpecial] = useState<string | null>(null);
  const [iconBases, setIconBases] = useState<Record<string, AiType>>({});

  const state = current(session);
  const names = state.players.map((player) => player.name);
  const view = viewer === 'debug' ? null : viewFor(state, viewer);
  const acting = actorSeats(state);
  const pending = state.pending;
  const defenseTarget = pending?.kind === 'DEFENSE' ? pending.target : null;
  const handSeat: SeatIndex = viewer === 'debug' ? (defenseTarget ?? state.active) : viewer;

  const clearSelection = () => {
    setSelQuest([]);
    setSelSpecial(null);
    setIconBases({});
  };

  const canActAs = (seat: SeatIndex) => acting.includes(seat) && (viewer === 'debug' || viewer === seat);

  const dispatch = (action: Action) => {
    const result = applyAction(session, action);
    if (result.error) {
      setError(`${result.error.message} (${result.error.code})`);
      return;
    }
    setError(null);
    setSession(result.session);
    clearSelection();
    if (autoFollow && viewer !== 'debug') {
      const next = actorSeats(current(result.session))[0];
      if (next !== undefined) setViewer(next);
    }
  };

  const playRandom = (count: number) => {
    let next = session;
    const rand = randomFn((Date.now() ^ (next.steps.length * 2654435761)) >>> 0);
    for (let i = 0; i < count; i += 1) {
      const now = current(next);
      if (now.phase === 'GAME_END') break;
      const action = randomAction(now, rand);
      if (!action) break;
      const result = applyAction(next, action);
      if (result.error) {
        setError(`${result.error.message} (${result.error.code})`);
        break;
      }
      next = result.session;
    }
    setSession(next);
    clearSelection();
  };

  const handOf = (seat: SeatIndex) => {
    if (viewer !== 'debug' && viewer !== seat) return null;
    const player = state.players[seat];
    if (!player) return null;
    return {
      quest: player.quest,
      specials: player.specials.map((id) => ({ id, kind: state.catalog.specialKinds[id] as SpecialKind })),
    };
  };

  const hand = handOf(handSeat);
  const known = view ? view.known : state.known;
  const selectedKind: SpecialKind | null = selSpecial ? (state.catalog.specialKinds[selSpecial] as SpecialKind) : null;
  const canSelect = state.phase === 'ACT' && canActAs(state.active) && handSeat === state.active;

  const toggleQuest = (id: string) => {
    setSelQuest((prev) => (prev.includes(id) ? prev.filter((card) => card !== id) : [...prev, id]));
  };
  const toggleSpecial = (id: string) => {
    setSelSpecial((prev) => (prev === id ? null : id));
    setSelQuest([]);
    setIconBases({});
  };

  const selectedStars = new Set(selQuest.map(questStars));
  const onlyStars = selectedStars.size === 1 ? ([...selectedStars][0] ?? null) : null;

  const highlight: BaseId[] = (() => {
    if (!canSelect) return [];
    if (selectedKind === 'RECYCLE') return BASE_IDS.filter((base) => state.bases[base].length > 0);
    if (!selSpecial && selQuest.length > 0 && onlyStars !== null) {
      return BASE_IDS.filter((base) => baseOf(base).stars === onlyStars);
    }
    return [];
  })();

  const onBase = (base: BaseId) => {
    if (!canSelect) return;
    if (selectedKind === 'RECYCLE' && selSpecial) {
      dispatch({ type: 'USE_RECYCLE', seat: state.active, specialId: selSpecial, base });
      return;
    }
    if (!selSpecial && selQuest.length > 0) {
      dispatch({ type: 'PLAY_QUEST', seat: state.active, cardIds: selQuest, base });
    }
  };

  const logLines = session.steps.flatMap((step) =>
    step.events.map((event) => describeEvent(event, names, viewer === 'debug' || showAnswers)),
  );

  const iconReady =
    selectedKind === 'ICON' && selQuest.length >= 3 && (!state.options.expertIcon || selQuest.every((id) => iconBases[id]));

  const useIcon = () => {
    if (!selSpecial) return;
    const bases = state.options.expertIcon
      ? selQuest.map((id) => `${iconBases[id] ?? 'YES'}${questStars(id)}` as BaseId)
      : undefined;
    dispatch({
      type: 'USE_ICON',
      seat: state.active,
      specialId: selSpecial,
      cardIds: selQuest,
      ...(bases ? { bases } : {}),
    });
  };

  const renderActions = () => {
    if (state.phase === 'GAME_END') {
      return (
        <div className="actions">
          <p className="headline">
            게임 종료 · 우승 {(state.winners ?? []).map((seat) => names[seat]).join(', ')} (토큰{' '}
            {state.players.map((player) => `${player.name} ${player.tokens}`).join(' · ')})
          </p>
          <button type="button" className="primary" onClick={() => setShowNewGame(true)}>새 게임</button>
        </div>
      );
    }

    if (state.phase === 'ROUND_END') {
      const summary = state.history[state.history.length - 1];
      return (
        <div className="actions">
          <p className="headline">{summary?.round}라운드 종료 · 1등 {names[summary?.finisher ?? 0]}</p>
          <p>
            {summary?.entries.map((entry) => `${names[entry.seat]} 남은 ${entry.questLeft}장 → 토큰 +${entry.tokens}`).join(' | ')}
          </p>
          <button type="button" className="primary" onClick={() => dispatch({ type: 'NEXT_ROUND' })}>다음 라운드 시작</button>
        </div>
      );
    }

    if (state.phase === 'CHALLENGE' && pending?.kind === 'CHALLENGE') {
      const open = pending.eligible.filter((seat) => !pending.passed.includes(seat));
      const mine = open.filter(canActAs);
      return (
        <div className="actions">
          <p className="headline">
            {names[pending.play.seat]}: {baseLabel(pending.play.items[0]!.base)}에{' '}
            {pending.play.items.map((item) => cardLabel(item.cardId)).join(', ')} 내려놓음
          </p>
          <p>검증 기회 · 통과 {pending.passed.length}/{pending.eligible.length}</p>
          {mine.map((seat) => (
            <span key={seat} className="seat-actions">
              <b>{names[seat]}</b>
              <button type="button" className="danger" onClick={() => dispatch({ type: 'CHALLENGE', seat })}>검증!</button>
              <button type="button" onClick={() => dispatch({ type: 'PASS', seat })}>통과</button>
            </span>
          ))}
          {mine.length === 0 && open[0] !== undefined ? (
            <button type="button" onClick={() => setViewer(open[0] as SeatIndex)}>{names[open[0] as SeatIndex]} 시점으로</button>
          ) : null}
          <button type="button" className="ghost" onClick={() => dispatch({ type: 'TIMEOUT' })}>시간 초과(시스템)</button>
        </div>
      );
    }

    if (state.phase === 'DEFENSE' && pending?.kind === 'DEFENSE') {
      const target = pending.target;
      const defense = handOf(target)?.specials.find((special) => special.kind === 'DEFENSE');
      return (
        <div className="actions">
          <p className="headline">{names[pending.attacker]} → {names[target]} 공격! 막지 못하면 퀘스트 3장을 가져갑니다.</p>
          {canActAs(target) ? (
            <>
              <button
                type="button"
                className="primary"
                disabled={!defense}
                onClick={() => defense && dispatch({ type: 'DEFEND', seat: target, specialId: defense.id })}
              >
                {defense ? '방어 카드 사용' : '방어 카드 없음'}
              </button>
              <button type="button" onClick={() => dispatch({ type: 'ACCEPT_ATTACK', seat: target })}>공격 받기 (3장)</button>
            </>
          ) : (
            <button type="button" onClick={() => setViewer(target)}>{names[target]} 시점으로</button>
          )}
          <button type="button" className="ghost" onClick={() => dispatch({ type: 'TIMEOUT' })}>시간 초과(시스템)</button>
        </div>
      );
    }

    if (!canActAs(state.active)) {
      return (
        <div className="actions">
          <p className="headline">{names[state.active]}님의 차례예요.</p>
          <button type="button" onClick={() => setViewer(state.active)}>{names[state.active]} 시점으로</button>
        </div>
      );
    }

    if (state.phase === 'DRAW') {
      const player = state.players[state.active]!;
      return (
        <div className="actions">
          <p className="headline">{names[state.active]}: 카드를 한 장 가져오세요.</p>
          <button type="button" className="primary" onClick={() => dispatch({ type: 'DRAW', seat: state.active, source: 'QUEST' })}>
            퀘스트 더미에서 먹기
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: 'DRAW', seat: state.active, source: 'SPECIAL' })}
            disabled={player.specials.length >= 3}
          >
            스페셜 더미에서 먹기 ({player.specials.length}/3)
          </button>
        </div>
      );
    }

    if (selectedKind === 'ICON') {
      return (
        <div className="actions">
          <p className="headline">아이콘: 숫자가 이어지는 카드 3장 이상을 고르세요. ({selQuest.length}장 선택)</p>
          {state.options.expertIcon ? (
            <div className="icon-bases">
              {selQuest.map((id) => (
                <span key={id} className="icon-base">
                  {cardLabel(id)}
                  <button type="button" className={iconBases[id] === 'YES' ? 'yes on' : 'yes'} onClick={() => setIconBases((prev) => ({ ...prev, [id]: 'YES' }))}>Yes!</button>
                  <button type="button" className={iconBases[id] === 'NO' ? 'no on' : 'no'} onClick={() => setIconBases((prev) => ({ ...prev, [id]: 'NO' }))}>No!</button>
                </span>
              ))}
            </div>
          ) : null}
          <button type="button" className="primary" disabled={!iconReady} onClick={useIcon}>아이콘 사용 ({selQuest.length}장)</button>
          <button type="button" onClick={clearSelection}>선택 취소</button>
        </div>
      );
    }

    if (selectedKind === 'ATTACK') {
      return (
        <div className="actions">
          <p className="headline">공격할 사람을 고르세요.</p>
          {state.players.map((player, seat) =>
            seat === state.active ? null : (
              <button
                key={seat}
                type="button"
                className="danger"
                onClick={() => selSpecial && dispatch({ type: 'USE_ATTACK', seat: state.active, specialId: selSpecial, target: seat })}
              >
                {player.name} 공격
              </button>
            ),
          )}
          <button type="button" onClick={clearSelection}>선택 취소</button>
        </div>
      );
    }

    if (selectedKind === 'RECYCLE' || selectedKind === 'DEFENSE') {
      return (
        <div className="actions">
          <p className="headline">
            {selectedKind === 'RECYCLE'
              ? '재활용: 가져올 베이스 더미를 누르세요. (맨 위 카드 1장)'
              : '방어 카드는 공격받았을 때만 쓸 수 있어요.'}
          </p>
          <button type="button" onClick={clearSelection}>선택 취소</button>
        </div>
      );
    }

    return (
      <div className="actions">
        <p className="headline">
          {selQuest.length === 0
            ? '같은 별 카드를 고른 뒤 베이스카드를 누르세요. 스페셜카드를 눌러 사용할 수도 있어요.'
            : onlyStars !== null
              ? `${stars(onlyStars)} ${selQuest.length}장 선택 — 강조된 베이스카드를 누르세요.`
              : '별 개수가 다른 카드는 함께 낼 수 없어요.'}
        </p>
        {selQuest.length > 0 ? <button type="button" onClick={clearSelection}>선택 취소</button> : null}
      </div>
    );
  };

  return (
    <div className="app">
      <header className="top">
        <h1>아이콘 핫시트 디버거</h1>
        <span className="meta">
          시드 {state.seed} · {state.round}/{state.options.rounds}라운드 · {state.phase} · 행동 {state.seq}
          {state.options.expertIcon ? ' · 숙련자 아이콘' : ''}
        </span>
        <span className="spacer" />
        <button type="button" onClick={() => setShowNewGame(true)}>새 게임</button>
        <button type="button" onClick={() => { setSession(undo(session)); clearSelection(); }} disabled={session.steps.length <= 1}>
          되돌리기
        </button>
        <button type="button" onClick={() => playRandom(1)}>랜덤 1수</button>
        <button type="button" onClick={() => playRandom(40)}>랜덤 40수</button>
        <label className="check">
          <input type="checkbox" checked={autoFollow} onChange={(event) => setAutoFollow(event.target.checked)} />
          자동 시점 전환
        </label>
        <label className="check">
          <input type="checkbox" checked={showAnswers} onChange={(event) => setShowAnswers(event.target.checked)} />
          정답 보기
        </label>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(exportSession(session));
            setError('행동 기록을 클립보드에 복사했습니다.');
          }}
        >
          기록 복사
        </button>
        <button
          type="button"
          onClick={() => {
            const json = window.prompt('행동 기록(JSON)을 붙여넣으세요.');
            if (!json) return;
            try {
              setSession(importSession(json));
              clearSelection();
              setError(null);
            } catch (failure) {
              setError(failure instanceof Error ? failure.message : '기록을 읽지 못했습니다.');
            }
          }}
        >
          기록 불러오기
        </button>
      </header>

      <nav className="seats">
        {state.players.map((player, seat) => (
          <button key={seat} type="button" className={viewer === seat ? 'is-on' : ''} onClick={() => { setViewer(seat); clearSelection(); }}>
            {player.name}
            {acting.includes(seat) ? ' •' : ''}
          </button>
        ))}
        <button type="button" className={viewer === 'debug' ? 'is-on' : ''} onClick={() => { setViewer('debug'); clearSelection(); }}>
          전체(디버그)
        </button>
      </nav>

      <main className="main">
        <div className="board">
          <Table
            bases={view ? view.bases : state.bases}
            iconPile={view ? view.iconPile : state.iconPile}
            questDeckCount={view ? view.questDeckCount : state.questDeck.length}
            specialDeckCount={view ? view.specialDeckCount : state.specialDeck.length}
            specialDiscard={
              view ? view.specialDiscard : state.specialDiscard.map((id) => ({ id, kind: state.catalog.specialKinds[id] as SpecialKind }))
            }
            known={known}
            answers={showAnswers ? state.catalog.answers : null}
            highlight={highlight}
            lastPlay={state.lastPlay?.items.map((item) => item.cardId) ?? []}
            onBase={canSelect ? onBase : undefined}
            onDrawQuest={
              state.phase === 'DRAW' && canActAs(state.active)
                ? () => dispatch({ type: 'DRAW', seat: state.active, source: 'QUEST' })
                : undefined
            }
            onDrawSpecial={
              state.phase === 'DRAW' && canActAs(state.active) && (state.players[state.active]?.specials.length ?? 0) < 3
                ? () => dispatch({ type: 'DRAW', seat: state.active, source: 'SPECIAL' })
                : undefined
            }
          />

          <div className="actions-wrap">{renderActions()}</div>

          <div className="hand">
            <div className="hand-label">
              {hand
                ? `${names[handSeat]}의 손패 · 퀘스트 ${hand.quest.length} · 스페셜 ${hand.specials.length}`
                : '다른 사람의 손패는 볼 수 없어요'}
            </div>
            <div className="hand-cards">
              {hand?.quest.map((id) => (
                <QuestCardView
                  key={id}
                  id={id}
                  selected={selQuest.includes(id)}
                  dim={!selSpecial && selQuest.length > 0 && onlyStars !== null && questStars(id) !== onlyStars}
                  known={known[id]}
                  answer={showAnswers ? state.catalog.answers[id] : undefined}
                  onClick={canSelect ? () => toggleQuest(id) : undefined}
                />
              ))}
            </div>
            <div className="hand-specials">
              {hand?.specials.map((special) => (
                <SpecialCardView
                  key={special.id}
                  kind={special.kind}
                  selected={selSpecial === special.id}
                  onClick={canSelect ? () => toggleSpecial(special.id) : undefined}
                />
              ))}
            </div>
          </div>
        </div>

        <Side
          players={
            view
              ? view.players
              : state.players.map((player, seat) => ({
                  seat,
                  name: player.name,
                  tokens: player.tokens,
                  skip: player.skip,
                  questCount: player.quest.length,
                  specialCount: player.specials.length,
                }))
          }
          active={state.active}
          pendingTarget={defenseTarget}
          eligible={pending?.kind === 'CHALLENGE' ? pending.eligible.filter((seat) => !pending.passed.includes(seat)) : []}
          viewer={viewer}
          logLines={logLines}
          problems={problems(session)}
          state={state}
          showAnswers={showAnswers}
          onPickSeat={(seat) => { setViewer(seat); clearSelection(); }}
        />
      </main>

      <details className="inspector">
        <summary>상태 보기 (JSON) — {viewer === 'debug' ? '서버가 가진 전체 상태' : '이 좌석이 받는 화면 상태'}</summary>
        <pre>{JSON.stringify(viewer === 'debug' ? state : view, null, 2)}</pre>
      </details>

      {showNewGame ? (
        <NewGame
          initial={session.config}
          onCancel={() => setShowNewGame(false)}
          onStart={(config: SessionConfig) => {
            setSession(startSession(config));
            setViewer(0);
            clearSelection();
            setShowNewGame(false);
            setError(null);
          }}
        />
      ) : null}

      {error ? (
        <div className="toast" onClick={() => setError(null)}>
          {error}
        </div>
      ) : null}
    </div>
  );
}
