import { useRef, useState } from 'react';
import type { AppError, GameSnapshot, RoomOptions, RoomState } from '@aicon/protocol';
import { describeEvent } from '@aicon/ui';
import { GameClient, type ConnectionStatus } from './net';
import { GameScreen } from './screens/GameScreen';
import { Home } from './screens/Home';
import { Lobby } from './screens/Lobby';

export default function App() {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [room, setRoom] = useState<RoomState | null>(null);
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const namesRef = useRef<string[]>([]);
  const seqRef = useRef(-1);
  const clientRef = useRef<GameClient | null>(null);

  if (!clientRef.current) {
    clientRef.current = new GameClient({
      onStatus: setStatus,
      onRoom: (state) => {
        namesRef.current = state.players.map((player) => player.name);
        setRoom(state);
      },
      // 늦게 도착한 화면은 무시합니다 (버전 번호 비교).
      onView: (next) => setSnapshot((prev) => (prev && next.view.seq < prev.view.seq ? prev : next)),
      onEvents: (batch) => {
        if (batch.seq <= seqRef.current) return;
        seqRef.current = batch.seq;
        const lines = batch.events.map((event) => describeEvent(event, namesRef.current, true));
        setLog((prev) => [...prev, ...lines].slice(-200));
      },
      onClosed: (reason) => {
        setRoom(null);
        setSnapshot(null);
        setLog([]);
        seqRef.current = -1;
        setNotice(reason);
      },
    });
  }
  const client = clientRef.current;

  const run = async (task: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    try {
      await task();
      setNotice(null);
    } catch (error) {
      setNotice((error as AppError)?.message ?? '문제가 생겼어요.');
    } finally {
      setBusy(false);
    }
  };

  const leave = () => {
    void run(async () => {
      await client.leave();
      setRoom(null);
      setSnapshot(null);
      setLog([]);
      seqRef.current = -1;
    });
  };

  const banner =
    status === 'online' ? null : (
      <div className="banner">{status === 'offline' ? '연결이 끊겼어요. 다시 연결하는 중…' : '연결하는 중…'}</div>
    );

  return (
    <div className="app">
      {banner}
      {!room ? (
        <Home
          busy={busy}
          notice={notice}
          onCreate={(nickname, options: Partial<RoomOptions>) => void run(() => client.create(nickname, options))}
          onJoin={(code, nickname) => void run(() => client.join(code, nickname))}
        />
      ) : room.status === 'LOBBY' ? (
        <Lobby
          room={room}
          busy={busy}
          notice={notice}
          onStart={() => void run(() => client.start())}
          onOptions={(options) => void run(() => client.setOptions(options))}
          onKick={(seat) => void run(() => client.kick(seat))}
          onLeave={leave}
        />
      ) : (
        <GameScreen
          room={room}
          snapshot={snapshot}
          log={log}
          notice={notice}
          onAction={(action) => void run(() => client.action(action))}
          onLeave={leave}
        />
      )}
    </div>
  );
}
