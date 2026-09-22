// 베이스카드 10칸에 대한 공용 도우미. 정답과 무관하므로 화면에서도 그대로 씁니다.
import type { AiType, BaseId, Stars } from './game';

export const BASE_IDS: readonly BaseId[] = ['YES1', 'YES2', 'YES3', 'YES4', 'YES5', 'NO1', 'NO2', 'NO3', 'NO4', 'NO5'];

const BASE_SET = new Set<string>(BASE_IDS);

export function isBaseId(value: unknown): value is BaseId {
  return typeof value === 'string' && BASE_SET.has(value);
}

export function baseOf(id: BaseId): { type: AiType; stars: Stars } {
  const type: AiType = id.startsWith('YES') ? 'YES' : 'NO';
  return { type, stars: Number(id.slice(type.length)) as Stars };
}

export function baseIdOf(type: AiType, stars: Stars): BaseId {
  return `${type}${stars}`;
}
