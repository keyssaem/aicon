import { useState } from 'react';
import type { SessionConfig } from '../session';

interface NewGameProps {
  initial: SessionConfig;
  onStart: (config: SessionConfig) => void;
  onCancel: () => void;
}

const ALL_NAMES = ['지우', '민수', '서연', '도윤'];

export function NewGame({ initial, onStart, onCancel }: NewGameProps) {
  const [count, setCount] = useState(initial.players.length);
  const [seed, setSeed] = useState(String(initial.seed));
  const [rounds, setRounds] = useState(initial.rounds);
  const [expertIcon, setExpertIcon] = useState(initial.expertIcon);
  const [firstSeat, setFirstSeat] = useState<string>(String(initial.firstSeat));

  return (
    <div className="modal-back" onClick={onCancel}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <h2>새 게임</h2>
        <label>
          인원
          <select value={count} onChange={(event) => setCount(Number(event.target.value))}>
            {[2, 3, 4].map((n) => (
              <option key={n} value={n}>{n}명</option>
            ))}
          </select>
        </label>
        <label>
          시드
          <input value={seed} onChange={(event) => setSeed(event.target.value)} inputMode="numeric" />
        </label>
        <label>
          라운드 수
          <select value={rounds} onChange={(event) => setRounds(Number(event.target.value))}>
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>{n}라운드</option>
            ))}
          </select>
        </label>
        <label>
          첫 차례
          <select value={firstSeat} onChange={(event) => setFirstSeat(event.target.value)}>
            <option value="random">무작위</option>
            {ALL_NAMES.slice(0, count).map((name, seat) => (
              <option key={name} value={seat}>{name}</option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={expertIcon} onChange={(event) => setExpertIcon(event.target.checked)} />
          숙련자 아이콘 규칙 (아이콘도 YES/NO로 나눠 놓고 검증)
        </label>
        <div className="modal-buttons">
          <button type="button" onClick={onCancel}>취소</button>
          <button
            type="button"
            className="primary"
            onClick={() =>
              onStart({
                players: ALL_NAMES.slice(0, count),
                seed: Number(seed) || 0,
                rounds,
                expertIcon,
                firstSeat: firstSeat === 'random' ? 'random' : Number(firstSeat),
              })
            }
          >
            시작
          </button>
        </div>
      </div>
    </div>
  );
}
