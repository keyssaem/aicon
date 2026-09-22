import { describe, expect, it } from 'vitest';
import { act, actEvents, arrange, expectRejected, id, ids, newGame, specialOf } from './helpers';

// 별: 스마트 워치 1(YES) · 저금통 1(NO) · 망원경 2(NO) · 로봇 청소기 2(YES) · 서빙 로봇 3(YES) · 블랙박스 3(NO) · 알파고 4(YES)
const RUN_HAND = ['스마트 워치', '저금통', '망원경', '로봇 청소기', '서빙 로봇', '블랙박스', '알파고'];

describe('아이콘', () => {
  it('별 1-1-2-2-3-3은 거절하고, 1-2-3-4는 YES/NO가 섞여도 한 번에 낸다', () => {
    const s0 = arrange(newGame(3), { hands: { 0: RUN_HAND }, specials: { 0: ['ICON'] } });
    const icon = specialOf(s0, 0, 'ICON');
    expectRejected(
      s0,
      { type: 'USE_ICON', seat: 0, specialId: icon, cardIds: ids('스마트 워치', '저금통', '망원경', '로봇 청소기', '서빙 로봇', '블랙박스') },
      'ICON_NOT_CONSECUTIVE',
    );

    const { state, events } = actEvents(s0, {
      type: 'USE_ICON',
      seat: 0,
      specialId: icon,
      cardIds: ids('저금통', '로봇 청소기', '블랙박스', '알파고'),
    });
    // 기본 규칙: 아이콘 더미로 가고 검증 창 없이 차례가 끝납니다.
    expect(state.iconPile).toEqual(ids('저금통', '로봇 청소기', '블랙박스', '알파고'));
    expect(state.players[0]!.quest).toEqual(ids('스마트 워치', '망원경', '서빙 로봇'));
    expect(state.specialDiscard).toEqual([icon]);
    expect(state.players[0]!.specials).toEqual([]);
    expect(state.phase).toBe('DRAW');
    expect(state.active).toBe(1);
    expect(events.map((e) => e.type)).toEqual(['ICON_PLAYED', 'TURN_STARTED']);
  });

  it('3장보다 적거나 숫자가 끊기면 거절', () => {
    const s0 = arrange(newGame(3), { hands: { 0: RUN_HAND }, specials: { 0: ['ICON'] } });
    const icon = specialOf(s0, 0, 'ICON');
    expectRejected(s0, { type: 'USE_ICON', seat: 0, specialId: icon, cardIds: ids('저금통', '망원경') }, 'ICON_TOO_FEW');
    expectRejected(s0, { type: 'USE_ICON', seat: 0, specialId: icon, cardIds: ids('저금통', '망원경', '알파고') }, 'ICON_NOT_CONSECUTIVE');
  });

  it('아이콘 카드가 없거나 다른 스페셜카드로는 쓸 수 없다', () => {
    const s0 = arrange(newGame(3), { hands: { 0: RUN_HAND }, specials: { 0: ['ATTACK'], 1: ['ICON'] } });
    const cardIds = ids('저금통', '망원경', '서빙 로봇');
    expectRejected(s0, { type: 'USE_ICON', seat: 0, specialId: specialOf(s0, 0, 'ATTACK'), cardIds }, 'WRONG_SPECIAL_KIND');
    expectRejected(s0, { type: 'USE_ICON', seat: 0, specialId: specialOf(s0, 1, 'ICON'), cardIds }, 'SPECIAL_NOT_IN_HAND');
  });
});

describe('숙련자 아이콘 규칙 (영상 6:05)', () => {
  const hand = ['저금통', '로봇 청소기', '블랙박스', '알파고'];

  it('카드마다 베이스를 골라야 하고, 별 개수가 맞아야 한다', () => {
    const s0 = arrange(newGame(3, { expertIcon: true }), { hands: { 0: hand }, specials: { 0: ['ICON'] } });
    const icon = specialOf(s0, 0, 'ICON');
    const cardIds = ids('저금통', '로봇 청소기', '블랙박스');
    expectRejected(s0, { type: 'USE_ICON', seat: 0, specialId: icon, cardIds }, 'ICON_BASES_REQUIRED');
    expectRejected(s0, { type: 'USE_ICON', seat: 0, specialId: icon, cardIds, bases: ['NO1', 'YES2'] }, 'ICON_BASES_REQUIRED');
    expectRejected(s0, { type: 'USE_ICON', seat: 0, specialId: icon, cardIds, bases: ['NO1', 'YES3', 'NO3'] }, 'STARS_MISMATCH');
  });

  it('나눠 놓으면 검증 창이 열리고, 한 장이라도 틀리면 전부 손으로 돌아간다 (아이콘 카드는 사용한 것으로 남음)', () => {
    const s0 = arrange(newGame(3, { expertIcon: true }), { hands: { 0: hand }, specials: { 0: ['ICON'] } });
    const icon = specialOf(s0, 0, 'ICON');
    // 블랙박스(NO)를 Yes! ★3에 잘못 놓음
    const played = act(s0, {
      type: 'USE_ICON',
      seat: 0,
      specialId: icon,
      cardIds: ids('저금통', '로봇 청소기', '블랙박스'),
      bases: ['NO1', 'YES2', 'YES3'],
    });
    expect(played.phase).toBe('CHALLENGE');
    expect(played.bases.NO1.map((e) => e.cardId)).toEqual([id('저금통')]);
    expect(played.iconPile).toEqual([]);

    const state = act(played, { type: 'CHALLENGE', seat: 1 });
    expect(state.lastChallenge?.success).toBe(true);
    expect([...state.players[0]!.quest].sort()).toEqual(ids('알파고', '저금통', '로봇 청소기', '블랙박스').sort());
    expect([state.bases.NO1, state.bases.YES2, state.bases.YES3]).toEqual([[], [], []]);
    expect(state.specialDiscard).toEqual([icon]);
    expect(state.players[1]!.tokens).toBe(1);
  });
});

describe('공격과 방어', () => {
  it('방어 카드가 없어도 방어 창이 열리고, 공격을 받으면 퀘스트카드 3장을 가져간다', () => {
    const s0 = arrange(newGame(3), { hands: { 0: ['알파고'], 1: ['망원경'] }, specials: { 0: ['ATTACK'] } });
    const attack = specialOf(s0, 0, 'ATTACK');
    const declared = act(s0, { type: 'USE_ATTACK', seat: 0, specialId: attack, target: 1 });
    expect(declared.phase).toBe('DEFENSE');
    expect(declared.pending).toEqual({ kind: 'DEFENSE', attacker: 0, target: 1 });
    expect(declared.specialDiscard).toEqual([attack]);

    const { state, events } = actEvents(declared, { type: 'ACCEPT_ATTACK', seat: 1 });
    expect(state.players[1]!.quest).toHaveLength(4);
    expect(state.players[1]!.specials).toEqual([]);
    expect(events[0]).toMatchObject({ type: 'ATTACK_ACCEPTED', seat: 1, drawn: 3 });
    expect([state.phase, state.active]).toEqual(['DRAW', 1]);
  });

  it('방어하면 카드를 받지 않고, 공격·방어 카드 모두 버린 더미로 간다', () => {
    const s0 = arrange(newGame(3), { hands: { 0: ['알파고'], 1: ['망원경'] }, specials: { 0: ['ATTACK'], 1: ['DEFENSE'] } });
    const attack = specialOf(s0, 0, 'ATTACK');
    const defense = specialOf(s0, 1, 'DEFENSE');
    const declared = act(s0, { type: 'USE_ATTACK', seat: 0, specialId: attack, target: 1 });
    const state = act(declared, { type: 'DEFEND', seat: 1, specialId: defense });
    expect(state.players[1]!.quest).toEqual([id('망원경')]);
    expect(state.specialDiscard).toEqual([attack, defense]);
    expect(state.active).toBe(1);
  });

  it('공격받은 사람만 방어하거나 받을 수 있고, 자기 자신이나 없는 좌석은 공격할 수 없다', () => {
    const s0 = arrange(newGame(3), { hands: { 0: ['알파고'] }, specials: { 0: ['ATTACK'], 2: ['DEFENSE'] } });
    const attack = specialOf(s0, 0, 'ATTACK');
    expectRejected(s0, { type: 'USE_ATTACK', seat: 0, specialId: attack, target: 0 }, 'INVALID_TARGET');
    expectRejected(s0, { type: 'USE_ATTACK', seat: 0, specialId: attack, target: 3 }, 'INVALID_TARGET');

    const declared = act(s0, { type: 'USE_ATTACK', seat: 0, specialId: attack, target: 1 });
    expectRejected(declared, { type: 'DEFEND', seat: 2, specialId: specialOf(s0, 2, 'DEFENSE') }, 'NOT_TARGET');
    expectRejected(declared, { type: 'ACCEPT_ATTACK', seat: 2 }, 'NOT_TARGET');
    expectRejected(declared, { type: 'DEFEND', seat: 1, specialId: attack }, 'SPECIAL_NOT_IN_HAND');
  });

  it('방어 창에서 시간이 끝나면 공격을 받는다', () => {
    const s0 = arrange(newGame(3), { hands: { 0: ['알파고'], 1: ['망원경'] }, specials: { 0: ['ATTACK'], 1: ['DEFENSE'] } });
    const declared = act(s0, { type: 'USE_ATTACK', seat: 0, specialId: specialOf(s0, 0, 'ATTACK'), target: 1 });
    const state = act(declared, { type: 'TIMEOUT' });
    expect(state.players[1]!.quest).toHaveLength(4);
    expect(state.players[1]!.specials).toHaveLength(1);
  });

  it('방어 카드는 내 차례 행동으로 쓸 수 없다', () => {
    const s0 = arrange(newGame(3), { hands: { 0: ['알파고'] }, specials: { 0: ['DEFENSE'] } });
    const defense = specialOf(s0, 0, 'DEFENSE');
    expectRejected(s0, { type: 'DEFEND', seat: 0, specialId: defense }, 'WRONG_PHASE');
    expectRejected(s0, { type: 'USE_ATTACK', seat: 0, specialId: defense, target: 1 }, 'WRONG_SPECIAL_KIND');
  });
});

describe('재활용', () => {
  it('고른 베이스 더미의 맨 위 카드 1장을 손으로 가져온다', () => {
    const s0 = arrange(newGame(3), {
      hands: { 0: ['스마트 워치'] },
      specials: { 0: ['RECYCLE'] },
      bases: { YES3: ['서빙 로봇', '반려 로봇'] },
    });
    const recycle = specialOf(s0, 0, 'RECYCLE');
    const { state, events } = actEvents(s0, { type: 'USE_RECYCLE', seat: 0, specialId: recycle, base: 'YES3' });
    expect(state.players[0]!.quest).toEqual(ids('스마트 워치', '반려 로봇'));
    expect(state.bases.YES3.map((e) => e.cardId)).toEqual([id('서빙 로봇')]);
    expect(state.specialDiscard).toEqual([recycle]);
    expect(events[0]).toEqual({ type: 'CARD_RECYCLED', seat: 0, specialId: recycle, base: 'YES3', cardId: id('반려 로봇') });
    expect(state.active).toBe(1);
  });

  it('빈 베이스 더미에서는 가져올 수 없다 (아이콘 더미의 카드는 대상이 아님)', () => {
    const s0 = arrange(newGame(3), { hands: { 0: ['스마트 워치'] }, specials: { 0: ['RECYCLE'] }, iconPile: ['저금통'] });
    expectRejected(s0, { type: 'USE_RECYCLE', seat: 0, specialId: specialOf(s0, 0, 'RECYCLE'), base: 'NO1' }, 'PILE_EMPTY');
  });
});
