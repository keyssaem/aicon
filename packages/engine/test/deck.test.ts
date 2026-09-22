import { describe, expect, it } from 'vitest';
import { BASE_IDS } from '../src';
import { act, actEvents, arrange, newGame, specialOf } from './helpers';

describe('더미 소진 (영상 4:25)', () => {
  it('퀘스트 더미가 비면 베이스 위 카드와 아이콘 더미를 섞어 새 더미를 만든다', () => {
    // 손패 7장(좌석0 1장 + 나머지 두 좌석 3장씩), 아이콘 더미 3장, 나머지 40장은 베이스 위
    const s0 = arrange(newGame(3), {
      phase: 'DRAW',
      hands: { 0: ['알파고'] },
      iconPile: ['저금통', '망원경', '서빙 로봇'],
      rest: 'bases',
    });
    const { state, events } = actEvents(s0, { type: 'DRAW', seat: 0, source: 'QUEST' });
    expect(events[0]).toEqual({ type: 'DECK_REBUILT', deck: 'QUEST', count: 43 });
    expect(state.iconPile).toEqual([]);
    for (const base of BASE_IDS) expect(state.bases[base]).toEqual([]);
    expect(state.questDeck).toHaveLength(42);
    expect(state.players[0]!.quest).toHaveLength(2);
  });

  it('스페셜 더미가 비면 버린 스페셜을 섞어 새 더미를 만든다', () => {
    const s0 = arrange(newGame(3), { phase: 'DRAW', hands: { 0: ['알파고'] }, specialRest: 'discard' });
    const { state, events } = actEvents(s0, { type: 'DRAW', seat: 0, source: 'SPECIAL' });
    expect(events[0]).toEqual({ type: 'DECK_REBUILT', deck: 'SPECIAL', count: 14 });
    expect(state.specialDiscard).toEqual([]);
    expect(state.specialDeck).toHaveLength(13);
    expect(state.players[0]!.specials).toHaveLength(1);
  });

  it('공격으로 3장을 뽑다가 더미가 비면 다시 섞어서 마저 뽑는다', () => {
    const s0 = arrange(newGame(3), {
      hands: { 0: ['알파고'], 1: ['망원경'] },
      specials: { 0: ['ATTACK'] },
      deckTop: ['텀블러'],
      rest: 'bases',
    });
    const declared = act(s0, { type: 'USE_ATTACK', seat: 0, specialId: specialOf(s0, 0, 'ATTACK'), target: 1 });
    const { state, events } = actEvents(declared, { type: 'ACCEPT_ATTACK', seat: 1 });
    expect(events.map((e) => e.type)).toEqual(['DECK_REBUILT', 'ATTACK_ACCEPTED', 'TURN_STARTED']);
    expect(state.players[1]!.quest).toHaveLength(4);
  });

  it('섞을 카드도 없으면 있는 만큼만 뽑는다', () => {
    const s0 = arrange(newGame(3), {
      hands: { 0: ['알파고'], 1: ['망원경'] },
      specials: { 0: ['ATTACK'] },
      deckTop: ['텀블러', '자판기'],
      rest: { hand: 2 },
    });
    const declared = act(s0, { type: 'USE_ATTACK', seat: 0, specialId: specialOf(s0, 0, 'ATTACK'), target: 1 });
    const { state, events } = actEvents(declared, { type: 'ACCEPT_ATTACK', seat: 1 });
    expect(events[0]).toMatchObject({ type: 'ATTACK_ACCEPTED', drawn: 2 });
    expect(state.players[1]!.quest).toHaveLength(3);
    expect(state.questDeck).toEqual([]);
  });

  it('먹을 수 있는 카드가 전혀 없으면 먹기 단계를 건너뛰고 바로 내기 단계', () => {
    // 퀘스트카드는 전부 손에 있고, 좌석1은 스페셜이 이미 3장
    const s0 = arrange(newGame(2), {
      hands: { 0: ['알파고'] },
      specials: { 0: ['ATTACK'], 1: ['ICON', 'RECYCLE', 'RECYCLE'] },
      rest: { hand: 1 },
    });
    const declared = act(s0, { type: 'USE_ATTACK', seat: 0, specialId: specialOf(s0, 0, 'ATTACK'), target: 1 });
    const { state, events } = actEvents(declared, { type: 'ACCEPT_ATTACK', seat: 1 });
    expect(events.map((e) => e.type)).toEqual(['ATTACK_ACCEPTED', 'TURN_STARTED', 'DRAW_SKIPPED']);
    expect(events[0]).toMatchObject({ drawn: 0 });
    expect([state.phase, state.active]).toEqual(['ACT', 1]);
  });
});
