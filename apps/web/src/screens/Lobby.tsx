import type { RoomOptions, RoomState } from '@aicon/protocol';

interface LobbyProps {
  room: RoomState;
  busy: boolean;
  notice: string | null;
  onStart: () => void;
  onOptions: (options: Partial<RoomOptions>) => void;
  onKick: (seat: number) => void;
  onLeave: () => void;
}

export function Lobby({ room, busy, notice, onStart, onOptions, onKick, onLeave }: LobbyProps) {
  const isHost = room.you === room.hostSeat;
  const link = `${window.location.origin}/?code=${room.code}`;
  const seats = [0, 1, 2, 3];

  return (
    <main className="lobby">
      <header className="lobby-head">
        <p className="label">방 코드</p>
        <p className="code">{room.code}</p>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(link);
          }}
        >
          입장 링크 복사
        </button>
      </header>

      {notice ? <p className="notice">{notice}</p> : null}

      <section className="seats">
        {seats.map((seat) => {
          const player = room.players.find((p) => p.seat === seat);
          return (
            <div key={seat} className={`seat ${player ? 'is-taken' : ''} ${player?.seat === room.you ? 'is-me' : ''}`}>
              {player ? (
                <>
                  <b>{player.name}</b>
                  <span className="tags">
                    {player.seat === room.hostSeat ? <em>방장</em> : null}
                    {player.seat === room.you ? <em>나</em> : null}
                    {!player.connected ? <em className="warn">연결 끊김</em> : null}
                  </span>
                  {isHost && player.seat !== room.you ? (
                    <button type="button" className="small" onClick={() => onKick(player.seat)}>
                      내보내기
                    </button>
                  ) : null}
                </>
              ) : (
                <span className="empty">기다리는 중…</span>
              )}
            </div>
          );
        })}
      </section>

      <section className="card-panel">
        <h2>게임 설정</h2>
        {isHost ? (
          <div className="row">
            <label className="inline">
              라운드
              <select value={room.options.rounds} onChange={(event) => onOptions({ rounds: Number(event.target.value) })}>
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>{n}라운드</option>
                ))}
              </select>
            </label>
            <label className="inline">
              검증 시간
              <select value={room.options.challengeSec} onChange={(event) => onOptions({ challengeSec: Number(event.target.value) })}>
                {[5, 10, 15, 20].map((n) => (
                  <option key={n} value={n}>{n}초</option>
                ))}
              </select>
            </label>
            <label className="inline">
              <input
                type="checkbox"
                checked={room.options.expertIcon}
                onChange={(event) => onOptions({ expertIcon: event.target.checked })}
              />
              숙련자 아이콘 규칙
            </label>
          </div>
        ) : (
          <p className="hint">
            {room.options.rounds}라운드 · 검증 {room.options.challengeSec}초
            {room.options.expertIcon ? ' · 숙련자 아이콘 규칙' : ''}
          </p>
        )}
      </section>

      <div className="lobby-actions">
        {isHost ? (
          <button type="button" className="primary big" disabled={room.players.length < 2 || busy} onClick={onStart}>
            {room.players.length < 2 ? '2명 이상 모여야 시작해요' : `게임 시작 (${room.players.length}명)`}
          </button>
        ) : (
          <p className="waiting">방장이 시작하기를 기다리는 중…</p>
        )}
        <button type="button" onClick={onLeave}>나가기</button>
      </div>
    </main>
  );
}
