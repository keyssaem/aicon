import type { GameState, PublicPlayer, SeatIndex } from '@aicon/engine';
import { cardLabel, specialName, tokenUrl } from '@aicon/ui';

interface SideProps {
  players: PublicPlayer[];
  active: SeatIndex;
  pendingTarget: SeatIndex | null;
  eligible: SeatIndex[];
  viewer: SeatIndex | 'debug';
  logLines: string[];
  problems: string[];
  state: GameState;
  showAnswers: boolean;
  onPickSeat: (seat: SeatIndex) => void;
}

export function Side({ players, active, pendingTarget, eligible, viewer, logLines, problems, state, showAnswers, onPickSeat }: SideProps) {
  return (
    <aside className="side">
      <section className="panel">
        <h2>플레이어</h2>
        {players.map((p) => (
          <div
            key={p.seat}
            className={`player ${p.seat === active ? 'is-active' : ''} ${p.seat === viewer ? 'is-viewer' : ''}`}
            onClick={() => onPickSeat(p.seat)}
            title="이 사람 시점으로 보기"
          >
            <div className="player-top">
              <b>{p.name}</b>
              <span className="badges">
                {p.seat === active ? <em className="badge turn">차례</em> : null}
                {p.seat === pendingTarget ? <em className="badge warn">공격받음</em> : null}
                {eligible.includes(p.seat) ? <em className="badge quest">검증 가능</em> : null}
                {p.skip > 0 ? <em className="badge warn">쉬기 {p.skip}</em> : null}
              </span>
            </div>
            <div className="player-meta">
              퀘스트 {p.questCount} · 스페셜 {p.specialCount} ·{' '}
              <img className="token" src={tokenUrl} alt="토큰" /> {p.tokens}
            </div>
          </div>
        ))}
      </section>

      {viewer === 'debug' ? (
        <section className="panel">
          <h2>모든 손패 (디버그)</h2>
          {state.players.map((p, seat) => (
            <div key={seat} className="debug-hand">
              <b>{p.name}</b>
              <div>
                {p.quest.map((id) => (
                  <span key={id} className="chip">
                    {cardLabel(id)}
                    {showAnswers ? <em className={state.catalog.answers[id] === 'YES' ? 'yes' : 'no'}>{state.catalog.answers[id] === 'YES' ? 'Y' : 'N'}</em> : null}
                  </span>
                ))}
                {p.specials.map((id) => (
                  <span key={id} className="chip special">
                    {specialName(state.catalog.specialKinds[id]!)}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {problems.length > 0 ? (
        <section className="panel problems">
          <h2>불변 조건 위반</h2>
          {problems.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </section>
      ) : null}

      <section className="panel log">
        <h2>게임 기록</h2>
        <div className="log-lines">
          {logLines.map((line, index) => (
            <p key={`${index}-${line}`}>{line}</p>
          ))}
        </div>
      </section>
    </aside>
  );
}
