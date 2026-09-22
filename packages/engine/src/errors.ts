import type { RuleError, RuleErrorCode } from './types';

/** 학생 화면에 그대로 보여 줄 수 있는 문장 */
export const RULE_MESSAGES: Record<RuleErrorCode, string> = {
  BAD_ACTION: '잘못된 요청이에요.',
  GAME_OVER: '게임이 이미 끝났어요.',
  WRONG_PHASE: '지금은 그 행동을 할 수 없어요.',
  NOT_YOUR_TURN: '내 차례가 아니에요.',
  SPECIAL_LIMIT: '스페셜카드는 3장까지만 가질 수 있어요.',
  SPECIAL_DECK_EMPTY: '가져올 스페셜카드가 없어요.',
  QUEST_DECK_EMPTY: '가져올 퀘스트카드가 없어요.',
  NO_CARDS_SELECTED: '내려놓을 카드를 골라 주세요.',
  DUPLICATE_CARD: '같은 카드를 두 번 고를 수 없어요.',
  CARD_NOT_IN_HAND: '내 손에 없는 카드예요.',
  INVALID_BASE: '없는 베이스카드예요.',
  STARS_MISMATCH: '별 개수가 같은 베이스카드에만 내려놓을 수 있어요.',
  SPECIAL_NOT_IN_HAND: '내가 가진 스페셜카드가 아니에요.',
  WRONG_SPECIAL_KIND: '그 스페셜카드로는 이 행동을 할 수 없어요.',
  ICON_TOO_FEW: '아이콘은 숫자가 이어지는 카드 3장 이상이 필요해요.',
  ICON_NOT_CONSECUTIVE: '아이콘은 1, 2, 3처럼 숫자가 하나씩 이어져야 해요. 같은 숫자는 함께 낼 수 없어요.',
  ICON_BASES_REQUIRED: '숙련자 규칙에서는 카드마다 Yes! 또는 No! 베이스를 골라야 해요.',
  INVALID_TARGET: '공격할 수 없는 사람이에요.',
  PILE_EMPTY: '그 베이스카드 위에는 가져올 카드가 없어요.',
  NOT_ELIGIBLE: '지금은 검증할 수 없어요. 내가 낸 카드는 검증할 수 없어요.',
  ALREADY_PASSED: '이미 통과를 눌렀어요.',
  NOT_TARGET: '공격받은 사람만 할 수 있어요.',
  NOTHING_TO_TIMEOUT: '시간 제한이 있는 단계가 아니에요.',
};

export class RuleViolation extends Error {
  readonly error: RuleError;

  constructor(code: RuleErrorCode) {
    super(`${code}: ${RULE_MESSAGES[code]}`);
    this.name = 'RuleViolation';
    this.error = { code, message: RULE_MESSAGES[code] };
  }
}

export function fail(code: RuleErrorCode): never {
  throw new RuleViolation(code);
}
