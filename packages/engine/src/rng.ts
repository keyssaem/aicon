/**
 * mulberry32 시드 난수. 상태가 숫자 하나라서 GameState에 그대로 저장할 수 있고,
 * 같은 시드와 같은 행동 순서면 언제나 같은 섞기 결과가 나옵니다.
 */
export function nextRandom(state: number): [value: number, nextState: number] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let r = Math.imul(next ^ (next >>> 15), next | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return [((r ^ (r >>> 14)) >>> 0) / 4294967296, next];
}

export interface Rng {
  /** [0, 1) */
  float(): number;
  /** [0, maxExclusive) 정수 */
  int(maxExclusive: number): number;
}

/** holder.rng 값을 읽고 갱신하는 난수 생성기 */
export function rngOf(holder: { rng: number }): Rng {
  const float = () => {
    const [value, next] = nextRandom(holder.rng);
    holder.rng = next;
    return value;
  };
  return { float, int: (maxExclusive) => Math.floor(float() * maxExclusive) };
}

/** 독립된 시드로 [0, 1) 난수 함수를 만듭니다. 시뮬레이션용 */
export function randomFn(seed: number): () => number {
  return rngOf({ rng: seed >>> 0 }).float;
}

/** Fisher–Yates 섞기 (제자리) */
export function shuffleInPlace<T>(items: T[], rng: Rng): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = rng.int(i + 1);
    const tmp = items[i] as T;
    items[i] = items[j] as T;
    items[j] = tmp;
  }
  return items;
}
