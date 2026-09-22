import { describe, expect, it } from 'vitest';
import { checkInvariants, createGame } from '../src';
import { NAMES } from './helpers';

describe('게임 준비', () => {
  it.each([2, 3, 4])('%i명: 각자 퀘스트 6장 + 스페셜 1장, 첫 차례는 먹기 단계', (players) => {
    const { state, events } = createGame({ players: NAMES.slice(0, players), seed: 7, firstSeat: 1 });
    expect(state.phase).toBe('DRAW');
    expect(state.active).toBe(1);
    expect(state.round).toBe(1);
    for (const p of state.players) {
      expect(p.quest).toHaveLength(6);
      expect(p.specials).toHaveLength(1);
      expect(p.tokens).toBe(0);
    }
    expect(state.questDeck).toHaveLength(50 - 6 * players);
    expect(state.specialDeck).toHaveLength(14 - players);
    expect(checkInvariants(state)).toEqual([]);
    expect(events.filter((e) => e.type === 'CARDS_DEALT')).toHaveLength(players);
  });

  it('같은 시드면 같은 배분, 다른 시드면 다른 배분', () => {
    const a = createGame({ players: NAMES, seed: 2026, firstSeat: 0 }).state;
    const b = createGame({ players: NAMES, seed: 2026, firstSeat: 0 }).state;
    const c = createGame({ players: NAMES, seed: 2027, firstSeat: 0 }).state;
    expect(b.players.map((p) => p.quest)).toEqual(a.players.map((p) => p.quest));
    expect(c.players.map((p) => p.quest)).not.toEqual(a.players.map((p) => p.quest));
  });

  it('첫 차례를 정하지 않으면 시드 난수로 정한다', () => {
    const seats = new Set<number>();
    for (let seed = 1; seed <= 40; seed += 1) {
      const { state } = createGame({ players: NAMES, seed });
      expect(state.active).toBe(state.firstSeat);
      seats.add(state.firstSeat);
    }
    expect(seats.size).toBeGreaterThan(1);
  });

  it('인원·닉네임·라운드·첫 차례 설정이 잘못되면 예외', () => {
    expect(() => createGame({ players: ['혼자'], seed: 1 })).toThrow();
    expect(() => createGame({ players: [...NAMES, '다섯째'], seed: 1 })).toThrow();
    expect(() => createGame({ players: ['지우', ' '], seed: 1 })).toThrow();
    expect(() => createGame({ players: NAMES, seed: 1, options: { rounds: 0 } })).toThrow();
    expect(() => createGame({ players: NAMES, seed: 1, firstSeat: 4 })).toThrow();
  });
});
