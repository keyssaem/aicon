import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { backImages, baseCards, questCards, specialKinds, tokenImage } from '@aicon/content/public';
import { questAnswers } from '@aicon/content/server';
import { describe, expect, it } from 'vitest';
import { defaultCatalog } from '../src';

const contentDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../content');
const answerOf = new Map(questAnswers.map((a) => [a.id, a]));
const cardByName = new Map(questCards.map((c) => [c.name, c]));

describe('카드 데이터', () => {
  it('퀘스트카드는 50장이고 YES 25 · NO 25, 종류마다 별 1~5가 5장씩', () => {
    expect(questCards).toHaveLength(50);
    for (const type of ['YES', 'NO'] as const) {
      for (const stars of [1, 2, 3, 4, 5]) {
        const count = questCards.filter((c) => c.stars === stars && answerOf.get(c.id)?.type === type).length;
        expect(count, `${type} ★${stars}`).toBe(5);
      }
    }
  });

  it('공개 데이터와 서버 데이터의 카드 ID가 정확히 같다', () => {
    expect(questAnswers.map((a) => a.id).sort()).toEqual(questCards.map((c) => c.id).sort());
    for (const answer of questAnswers) expect(answer.explain.length).toBeGreaterThan(5);
  });

  it('공개 데이터 파일에는 정답과 해설이 들어 있지 않다', () => {
    const raw = readFileSync(path.join(contentDir, 'src/cards.public.json'), 'utf8');
    expect(raw).not.toMatch(/"type"|"explain"|"YES"|"NO"/);
    for (const card of questCards) expect(Object.keys(card).sort()).toEqual(['id', 'image', 'lines', 'name', 'stars']);
  });

  it('ID는 순서 없는 q-xxxx 형식이고 이름은 겹치지 않는다', () => {
    for (const card of questCards) {
      expect(card.id).toMatch(/^q-[2-9a-z]{4}$/);
      expect(card.image).toBe(`${card.id}.webp`);
    }
    expect(new Set(questCards.map((c) => c.name)).size).toBe(50);
    const firstHalf = [...questCards].sort((a, b) => a.id.localeCompare(b.id)).slice(0, 25);
    expect(new Set(firstHalf.map((c) => answerOf.get(c.id)?.type)).size).toBe(2);
  });

  it('스페셜카드는 아이콘 5 · 공격 3 · 방어 3 · 재활용 3 = 14장', () => {
    expect(Object.fromEntries(specialKinds.map((k) => [k.kind, k.count]))).toEqual({ ICON: 5, ATTACK: 3, DEFENSE: 3, RECYCLE: 3 });
    const catalog = defaultCatalog();
    expect(Object.keys(catalog.specialKinds)).toHaveLength(14);
    expect(Object.keys(catalog.questStars)).toHaveLength(50);
  });

  it('모든 카드 이미지 파일이 있다', () => {
    const files = [
      ...questCards.map((c) => c.image),
      ...baseCards.map((b) => b.image),
      ...specialKinds.map((k) => k.image),
      ...Object.values(backImages),
      tokenImage,
    ];
    expect(files).toHaveLength(69);
    for (const file of files) expect(existsSync(path.join(contentDir, 'assets/cards', file)), file).toBe(true);
  });

  it('설명서 예시 카드와 영상 속 판정이 정답표와 같다', () => {
    const expected: [string, 1 | 2 | 3 | 4 | 5, 'YES' | 'NO'][] = [
      ['자율주행자동차', 5, 'YES'],
      ['알파고', 4, 'YES'],
      ['서빙 로봇', 3, 'YES'],
      ['무인 마트', 2, 'YES'],
      ['스마트 워치', 1, 'YES'],
      ['헤드 마운트 디스플레이', 5, 'NO'],
      ['스마트 태그', 4, 'NO'],
      ['무선 마우스', 3, 'NO'],
      ['망원경', 2, 'NO'],
      ['무선 충전기', 1, 'NO'],
      ['미세먼지 필터 마스크', 5, 'NO'],
      ['무선 청소기', 4, 'NO'],
    ];
    for (const [name, stars, type] of expected) {
      const card = cardByName.get(name);
      expect(card, name).toBeDefined();
      expect(card?.stars, name).toBe(stars);
      expect(answerOf.get(card!.id)?.type, name).toBe(type);
    }
  });
});
