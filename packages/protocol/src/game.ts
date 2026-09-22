// 서버와 화면이 함께 쓰는 게임 타입. 정답표(Catalog)와 전체 상태(GameState)는 여기에 없습니다.
import type { AiType, BaseId, SpecialKind, Stars } from '@aicon/content/public';

export type { AiType, BaseId, SpecialKind, Stars };

export type SeatIndex = number;

export type Phase = 'DRAW' | 'ACT' | 'CHALLENGE' | 'DEFENSE' | 'ROUND_END' | 'GAME_END';

export interface GameOptions {
  rounds: number;
  expertIcon: boolean;
}

export interface PlayItem {
  cardId: string;
  base: BaseId;
}

export interface Play {
  id: number;
  seat: SeatIndex;
  via: 'QUEST' | 'ICON';
  items: PlayItem[];
}

export interface PileEntry {
  cardId: string;
  playId: number;
}

export type Pending =
  | { kind: 'CHALLENGE'; play: Play; eligible: SeatIndex[]; passed: SeatIndex[] }
  | { kind: 'DEFENSE'; attacker: SeatIndex; target: SeatIndex };

export interface Reveal {
  cardId: string;
  declared: AiType;
  actual: AiType;
}

export interface ChallengeOutcome {
  playId: number;
  challenger: SeatIndex;
  offender: SeatIndex;
  success: boolean;
  reveals: Reveal[];
}

export interface RoundSummary {
  round: number;
  finisher: SeatIndex;
  entries: { seat: SeatIndex; questLeft: number; tokens: number }[];
}

export type Action =
  | { type: 'DRAW'; seat: SeatIndex; source: 'QUEST' | 'SPECIAL' }
  | { type: 'PLAY_QUEST'; seat: SeatIndex; cardIds: string[]; base: BaseId }
  | { type: 'USE_ICON'; seat: SeatIndex; specialId: string; cardIds: string[]; bases?: BaseId[] }
  | { type: 'USE_ATTACK'; seat: SeatIndex; specialId: string; target: SeatIndex }
  | { type: 'USE_RECYCLE'; seat: SeatIndex; specialId: string; base: BaseId }
  | { type: 'CHALLENGE'; seat: SeatIndex }
  | { type: 'PASS'; seat: SeatIndex }
  | { type: 'DEFEND'; seat: SeatIndex; specialId: string }
  | { type: 'ACCEPT_ATTACK'; seat: SeatIndex }
  | { type: 'TIMEOUT' }
  | { type: 'NEXT_ROUND' };

export type ActionType = Action['type'];

export interface Secret {
  seat: SeatIndex;
  cardIds: string[];
}

export type GameEvent =
  | { type: 'ROUND_STARTED'; round: number; firstSeat: SeatIndex }
  | { type: 'CARDS_DEALT'; seat: SeatIndex; quest: number; special: number; secret?: Secret }
  | { type: 'TURN_STARTED'; seat: SeatIndex }
  | { type: 'TURN_SKIPPED'; seat: SeatIndex; remaining: number }
  | { type: 'TURN_TIMED_OUT'; seat: SeatIndex }
  | { type: 'CARD_DRAWN'; seat: SeatIndex; source: 'QUEST' | 'SPECIAL'; secret?: Secret }
  | { type: 'DRAW_SKIPPED'; seat: SeatIndex }
  | { type: 'DECK_REBUILT'; deck: 'QUEST' | 'SPECIAL'; count: number }
  | { type: 'QUEST_PLAYED'; play: Play }
  | { type: 'ICON_PLAYED'; seat: SeatIndex; specialId: string; cardIds: string[]; play: Play | null }
  | { type: 'CHALLENGE_OPENED'; playId: number; eligible: SeatIndex[] }
  | { type: 'CHALLENGE_PASSED'; seat: SeatIndex }
  | { type: 'CHALLENGE_CLOSED'; playId: number; reason: 'ALL_PASSED' | 'TIMEOUT' }
  | { type: 'CHALLENGE_RESOLVED'; outcome: ChallengeOutcome; returnedCardIds: string[] }
  | { type: 'TOKENS_AWARDED'; seat: SeatIndex; amount: number; reason: 'CHALLENGE' | 'FINISH' | 'RANK' }
  | { type: 'SKIP_ADDED'; seat: SeatIndex; skip: number }
  | { type: 'ATTACK_DECLARED'; seat: SeatIndex; target: SeatIndex; specialId: string }
  | { type: 'ATTACK_DEFENDED'; seat: SeatIndex; specialId: string }
  | { type: 'ATTACK_ACCEPTED'; seat: SeatIndex; drawn: number; secret?: Secret }
  | { type: 'CARD_RECYCLED'; seat: SeatIndex; specialId: string; base: BaseId; cardId: string }
  | { type: 'ROUND_ENDED'; summary: RoundSummary }
  | { type: 'GAME_ENDED'; winners: SeatIndex[]; tokens: number[] };

export type RuleErrorCode =
  | 'BAD_ACTION' | 'GAME_OVER' | 'WRONG_PHASE' | 'NOT_YOUR_TURN' | 'SPECIAL_LIMIT'
  | 'SPECIAL_DECK_EMPTY' | 'QUEST_DECK_EMPTY' | 'NO_CARDS_SELECTED' | 'DUPLICATE_CARD'
  | 'CARD_NOT_IN_HAND' | 'INVALID_BASE' | 'STARS_MISMATCH' | 'SPECIAL_NOT_IN_HAND'
  | 'WRONG_SPECIAL_KIND' | 'ICON_TOO_FEW' | 'ICON_NOT_CONSECUTIVE' | 'ICON_BASES_REQUIRED'
  | 'INVALID_TARGET' | 'PILE_EMPTY' | 'NOT_ELIGIBLE' | 'ALREADY_PASSED' | 'NOT_TARGET'
  | 'NOTHING_TO_TIMEOUT';

export interface RuleError {
  code: RuleErrorCode;
  message: string;
}

export interface PublicPlayer {
  seat: SeatIndex;
  name: string;
  tokens: number;
  skip: number;
  questCount: number;
  specialCount: number;
}

export interface SpecialCardView {
  id: string;
  kind: SpecialKind;
}

/** 한 좌석이 봐도 되는 정보만 담은 화면 상태 */
export interface PlayerView {
  viewer: SeatIndex | 'spectator';
  seq: number;
  round: number;
  options: GameOptions;
  phase: Phase;
  active: SeatIndex;
  firstSeat: SeatIndex;
  players: PublicPlayer[];
  me: { seat: SeatIndex; quest: string[]; specials: SpecialCardView[] } | null;
  bases: Record<BaseId, PileEntry[]>;
  questDeckCount: number;
  specialDeckCount: number;
  iconPile: string[];
  specialDiscard: SpecialCardView[];
  pending: Pending | null;
  lastPlay: Play | null;
  lastChallenge: ChallengeOutcome | null;
  known: Record<string, AiType>;
  history: RoundSummary[];
  winners: SeatIndex[] | null;
}
