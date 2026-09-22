import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createGame, reduce } from '../src';
import { randomFn } from '../src/rng';
import { randomAction, simulateGame } from '../src/sim';
import { NAMES, deepFreeze } from './helpers';

describe('무작위 게임 속성 테스트', () => {
  it('1,000판: 카드 64장이 중복·소실되지 않고, 모든 불변 조건이 유지되며, 모든 게임이 끝난다', () => {
    let games = 0;
    let actions = 0;
    let challenges = 0;
    fc.assert(
      fc.property(fc.nat(), fc.integer({ min: 2, max: 4 }), fc.boolean(), (seed, players, expertIcon) => {
        const result = simulateGame({ seed, players, options: { expertIcon }, checkEachStep: true });
        games += 1;
        actions += result.actions.length;
        challenges += result.events.filter((e) => e.type === 'CHALLENGE_RESOLVED').length;
        expect(result.problems).toEqual([]);
        expect(result.rejected).toEqual([]);
        expect(result.finished).toBe(true);
      }),
      { numRuns: 1000 },
    );
    expect(games).toBe(1000);
    // 무작위 행동이 규칙의 여러 갈래를 실제로 지나갔는지 대략 확인
    expect(actions / games).toBeGreaterThan(30);
    expect(challenges).toBeGreaterThan(1000);
  }, 600_000);

  it('같은 시드와 같은 행동 기록이면 언제나 같은 결과 (다시보기 · 버그 재현)', () => {
    const first = simulateGame({ seed: 12345, players: 4 });
    const second = simulateGame({ seed: 12345, players: 4 });
    expect(JSON.stringify(second.state)).toBe(JSON.stringify(first.state));

    let replayed = createGame({ players: NAMES, seed: 12345 }).state;
    for (const action of first.actions) {
      const result = reduce(replayed, action);
      if (!result.ok) throw new Error(result.error.code);
      replayed = result.state;
    }
    expect(JSON.stringify(replayed)).toBe(JSON.stringify(first.state));
  });

  it('reduce는 입력 상태를 절대 바꾸지 않는다 (깊게 얼린 상태로 끝까지 진행)', () => {
    for (const seed of [11, 22, 33]) {
      let state = deepFreeze(createGame({ players: NAMES, seed, options: { expertIcon: seed === 22 } }).state);
      const rand = randomFn(seed);
      while (state.phase !== 'GAME_END') {
        const before = JSON.stringify(state);
        const action = randomAction(state, rand);
        if (!action) break;
        const result = reduce(state, action);
        expect(result.ok).toBe(true);
        expect(JSON.stringify(state)).toBe(before);
        if (result.ok) state = deepFreeze(result.state);
      }
      expect(state.phase).toBe('GAME_END');
    }
  });
});
