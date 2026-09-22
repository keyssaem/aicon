import { useState } from 'react';
import type { RoomOptions } from '@aicon/protocol';
import { loadSession } from '../net';

interface HomeProps {
  busy: boolean;
  notice: string | null;
  onCreate: (nickname: string, options: Partial<RoomOptions>) => void;
  onJoin: (code: string, nickname: string) => void;
}

const codeFromUrl = (): string => {
  const value = new URLSearchParams(window.location.search).get('code') ?? '';
  return /^\d{6}$/.test(value) ? value : '';
};

export function Home({ busy, notice, onCreate, onJoin }: HomeProps) {
  const [nickname, setNickname] = useState(loadSession()?.nickname ?? '');
  const [code, setCode] = useState(codeFromUrl);
  const [rounds, setRounds] = useState(2);
  const [expertIcon, setExpertIcon] = useState(false);

  const name = nickname.trim();
  const ready = name.length >= 1 && name.length <= 8;

  return (
    <main className="home">
      <header className="home-head">
        <h1>
          아이콘 <span>AiCon</span>
        </h1>
        <p>인공지능일까, 아닐까? 친구들과 함께 구분해 보세요.</p>
      </header>

      {notice ? <p className="notice">{notice}</p> : null}

      <label className="field">
        <span>이름 (최대 8자)</span>
        <input
          value={nickname}
          onChange={(event) => setNickname(event.target.value.slice(0, 8))}
          placeholder="예: 지우"
          autoComplete="off"
        />
      </label>

      <section className="card-panel">
        <h2>방 만들기</h2>
        <div className="row">
          <label className="inline">
            라운드
            <select value={rounds} onChange={(event) => setRounds(Number(event.target.value))}>
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>{n}라운드</option>
              ))}
            </select>
          </label>
          <label className="inline">
            <input type="checkbox" checked={expertIcon} onChange={(event) => setExpertIcon(event.target.checked)} />
            숙련자 아이콘 규칙
          </label>
        </div>
        <button type="button" className="primary big" disabled={!ready || busy} onClick={() => onCreate(name, { rounds, expertIcon })}>
          방 만들기
        </button>
      </section>

      <section className="card-panel">
        <h2>코드로 입장</h2>
        <input
          className="code-input"
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          placeholder="000000"
          aria-label="방 코드 6자리"
        />
        <button type="button" className="big" disabled={!ready || code.length !== 6 || busy} onClick={() => onJoin(code, name)}>
          입장하기
        </button>
      </section>

      <p className="hint">방을 만든 사람이 알려 준 숫자 6자리를 넣으면 같은 방에서 함께 놀 수 있어요.</p>
    </main>
  );
}
