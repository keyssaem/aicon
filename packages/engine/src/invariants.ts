import { BASE_IDS, SPECIAL_LIMIT, baseOf } from './constants';
import type { GameState } from './types';

/**
 * 어떤 행동 뒤에도 항상 참이어야 하는 조건을 검사해 어긋난 내용을 문장으로 돌려줍니다.
 * 빈 배열이면 정상입니다. 테스트와 핫시트 디버거가 매 행동마다 부릅니다.
 */
export function checkInvariants(s: GameState): string[] {
  const problems: string[] = [];

  const questSeen = new Map<string, string>();
  const noteQuest = (id: string, where: string) => {
    const before = questSeen.get(id);
    if (before) problems.push(`퀘스트카드 ${id}가 ${before}와 ${where}에 동시에 있음`);
    questSeen.set(id, where);
    if (s.catalog.questStars[id] === undefined) problems.push(`알 수 없는 퀘스트카드 ${id} (${where})`);
  };
  s.questDeck.forEach((id) => noteQuest(id, '퀘스트 더미'));
  s.iconPile.forEach((id) => noteQuest(id, '아이콘 더미'));
  for (const base of BASE_IDS) {
    for (const entry of s.bases[base]) {
      noteQuest(entry.cardId, `베이스 ${base}`);
      if (s.catalog.questStars[entry.cardId] !== baseOf(base).stars) {
        problems.push(`베이스 ${base}에 별 개수가 다른 카드 ${entry.cardId}`);
      }
    }
  }
  s.players.forEach((p, seat) => p.quest.forEach((id) => noteQuest(id, `좌석 ${seat} 손패`)));
  const questTotal = Object.keys(s.catalog.questStars).length;
  if (questSeen.size !== questTotal) problems.push(`퀘스트카드 ${questSeen.size}/${questTotal}장만 확인됨`);

  const specialSeen = new Map<string, string>();
  const noteSpecial = (id: string, where: string) => {
    const before = specialSeen.get(id);
    if (before) problems.push(`스페셜카드 ${id}가 ${before}와 ${where}에 동시에 있음`);
    specialSeen.set(id, where);
    if (s.catalog.specialKinds[id] === undefined) problems.push(`알 수 없는 스페셜카드 ${id} (${where})`);
  };
  s.specialDeck.forEach((id) => noteSpecial(id, '스페셜 더미'));
  s.specialDiscard.forEach((id) => noteSpecial(id, '버린 스페셜'));
  s.players.forEach((p, seat) => p.specials.forEach((id) => noteSpecial(id, `좌석 ${seat} 스페셜`)));
  const specialTotal = Object.keys(s.catalog.specialKinds).length;
  if (specialSeen.size !== specialTotal) problems.push(`스페셜카드 ${specialSeen.size}/${specialTotal}장만 확인됨`);

  s.players.forEach((p, seat) => {
    if (p.specials.length > SPECIAL_LIMIT) problems.push(`좌석 ${seat} 스페셜 ${p.specials.length}장 (최대 ${SPECIAL_LIMIT})`);
    if (p.tokens < 0) problems.push(`좌석 ${seat} 토큰이 음수`);
    if (p.skip < 0) problems.push(`좌석 ${seat} 쉬기 횟수가 음수`);
  });

  const active = s.players[s.active];
  if (!active) problems.push(`차례 좌석 ${s.active}가 없음`);

  switch (s.phase) {
    case 'DRAW':
    case 'ACT':
      if (s.pending !== null) problems.push(`${s.phase} 단계인데 대기 중인 창이 있음`);
      if (active && active.quest.length === 0) problems.push(`${s.phase} 단계인데 차례인 사람의 퀘스트카드가 0장`);
      break;
    case 'CHALLENGE': {
      const pending = s.pending;
      if (pending?.kind !== 'CHALLENGE') {
        problems.push('검증 단계인데 검증 창 정보가 없음');
        break;
      }
      if (pending.play.seat !== s.active) problems.push('검증 대상 묶음을 낸 사람이 차례인 사람이 아님');
      if (pending.eligible.includes(pending.play.seat)) problems.push('카드를 낸 사람이 검증 가능 목록에 있음');
      for (const item of pending.play.items) {
        if (!s.bases[item.base].some((entry) => entry.cardId === item.cardId)) {
          problems.push(`검증 대상 카드 ${item.cardId}가 베이스 ${item.base}에 없음`);
        }
      }
      break;
    }
    case 'DEFENSE': {
      const pending = s.pending;
      if (pending?.kind !== 'DEFENSE') {
        problems.push('방어 단계인데 방어 창 정보가 없음');
        break;
      }
      if (pending.attacker !== s.active) problems.push('공격한 사람이 차례인 사람이 아님');
      if (pending.target === pending.attacker) problems.push('자기 자신을 공격함');
      if (active && active.quest.length === 0) problems.push('방어 단계인데 공격한 사람의 퀘스트카드가 0장');
      break;
    }
    case 'ROUND_END':
    case 'GAME_END':
      if (s.pending !== null) problems.push(`${s.phase} 단계인데 대기 중인 창이 있음`);
      if (s.history.length !== s.round) problems.push(`라운드 기록 ${s.history.length}개, 현재 라운드 ${s.round}`);
      if (s.phase === 'GAME_END' && (s.winners === null || s.winners.length === 0)) problems.push('게임이 끝났는데 우승자가 없음');
      break;
  }

  return problems;
}
