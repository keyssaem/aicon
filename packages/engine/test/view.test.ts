import { describe, expect, it } from 'vitest';
import { createGame, eventsFor, reduce, viewFor } from '../src';
import { randomFn } from '../src/rng';
import { randomAction } from '../src/sim';
import { NAMES, act, arrange, id, newGame } from './helpers';

describe('시점 필터 (viewFor · eventsFor)', () => {
  it('정답표 · 난수 · 시드 · 더미 내용 · 남의 손패가 들어가지 않는다', () => {
    const state = newGame(4);
    const view = viewFor(state, 1);
    const json = JSON.stringify(view);

    for (const key of ['"catalog"', '"answers"', '"rng"', '"seed"', '"questDeck"', '"specialDeck"']) {
      expect(json).not.toContain(key);
    }
    expect(view.me?.quest).toEqual(state.players[1]!.quest);
    state.players.forEach((p, seat) => {
      if (seat === 1) return;
      for (const cardId of [...p.quest, ...p.specials]) expect(json).not.toContain(`"${cardId}"`);
    });
    for (const cardId of [...state.questDeck, ...state.specialDeck]) expect(json).not.toContain(`"${cardId}"`);
    expect(view.players[0]).toEqual({ seat: 0, name: '지우', tokens: 0, skip: 0, questCount: 6, specialCount: 1 });
    expect([view.questDeckCount, view.specialDeckCount]).toEqual([26, 10]);
  });

  it('관전자에게는 손패가 없고, 없는 좌석은 예외', () => {
    const state = newGame(3);
    expect(viewFor(state, 'spectator').me).toBeNull();
    expect(() => viewFor(state, 5)).toThrow();
  });

  it('검증으로 공개된 정답은 지금 그 좌석 눈에 보이는 카드 것만 알려 준다', () => {
    const s0 = arrange(newGame(3), { active: 1, hands: { 0: ['망원경'], 1: ['무선 청소기', '스마트 워치'], 2: ['서빙 로봇'] } });
    const played = act(s0, { type: 'PLAY_QUEST', seat: 1, cardIds: [id('무선 청소기')], base: 'YES4' });
    const state = act(played, { type: 'CHALLENGE', seat: 0 });
    // 무선 청소기는 좌석1 손으로 돌아갔으므로 좌석1에게만 known으로 보입니다.
    expect(viewFor(state, 1).known).toEqual({ [id('무선 청소기')]: 'NO' });
    expect(viewFor(state, 0).known).toEqual({});
    // 공개 순간의 결과 자체는 모두가 봅니다.
    expect(viewFor(state, 0).lastChallenge?.reveals[0]?.actual).toBe('NO');
  });

  it('이벤트의 카드 ID(secret)는 해당 좌석에게만 남긴다', () => {
    const { events } = createGame({ players: NAMES.slice(0, 3), seed: 3, firstSeat: 0 });
    const dealt = eventsFor(events, 1).filter((e) => e.type === 'CARDS_DEALT');
    expect(dealt.map((e) => 'secret' in e && e.secret !== undefined)).toEqual([false, true, false]);
    expect(eventsFor(events, 'spectator').some((e) => 'secret' in e && e.secret !== undefined)).toBe(false);
  });

  it('무작위 게임 40판 내내 남의 손패와 더미 속 카드 ID가 화면 상태에 새지 않는다', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      let state = createGame({ players: NAMES, seed }).state;
      const rand = randomFn(seed * 7919);
      for (let step = 0; step < 5000 && state.phase !== 'GAME_END'; step += 1) {
        const action = randomAction(state, rand);
        if (!action) break;
        const result = reduce(state, action);
        if (!result.ok) throw new Error(result.error.code);
        state = result.state;
        if (step % 3 !== 0) continue;

        // 방금 놓였거나 검증으로 공개된 카드는 모두가 이미 본 카드입니다.
        const seen = new Set<string>([
          ...(state.lastPlay?.items.map((item) => item.cardId) ?? []),
          ...(state.lastChallenge?.reveals.map((r) => r.cardId) ?? []),
        ]);
        for (let viewer = 0; viewer < NAMES.length; viewer += 1) {
          const json = JSON.stringify(viewFor(state, viewer));
          const hidden = [
            ...state.questDeck,
            ...state.specialDeck,
            ...state.players.flatMap((p, seat) => (seat === viewer ? [] : [...p.quest, ...p.specials])),
          ];
          for (const cardId of hidden) {
            if (!seen.has(cardId)) expect(json).not.toContain(`"${cardId}"`);
          }
        }
      }
    }
  });
});
