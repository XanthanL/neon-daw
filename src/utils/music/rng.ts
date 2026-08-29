/**
 * 抽卡随机源
 * 一次生成流程共用同一个 Rng 实例，便于逐层传递而不散落 Math.random
 */
export interface Rng {
  /** [0,1) */
  next(): number;
  /** 闭区间 [min,max] 整数 */
  int(min: number, max: number): number;
  float(min: number, max: number): number;
  pick<T>(arr: readonly T[]): T;
  chance(p: number): boolean;
  /** Fisher–Yates，返回新数组 */
  shuffle<T>(arr: readonly T[]): T[];
  /** 按权重取一项 */
  weighted<T>(items: readonly { value: T; weight: number }[]): T;
}

export function makeRng(): Rng {
  const next = () => Math.random();
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    float: (min, max) => min + next() * (max - min),
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    shuffle: <T>(arr: readonly T[]): T[] => {
      const out = [...arr];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    weighted: <T>(items: readonly { value: T; weight: number }[]): T => {
      const total = items.reduce((s, it) => s + Math.max(0, it.weight), 0);
      let r = next() * total;
      for (const it of items) {
        r -= Math.max(0, it.weight);
        if (r <= 0) return it.value;
      }
      return items[items.length - 1].value;
    },
  };
}

let idSeq = 0;

/** 工程内实体 id：与 store 里既有的 id 形态一致（时间戳 + 递增序列） */
export const rid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${(idSeq++).toString(36)}`;
