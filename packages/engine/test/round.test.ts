import { describe, expect, it } from 'vitest';
import { BASE_IDS } from '../src';
import { act, actEvents, arrange, expectRejected, id, newGame, passAll, specialOf } from './helpers';

describe('라운드 종료와 토큰', () => {
  it('마지막 카드를 맞게 내고 아무도 검증하지 않으면 라운드 종료: 1등 3개, 나머지는 적은 순 2·1·0', () => {
    const s0 = arrange(newGame(4), {
      hands: { 0: ['스마트 워치'], 1: ['망원경'], 2: ['텀블러', '자판기'], 3: ['알파고', '딥페이크', '홈 카메라'] },
    });
    let s = act(s0, { type: 'PLAY_QUEST', seat: 0, cardIds: [id('스마트 워치')], base: 'YES1' });
    s = act(s, { type: 'PASS', seat: 1 });
    s = act(s, { type: 'PASS', seat: 2 });
    const { state, events } = actEvents(s, { type: 'PASS', seat: 3 });

    expect(state.phase).toBe('ROUND_END');
    expect(state.players.map((p) => p.tokens)).toEqual([3, 2, 1, 0]);
    expect(state.history).toEqual([
      {
        round: 1,
        finisher: 0,
        entries: [
          { seat: 0, questLeft: 0, tokens: 3 },
          { seat: 1, questLeft: 1, tokens: 2 },
          { seat: 2, questLeft: 2, tokens: 1 },
          { seat: 3, questLeft: 3, tokens: 0 },
        ],
      },
    ]);
    expect(events.map((e) => e.type)).toEqual([
      'CHALLENGE_PASSED',
      'CHALLENGE_CLOSED',
      'ROUND_ENDED',
      'TOKENS_AWARDED',
      'TOKENS_AWARDED',
      'TOKENS_AWARDED',
    ]);
  });

  it('남은 장수가 같으면 같은 토큰, 다음 사람은 바로 다음 토큰 (2·2·1)', () => {
    const s0 = arrange(newGame(4), {
      hands: {
        0: ['스마트 워치'],
        1: ['망원경', '텀블러'],
        2: ['자판기', '아이스박스'],
        3: ['알파고', '딥페이크', '홈 카메라', '스마트 농장', '챗봇 상담 서비스'],
      },
    });
    const state = passAll(act(s0, { type: 'PLAY_QUEST', seat: 0, cardIds: [id('스마트 워치')], base: 'YES1' }));
    expect(state.players.map((p) => p.tokens)).toEqual([3, 2, 2, 1]);
  });

  it('검증에 실패해도 마지막 카드를 맞게 냈다면 라운드가 끝난다', () => {
    const s0 = arrange(newGame(3), { hands: { 0: ['스마트 워치'], 1: ['망원경'], 2: ['텀블러', '자판기'] } });
    const played = act(s0, { type: 'PLAY_QUEST', seat: 0, cardIds: [id('스마트 워치')], base: 'YES1' });
    const state = act(played, { type: 'CHALLENGE', seat: 1 });
    expect(state.phase).toBe('ROUND_END');
    expect(state.players.map((p) => p.tokens)).toEqual([3, 2, 1]);
  });

  it('마지막 카드를 틀리게 냈다가 검증당하면 카드가 돌아와 라운드가 계속된다', () => {
    const s0 = arrange(newGame(3), { hands: { 0: ['무선 청소기'], 1: ['망원경'], 2: ['텀블러'] } });
    const played = act(s0, { type: 'PLAY_QUEST', seat: 0, cardIds: [id('무선 청소기')], base: 'YES4' });
    expect(played.players[0]!.quest).toEqual([]);

    const state = act(played, { type: 'CHALLENGE', seat: 1 });
    expect([state.phase, state.round, state.active]).toEqual(['DRAW', 1, 1]);
    expect(state.history).toEqual([]);
    expect(state.players[0]!.quest).toEqual([id('무선 청소기')]);
    expect(state.players[1]!.tokens).toBe(1);
  });

  it('기본 아이콘으로 마지막 카드들을 내면 검증 창 없이 바로 라운드 종료', () => {
    const s0 = arrange(newGame(3), {
      hands: { 0: ['저금통', '로봇 청소기', '블랙박스'], 1: ['망원경'], 2: ['텀블러'] },
      specials: { 0: ['ICON'] },
    });
    const state = act(s0, { type: 'USE_ICON', seat: 0, specialId: specialOf(s0, 0, 'ICON'), cardIds: s0.players[0]!.quest });
    expect(state.phase).toBe('ROUND_END');
    expect(state.players.map((p) => p.tokens)).toEqual([3, 2, 2]);
  });

  it('다음 라운드: 첫 차례는 앞 라운드 첫 차례의 다음 사람, 토큰은 유지, 카드는 새로 받고 쉬기는 초기화', () => {
    const s0 = arrange(newGame(3), {
      hands: { 0: ['스마트 워치'], 1: ['망원경'], 2: ['텀블러', '자판기'] },
      skip: { 2: 1 },
      tokens: { 1: 4 },
    });
    const ended = passAll(act(s0, { type: 'PLAY_QUEST', seat: 0, cardIds: [id('스마트 워치')], base: 'YES1' }));
    expect(ended.phase).toBe('ROUND_END');
    expectRejected(ended, { type: 'DRAW', seat: 1, source: 'QUEST' }, 'WRONG_PHASE');

    const { state, events } = actEvents(ended, { type: 'NEXT_ROUND' });
    expect([state.round, state.firstSeat, state.active, state.phase]).toEqual([2, 1, 1, 'DRAW']);
    expect(state.players.map((p) => p.tokens)).toEqual([3, 6, 1]);
    for (const p of state.players) {
      expect(p.quest).toHaveLength(6);
      expect(p.specials).toHaveLength(1);
      expect(p.skip).toBe(0);
    }
    for (const base of BASE_IDS) expect(state.bases[base]).toEqual([]);
    expect(events[0]).toEqual({ type: 'ROUND_STARTED', round: 2, firstSeat: 1 });
  });

  it('마지막 라운드가 끝나면 게임 종료, 최다 토큰이 같으면 공동 우승', () => {
    const s0 = arrange(newGame(2, { rounds: 1 }), { hands: { 0: ['스마트 워치'], 1: ['망원경'] }, tokens: { 1: 1 } });
    const played = act(s0, { type: 'PLAY_QUEST', seat: 0, cardIds: [id('스마트 워치')], base: 'YES1' });
    const { state, events } = actEvents(played, { type: 'PASS', seat: 1 });

    expect(state.phase).toBe('GAME_END');
    expect(state.players.map((p) => p.tokens)).toEqual([3, 3]);
    expect(state.winners).toEqual([0, 1]);
    expect(events.at(-1)).toEqual({ type: 'GAME_ENDED', winners: [0, 1], tokens: [3, 3] });
    expectRejected(state, { type: 'NEXT_ROUND' }, 'GAME_OVER');
    expectRejected(state, { type: 'TIMEOUT' }, 'GAME_OVER');
  });

  it('최다 토큰이 한 명이면 단독 우승', () => {
    const s0 = arrange(newGame(3, { rounds: 1 }), { hands: { 0: ['스마트 워치'], 1: ['망원경'], 2: ['텀블러'] } });
    const state = passAll(act(s0, { type: 'PLAY_QUEST', seat: 0, cardIds: [id('스마트 워치')], base: 'YES1' }));
    expect(state.winners).toEqual([0]);
  });

  it('라운드 중에는 NEXT_ROUND가, 라운드 정산 화면에서는 TIMEOUT이 거절된다', () => {
    const playing = arrange(newGame(3), { hands: { 0: ['스마트 워치', '망원경'] } });
    expectRejected(playing, { type: 'NEXT_ROUND' }, 'WRONG_PHASE');

    const s0 = arrange(newGame(3), { hands: { 0: ['스마트 워치'], 1: ['망원경'], 2: ['텀블러'] } });
    const ended = passAll(act(s0, { type: 'PLAY_QUEST', seat: 0, cardIds: [id('스마트 워치')], base: 'YES1' }));
    expect(ended.phase).toBe('ROUND_END');
    expectRejected(ended, { type: 'TIMEOUT' }, 'NOTHING_TO_TIMEOUT');
  });
});
