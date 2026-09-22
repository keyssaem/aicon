import { describe, expect, it } from 'vitest';
import { act, actEvents, arrange, expectRejected, id, ids, newGame } from './helpers';

describe('먹기', () => {
  it('퀘스트 더미 맨 위 1장을 먹고 내기 단계로 넘어간다', () => {
    const s0 = arrange(newGame(3), { phase: 'DRAW', hands: { 0: ['알파고'] }, deckTop: ['망원경'] });
    const { state, events } = actEvents(s0, { type: 'DRAW', seat: 0, source: 'QUEST' });
    expect(state.phase).toBe('ACT');
    expect(state.players[0]!.quest).toEqual(ids('알파고', '망원경'));
    expect(events).toEqual([{ type: 'CARD_DRAWN', seat: 0, source: 'QUEST', secret: { seat: 0, cardIds: [id('망원경')] } }]);
  });

  it('스페셜을 3장 가지고 있으면 스페셜 더미에서 먹을 수 없고, 2장이면 먹을 수 있다', () => {
    const full = arrange(newGame(3), { phase: 'DRAW', hands: { 0: ['알파고'] }, specials: { 0: ['ICON', 'ATTACK', 'RECYCLE'] } });
    expectRejected(full, { type: 'DRAW', seat: 0, source: 'SPECIAL' }, 'SPECIAL_LIMIT');

    const two = arrange(newGame(3), { phase: 'DRAW', hands: { 0: ['알파고'] }, specials: { 0: ['ICON', 'ATTACK'] } });
    expect(act(two, { type: 'DRAW', seat: 0, source: 'SPECIAL' }).players[0]!.specials).toHaveLength(3);
  });

  it('내 차례가 아니거나 먹기 단계가 아니면 먹을 수 없다', () => {
    const s0 = arrange(newGame(3), { phase: 'DRAW', hands: { 0: ['알파고'] } });
    expectRejected(s0, { type: 'DRAW', seat: 1, source: 'QUEST' }, 'NOT_YOUR_TURN');
    const acting = act(s0, { type: 'DRAW', seat: 0, source: 'QUEST' });
    expectRejected(acting, { type: 'DRAW', seat: 0, source: 'QUEST' }, 'WRONG_PHASE');
  });
});

describe('퀘스트카드 내려놓기', () => {
  it('영상 3:52 — No! ★5 두 장을 한 번에 내려놓으면 검증 창이 열린다', () => {
    const s0 = arrange(newGame(3), { hands: { 0: ['미세먼지 필터 마스크', '헤드 마운트 디스플레이', '공항 안내 로봇'] } });
    const { state, events } = actEvents(s0, {
      type: 'PLAY_QUEST',
      seat: 0,
      cardIds: ids('미세먼지 필터 마스크', '헤드 마운트 디스플레이'),
      base: 'NO5',
    });
    expect(state.phase).toBe('CHALLENGE');
    expect(state.bases.NO5.map((e) => e.cardId)).toEqual(ids('미세먼지 필터 마스크', '헤드 마운트 디스플레이'));
    expect(state.players[0]!.quest).toEqual(ids('공항 안내 로봇'));
    expect(state.pending).toMatchObject({ kind: 'CHALLENGE', eligible: [1, 2], passed: [] });
    expect(events.map((e) => e.type)).toEqual(['QUEST_PLAYED', 'CHALLENGE_OPENED']);
  });

  it('YES/NO를 틀리게 내도 내려놓기 자체는 허용한다 (검증으로 가린다)', () => {
    const s0 = arrange(newGame(3), { hands: { 0: ['무선 청소기', '알파고'] } });
    const state = act(s0, { type: 'PLAY_QUEST', seat: 0, cardIds: [id('무선 청소기')], base: 'YES4' });
    expect(state.bases.YES4.map((e) => e.cardId)).toEqual([id('무선 청소기')]);
  });

  it('별 개수가 다른 베이스나 별 개수가 섞인 카드는 거절', () => {
    const s0 = arrange(newGame(3), { hands: { 0: ['알파고', '서빙 로봇'] } });
    expectRejected(s0, { type: 'PLAY_QUEST', seat: 0, cardIds: [id('알파고')], base: 'YES3' }, 'STARS_MISMATCH');
    expectRejected(s0, { type: 'PLAY_QUEST', seat: 0, cardIds: ids('알파고', '서빙 로봇'), base: 'YES4' }, 'STARS_MISMATCH');
  });

  it('손에 없는 카드 · 같은 카드 두 번 · 빈 선택 · 없는 베이스는 거절', () => {
    const s0 = arrange(newGame(3), { hands: { 0: ['알파고', '딥페이크'], 1: ['홈 카메라'] } });
    expectRejected(s0, { type: 'PLAY_QUEST', seat: 0, cardIds: [id('홈 카메라')], base: 'YES4' }, 'CARD_NOT_IN_HAND');
    expectRejected(s0, { type: 'PLAY_QUEST', seat: 0, cardIds: ids('알파고', '알파고'), base: 'YES4' }, 'DUPLICATE_CARD');
    expectRejected(s0, { type: 'PLAY_QUEST', seat: 0, cardIds: [], base: 'YES4' }, 'NO_CARDS_SELECTED');
    expectRejected(s0, { type: 'PLAY_QUEST', seat: 0, cardIds: [id('알파고')], base: 'MAYBE4' as never }, 'INVALID_BASE');
  });

  it('먹기 전이나 남의 차례에는 낼 수 없다', () => {
    const drawing = arrange(newGame(3), { phase: 'DRAW', hands: { 0: ['알파고'] } });
    expectRejected(drawing, { type: 'PLAY_QUEST', seat: 0, cardIds: [id('알파고')], base: 'YES4' }, 'WRONG_PHASE');
    const acting = arrange(newGame(3), { hands: { 0: ['알파고'], 1: ['딥페이크'] } });
    expectRejected(acting, { type: 'PLAY_QUEST', seat: 1, cardIds: [id('딥페이크')], base: 'YES4' }, 'NOT_YOUR_TURN');
  });
});

describe('차례 시간 초과 (접속이 끊겼거나 턴 제한시간이 끝났을 때)', () => {
  it('먹기 단계에서 시간이 끝나면 퀘스트 1장을 자동으로 먹고 차례를 넘긴다', () => {
    const s0 = arrange(newGame(3), { phase: 'DRAW', hands: { 0: ['알파고'] }, deckTop: ['망원경'] });
    const { state, events } = actEvents(s0, { type: 'TIMEOUT' });
    expect(state.players[0]!.quest).toEqual(ids('알파고', '망원경'));
    expect(events.map((e) => e.type)).toEqual(['CARD_DRAWN', 'TURN_TIMED_OUT', 'TURN_STARTED']);
    expect([state.phase, state.active]).toEqual(['DRAW', 1]);
  });

  it('내기 단계에서 시간이 끝나면 카드를 내지 않고 차례만 넘긴다', () => {
    const s0 = arrange(newGame(3), { hands: { 0: ['알파고'] } });
    const { state, events } = actEvents(s0, { type: 'TIMEOUT' });
    expect(state.players[0]!.quest).toEqual(ids('알파고'));
    expect(events.map((e) => e.type)).toEqual(['TURN_TIMED_OUT', 'TURN_STARTED']);
    expect(state.active).toBe(1);
  });
});
