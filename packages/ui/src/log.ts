import type { GameEvent } from '@aicon/protocol';
import { baseLabel, cardLabel, questName, specialName } from './cards';

/** 이벤트를 게임 기록 한 줄로 바꿉니다. P1의 게임 로그에 그대로 옮겨 쓸 수 있습니다. */
export function describeEvent(event: GameEvent, names: string[], showSecret: boolean): string {
  const who = (seat: number) => names[seat] ?? `좌석 ${seat}`;
  const cards = (list: string[]) => list.map(cardLabel).join(', ');
  const secret = (list: string[] | undefined) => (showSecret && list && list.length > 0 ? ` → ${cards(list)}` : '');

  switch (event.type) {
    case 'ROUND_STARTED':
      return `── ${event.round}라운드 시작 · 첫 차례 ${who(event.firstSeat)}`;
    case 'CARDS_DEALT': {
      // 받은 카드 목록에서 스페셜카드 ID는 빼고 퀘스트카드 이름만 보여 줍니다.
      const questIds = event.secret?.cardIds.slice(0, event.quest);
      return `${who(event.seat)}: 퀘스트 ${event.quest}장 · 스페셜 ${event.special}장 받음${secret(questIds)}`;
    }
    case 'TURN_STARTED':
      return `▶ ${who(event.seat)}의 차례`;
    case 'TURN_SKIPPED':
      return `${who(event.seat)}: 차례 건너뜀 (남은 쉬기 ${event.remaining})`;
    case 'TURN_TIMED_OUT':
      return `${who(event.seat)}: 시간 초과로 차례를 넘김`;
    case 'CARD_DRAWN':
      return `${who(event.seat)}: ${event.source === 'QUEST' ? '퀘스트' : '스페셜'} 더미에서 1장${secret(event.secret?.cardIds)}`;
    case 'DRAW_SKIPPED':
      return `${who(event.seat)}: 가져올 카드가 없어 먹기를 건너뜀`;
    case 'DECK_REBUILT':
      return `${event.deck === 'QUEST' ? '퀘스트' : '스페셜'} 더미를 다시 섞음 (${event.count}장)`;
    case 'QUEST_PLAYED':
      return `${who(event.play.seat)}: ${baseLabel(event.play.items[0]!.base)}에 ${cards(event.play.items.map((item) => item.cardId))} 내려놓음`;
    case 'ICON_PLAYED':
      return event.play
        ? `${who(event.seat)}: 아이콘! ${event.play.items.map((item) => `${questName(item.cardId)}→${baseLabel(item.base)}`).join(', ')}`
        : `${who(event.seat)}: 아이콘! ${cards(event.cardIds)}`;
    case 'CHALLENGE_OPENED':
      return `검증 기회: ${event.eligible.map(who).join(', ')}`;
    case 'CHALLENGE_PASSED':
      return `${who(event.seat)}: 통과`;
    case 'CHALLENGE_CLOSED':
      return `검증 없이 넘어감 (${event.reason === 'ALL_PASSED' ? '모두 통과' : '시간 초과'})`;
    case 'CHALLENGE_RESOLVED': {
      const detail = event.outcome.reveals
        .map((r) => `${questName(r.cardId)}=${r.actual === 'YES' ? 'Yes! AI' : 'No! AI'}${r.declared === r.actual ? '' : ' ✕'}`)
        .join(', ');
      return `${who(event.outcome.challenger)}: 검증! → ${event.outcome.success ? '성공' : '실패'} (${detail})`;
    }
    case 'TOKENS_AWARDED': {
      const reason = event.reason === 'CHALLENGE' ? '검증 성공' : event.reason === 'FINISH' ? '라운드 1등' : '라운드 순위';
      return `${who(event.seat)}: 토큰 +${event.amount} (${reason})`;
    }
    case 'SKIP_ADDED':
      return `${who(event.seat)}: 한 턴 쉬기 (누적 ${event.skip})`;
    case 'ATTACK_DECLARED':
      return `${who(event.seat)}: ${who(event.target)}에게 ${specialName('ATTACK')}!`;
    case 'ATTACK_DEFENDED':
      return `${who(event.seat)}: ${specialName('DEFENSE')}!`;
    case 'ATTACK_ACCEPTED':
      return `${who(event.seat)}: 퀘스트 ${event.drawn}장 가져감${secret(event.secret?.cardIds)}`;
    case 'CARD_RECYCLED':
      return `${who(event.seat)}: 재활용 → ${baseLabel(event.base)} 맨 위 ${questName(event.cardId)}`;
    case 'ROUND_ENDED':
      return `${event.summary.round}라운드 종료 · 1등 ${who(event.summary.finisher)}`;
    case 'GAME_ENDED':
      return `게임 종료 · 우승 ${event.winners.map(who).join(', ')} (토큰 ${event.tokens.join('·')})`;
  }
}
