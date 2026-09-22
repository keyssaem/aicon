import type { GameOptions } from './types';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const QUEST_DEAL = 6;
export const SPECIAL_DEAL = 1;
export const SPECIAL_LIMIT = 3;
export const ICON_MIN = 3;
export const ATTACK_DRAW = 3;
export const CHALLENGE_REWARD = 1;
export const FINISH_TOKENS = 3;
/** 1등을 뺀 나머지의 순위별 토큰. 이보다 낮은 순위는 0개입니다. */
export const RANK_TOKENS: readonly number[] = [2, 1];

export const DEFAULT_OPTIONS: GameOptions = { rounds: 2, expertIcon: false };

export { BASE_IDS, baseIdOf, baseOf, isBaseId } from '@aicon/protocol';
