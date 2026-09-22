// 통신에 쓰이는 타입은 @aicon/protocol에 있습니다. 여기에는 서버 안에서만 쓰는 타입만 둡니다.
import type {
  AiType,
  BaseId,
  ChallengeOutcome,
  GameEvent,
  GameOptions,
  Pending,
  Phase,
  PileEntry,
  Play,
  RoundSummary,
  RuleError,
  SeatIndex,
  SpecialKind,
  Stars,
} from '@aicon/protocol';

export type * from '@aicon/protocol';

/** 게임마다 고정인 카드 정보. 정답이 들어 있으므로 viewFor가 절대 내보내지 않습니다. */
export interface Catalog {
  questStars: Readonly<Record<string, Stars>>;
  answers: Readonly<Record<string, AiType>>;
  specialKinds: Readonly<Record<string, SpecialKind>>;
}

export interface PlayerState {
  name: string;
  quest: string[];
  specials: string[];
  tokens: number;
  /** 남은 '한 턴 쉬기' 횟수 */
  skip: number;
}

export interface GameState {
  schema: 1;
  /** 성공한 행동 수. 늦게 도착한 메시지를 거르는 버전 번호로 씁니다. */
  seq: number;
  seed: number;
  /** 시드 난수 내부 상태. 이것이 새면 앞으로의 섞기 결과를 알 수 있으므로 비밀입니다. */
  rng: number;
  options: GameOptions;
  catalog: Catalog;
  round: number;
  firstSeat: SeatIndex;
  active: SeatIndex;
  phase: Phase;
  players: PlayerState[];
  /** 배열의 마지막 원소가 더미 맨 위 */
  questDeck: string[];
  specialDeck: string[];
  /** 기본 아이콘 규칙으로 낸 카드 (퀘스트 더미 옆, 앞면) */
  iconPile: string[];
  specialDiscard: string[];
  /** 배열의 마지막 원소가 더미 맨 위 */
  bases: Record<BaseId, PileEntry[]>;
  nextPlayId: number;
  pending: Pending | null;
  lastPlay: Play | null;
  lastChallenge: ChallengeOutcome | null;
  /** 이번 라운드에 검증으로 공개된 카드의 정답 */
  known: Record<string, AiType>;
  history: RoundSummary[];
  winners: SeatIndex[] | null;
}

export type ReduceResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: RuleError };

export interface GameConfig {
  /** 좌석 순서대로 닉네임 (2~4명) */
  players: string[];
  seed: number;
  options?: Partial<GameOptions>;
  /** 1라운드 첫 차례. 생략하면 시드 난수로 정합니다. */
  firstSeat?: SeatIndex;
  /** 생략하면 기본 카드 50+14장 */
  catalog?: Catalog;
}
