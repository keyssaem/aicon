// 서버 전용: 퀘스트카드 정답(YES/NO)과 해설.
// 학생 기기로 가는 코드(P1의 apps/web)는 이 모듈을 절대 import하면 안 됩니다.
import rawAnswers from './answers.server.json';
import type { AiType } from './public';

export interface QuestAnswer {
  id: string;
  type: AiType;
  /** 검증 뒤 보여 줄 해설. 현재 문장은 초안이므로 검토가 필요합니다. */
  explain: string;
}

export const questAnswers: readonly QuestAnswer[] = rawAnswers as QuestAnswer[];
