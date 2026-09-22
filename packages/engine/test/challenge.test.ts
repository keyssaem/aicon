import { describe, expect, it } from 'vitest';
import { act, actEvents, arrange, expectRejected, id, ids, newGame, passAll } from './helpers';

describe('검증', () => {
  it('영상 5:07 — 무선 청소기를 Yes! ★4에 냈다가 검증당하면 검증한 사람 토큰 +1, 카드는 낸 사람 손으로', () => {
    const s0 = arrange(newGame(3), {
      active: 1,
      hands: { 0: ['망원경'], 1: ['무선 청소기', '스마트 워치'], 2: ['서빙 로봇'] },
    });
    const played = act(s0, { type: 'PLAY_QUEST', seat: 1, cardIds: [id('무선 청소기')], base: 'YES4' });
    const { state, events } = actEvents(played, { type: 'CHALLENGE', seat: 0 });

    expect(state.players[0]!.tokens).toBe(1);
    expect(state.players[1]!.quest).toEqual(ids('스마트 워치', '무선 청소기'));
    expect(state.bases.YES4).toEqual([]);
    expect(state.lastChallenge).toMatchObject({
      success: true,
      challenger: 0,
      offender: 1,
      reveals: [{ cardId: id('무선 청소기'), declared: 'YES', actual: 'NO' }],
    });
    expect(state.known[id('무선 청소기')]).toBe('NO');
    expect(state.phase).toBe('DRAW');
    expect(state.active).toBe(2);
    expect(events.map((e) => e.type)).toEqual(['CHALLENGE_RESOLVED', 'TOKENS_AWARDED', 'TURN_STARTED']);
  });

  it('여러 장 중 한 장만 틀려도 검증 성공: 토큰은 1개, 묶음 전체가 손으로 돌아간다', () => {
    const s0 = arrange(newGame(3), { hands: { 0: ['알파고', '무선 청소기', '딥페이크', '저금통'] } });
    const played = act(s0, { type: 'PLAY_QUEST', seat: 0, cardIds: ids('알파고', '무선 청소기', '딥페이크'), base: 'YES4' });
    const state = act(played, { type: 'CHALLENGE', seat: 2 });

    expect(state.lastChallenge?.success).toBe(true);
    expect(state.lastChallenge?.reveals.map((r) => r.actual)).toEqual(['YES', 'NO', 'YES']);
    expect(state.players[2]!.tokens).toBe(1);
    expect([...state.players[0]!.quest].sort()).toEqual(ids('저금통', '알파고', '무선 청소기', '딥페이크').sort());
    expect(state.bases.YES4).toEqual([]);
  });

  it('모두 맞게 냈는데 검증하면 실패: 검증한 사람은 다음 차례를 한 번 쉰다', () => {
    const s0 = arrange(newGame(3), { hands: { 0: ['알파고', '저금통'], 1: ['망원경'], 2: ['텀블러'] } });
    const played = act(s0, { type: 'PLAY_QUEST', seat: 0, cardIds: [id('알파고')], base: 'YES4' });
    const { state, events } = actEvents(played, { type: 'CHALLENGE', seat: 1 });

    expect(state.lastChallenge?.success).toBe(false);
    expect(state.bases.YES4.map((e) => e.cardId)).toEqual([id('알파고')]);
    expect(state.players[1]!.tokens).toBe(0);
    // 좌석 0 다음은 좌석 1이지만 쉬므로 좌석 2의 차례
    expect(state.active).toBe(2);
    expect(state.players[1]!.skip).toBe(0);
    expect(events.map((e) => e.type)).toEqual(['CHALLENGE_RESOLVED', 'SKIP_ADDED', 'TURN_SKIPPED', 'TURN_STARTED']);
  });

  it('쉬는 중인 사람도 검증할 수 있다', () => {
    const s0 = arrange(newGame(3), { hands: { 0: ['무선 마우스', '저금통'], 1: ['망원경'], 2: ['텀블러'] }, skip: { 2: 1 } });
    const played = act(s0, { type: 'PLAY_QUEST', seat: 0, cardIds: [id('무선 마우스')], base: 'YES3' });
    const state = act(played, { type: 'CHALLENGE', seat: 2 });
    expect(state.lastChallenge).toMatchObject({ success: true, challenger: 2 });
    expect(state.players[2]!.tokens).toBe(1);
  });

  it('카드를 낸 사람은 자기 카드를 검증하거나 통과할 수 없다', () => {
    const s0 = arrange(newGame(3), { hands: { 0: ['알파고', '저금통'] } });
    const played = act(s0, { type: 'PLAY_QUEST', seat: 0, cardIds: [id('알파고')], base: 'YES4' });
    expectRejected(played, { type: 'CHALLENGE', seat: 0 }, 'NOT_ELIGIBLE');
    expectRejected(played, { type: 'PASS', seat: 0 }, 'NOT_ELIGIBLE');
  });

  it('모두 통과하면 검증 없이 다음 사람 차례, 통과한 사람은 다시 누를 수 없다', () => {
    const s0 = arrange(newGame(3), { hands: { 0: ['알파고', '저금통'] } });
    let s = act(s0, { type: 'PLAY_QUEST', seat: 0, cardIds: [id('알파고')], base: 'YES4' });
    s = act(s, { type: 'PASS', seat: 2 });
    expectRejected(s, { type: 'PASS', seat: 2 }, 'ALREADY_PASSED');
    expectRejected(s, { type: 'CHALLENGE', seat: 2 }, 'ALREADY_PASSED');

    const { state, events } = actEvents(s, { type: 'PASS', seat: 1 });
    expect(events.map((e) => e.type)).toEqual(['CHALLENGE_PASSED', 'CHALLENGE_CLOSED', 'TURN_STARTED']);
    expect(state.active).toBe(1);
    expect(state.lastChallenge).toBeNull();
  });

  it('시간이 끝나면 검증 없이 넘어간다', () => {
    const s0 = arrange(newGame(3), { hands: { 0: ['알파고', '저금통'] } });
    const played = act(s0, { type: 'PLAY_QUEST', seat: 0, cardIds: [id('알파고')], base: 'NO4' });
    const { state, events } = actEvents(played, { type: 'TIMEOUT' });
    expect(events[0]).toEqual({ type: 'CHALLENGE_CLOSED', playId: played.lastPlay!.id, reason: 'TIMEOUT' });
    expect(state.bases.NO4.map((e) => e.cardId)).toEqual([id('알파고')]);
    expect(state.phase).toBe('DRAW');
  });

  it('쉬기가 두 번 쌓이면 그 사람의 차례를 두 번 건너뛴다', () => {
    const s0 = arrange(newGame(2), {
      hands: { 0: ['알파고', '딥페이크', '홈 카메라', '저금통'], 1: ['망원경', '텀블러'] },
      skip: { 1: 2 },
    });
    let s = passAll(act(s0, { type: 'PLAY_QUEST', seat: 0, cardIds: [id('알파고')], base: 'YES4' }));
    expect([s.active, s.players[1]!.skip]).toEqual([0, 1]);

    s = act(s, { type: 'DRAW', seat: 0, source: 'QUEST' });
    s = passAll(act(s, { type: 'PLAY_QUEST', seat: 0, cardIds: [id('딥페이크')], base: 'YES4' }));
    expect([s.active, s.players[1]!.skip]).toEqual([0, 0]);

    s = act(s, { type: 'DRAW', seat: 0, source: 'QUEST' });
    s = passAll(act(s, { type: 'PLAY_QUEST', seat: 0, cardIds: [id('홈 카메라')], base: 'YES4' }));
    expect(s.active).toBe(1);
  });
});
