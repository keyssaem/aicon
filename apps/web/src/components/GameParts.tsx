import { useEffect, useRef, useState } from 'react';
import type { ChallengeOutcome, PlayerView, RoomState, RoundSummary, TimerInfo } from '@aicon/protocol';
import { QuestCardView, cardLabel, tokenUrl } from '@aicon/ui';

/** 서버 시계 기준 남은 시간 막대. 기기 시계가 틀려도 맞게 보입니다. */
export function Countdown({ timer, serverNow, total }: { timer: TimerInfo; serverNow: number; total: number }) {
  const [now, setNow] = useState(() => Date.now());
  const offset = useRef(0);

  useEffect(() => {
    offset.current = Date.now() - serverNow;
  }, [serverNow]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, []);

  const remaining = Math.max(0, timer.endsAt + offset.current - now);
  const ratio = total > 0 ? Math.min(1, remaining / (total * 1000)) : 0;
  return (
    <div className="countdown">
      <div className="countdown-bar" style={{ width: `${ratio * 100}%` }} />
      <span>{Math.ceil(remaining / 1000)}초</span>
    </div>
  );
}

interface PlayersProps {
  view: PlayerView;
  room: RoomState;
  onPick?: ((seat: number) => void) | undefined;
  pickLabel?: string;
}

export function Players({ view, room, onPick, pickLabel }: PlayersProps) {
  const pending = view.pending;
  const eligible = pending?.kind === 'CHALLENGE' ? pending.eligible.filter((seat) => !pending.passed.includes(seat)) : [];
  const target = pending?.kind === 'DEFENSE' ? pending.target : null;

  return (
    <section className="players">
      {view.players.map((player) => {
        const connected = room.players.find((p) => p.seat === player.seat)?.connected ?? true;
        return (
          <div
            key={player.seat}
            className={`player ${player.seat === view.active ? 'is-active' : ''} ${player.seat === view.viewer ? 'is-me' : ''}`}
          >
            <div className="player-name">
              <b>{player.name}</b>
              {player.seat === view.viewer ? <em className="tag">나</em> : null}
              {player.seat === room.hostSeat ? <em className="tag">방장</em> : null}
              {player.seat === view.active ? <em className="tag turn">차례</em> : null}
              {player.seat === target ? <em className="tag warn">공격받음</em> : null}
              {eligible.includes(player.seat) ? <em className="tag ok">검증 가능</em> : null}
              {player.skip > 0 ? <em className="tag warn">쉬기 {player.skip}</em> : null}
              {!connected ? <em className="tag off">연결 끊김</em> : null}
            </div>
            <div className="player-meta">
              <span>퀘스트 {player.questCount}</span>
              <span>스페셜 {player.specialCount}</span>
              <span className="tokens">
                <img src={tokenUrl} alt="토큰" />
                {player.tokens}
              </span>
            </div>
            {onPick && player.seat !== view.viewer ? (
              <button type="button" className="small danger" onClick={() => onPick(player.seat)}>
                {pickLabel ?? '고르기'}
              </button>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}

/** 검증 결과 공개: 실물 카드 뒷면 QR을 찍었을 때처럼 Yes!/No!를 보여 줍니다. */
export function Reveal({ outcome, names, onClose }: { outcome: ChallengeOutcome; names: string[]; onClose: () => void }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="reveal" onClick={(event) => event.stopPropagation()}>
        <p className="reveal-head">
          {names[outcome.challenger]}의 검증 — {outcome.success ? '성공!' : '실패'}
        </p>
        <div className="reveal-cards">
          {outcome.reveals.map((item) => (
            <div key={item.cardId} className={`reveal-card ${item.declared === item.actual ? 'right' : 'wrong'}`}>
              <QuestCardView id={item.cardId} width={96} />
              <div className={`reveal-answer ${item.actual}`}>
                {item.actual === 'YES' ? 'Yes! Ai' : 'No! Ai'}
                <span>{item.declared === item.actual ? '○' : '✕'}</span>
              </div>
            </div>
          ))}
        </div>
        <p className="reveal-foot">
          {outcome.success
            ? `${names[outcome.challenger]} 토큰 +1 · 낸 카드는 ${names[outcome.offender]}의 손으로 돌아갑니다.`
            : `모두 맞게 냈어요. ${names[outcome.challenger]}는 다음 차례를 쉽니다.`}
        </p>
        <button type="button" onClick={onClose}>확인</button>
      </div>
    </div>
  );
}

export function RoundEnd({ summary, names, canAdvance, onNext }: { summary: RoundSummary; names: string[]; canAdvance: boolean; onNext: () => void }) {
  const ranked = [...summary.entries].sort((a, b) => b.tokens - a.tokens || a.questLeft - b.questLeft);
  return (
    <div className="overlay">
      <div className="panel-modal">
        <h2>{summary.round}라운드 끝!</h2>
        <table className="result">
          <thead>
            <tr>
              <th>이름</th>
              <th>남은 카드</th>
              <th>받은 토큰</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((entry) => (
              <tr key={entry.seat} className={entry.seat === summary.finisher ? 'first' : ''}>
                <td>{names[entry.seat]}{entry.seat === summary.finisher ? ' 🎉' : ''}</td>
                <td>{entry.questLeft}장</td>
                <td>+{entry.tokens}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="primary big" onClick={onNext} disabled={!canAdvance}>
          다음 라운드 시작
        </button>
      </div>
    </div>
  );
}

export function GameEnd({ view, names, onLeave }: { view: PlayerView; names: string[]; onLeave: () => void }) {
  const winners = view.winners ?? [];
  return (
    <div className="overlay">
      <div className="panel-modal">
        <h2>게임 끝!</h2>
        <p className="winner">우승 · {winners.map((seat) => names[seat]).join(', ')}</p>
        <table className="result">
          <thead>
            <tr>
              <th>이름</th>
              <th>토큰</th>
            </tr>
          </thead>
          <tbody>
            {[...view.players]
              .sort((a, b) => b.tokens - a.tokens)
              .map((player) => (
                <tr key={player.seat} className={winners.includes(player.seat) ? 'first' : ''}>
                  <td>{player.name}</td>
                  <td>{player.tokens}개</td>
                </tr>
              ))}
          </tbody>
        </table>
        <button type="button" className="primary big" onClick={onLeave}>처음으로</button>
      </div>
    </div>
  );
}

export function LogPanel({ lines }: { lines: string[] }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [lines.length]);
  return (
    <section className="log">
      <h2>게임 기록</h2>
      <div className="log-lines" ref={box}>
        {lines.map((line, index) => (
          <p key={`${index}-${line}`}>{line}</p>
        ))}
      </div>
    </section>
  );
}

export const cardTitle = cardLabel;
