/**
 * 抽卡管线：悬念动效 → 生成整曲 → 整工程替换 → 补一步可撤销历史 → 自动切 Song 试听
 * · 主随机与「风格内随机」两个子模块共用，故状态挂在模块壳上，切子模块不丢结果卡
 * · importProject 会清空历史栈，这里手动 record 一步让 Ctrl+Z 能回到上一首
 * · 传入 styleId 即锁定风格，只在该风格内重掷其余参数（连抽去重对锁定风格无意义，跳过）
 */
import { useEffect, useRef, useState } from 'react';
import { engine } from '../../audio/engine';
import { getProjectSnapshot, useProjectStore } from '../../stores/projectStore';
import { useHistoryStore } from '../../stores/historyStore';
import { useUiStore } from '../../stores/uiStore';
import { useT } from '../../i18n/ui';
import { generateRandomSong } from '../../utils/music/compose';
import type { GeneratedInfo, StyleId } from '../../utils/music/types';

export interface GachaOptions {
  patternCount: number;
  beatAndChords: boolean;
  /** 风格内随机：锁定风格 id；null / undefined 表示从风格池里抽 */
  styleId?: StyleId | null;
}

export function useGacha(options: GachaOptions) {
  const t = useT();
  const importProject = useProjectStore((s) => s.importProject);
  const setPlayMode = useUiStore((s) => s.setPlayMode);

  const [rolling, setRolling] = useState(false);
  const [result, setResult] = useState<GeneratedInfo | null>(null);
  /** 成功抽卡的序号：同名风格重抽也要让结果卡重放动效 */
  const [seq, setSeq] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [frame, setFrame] = useState(0);
  const rollTimer = useRef<number | null>(null);
  /** 上一次抽中的风格，避免连抽同一种 */
  const lastStyle = useRef<StyleId | null>(null);
  const optsRef = useRef(options);
  optsRef.current = options;
  const tRef = useRef(t);
  tRef.current = t;

  /* 洗牌动效逐帧推进（render 期取时间不会重绘，必须靠 interval 驱动 state） */
  useEffect(() => {
    if (!rolling) return;
    const id = window.setInterval(() => setFrame((f) => f + 1), 90);
    return () => window.clearInterval(id);
  }, [rolling]);

  /* 卸载时收回未触发的生成定时器 */
  useEffect(
    () => () => {
      if (rollTimer.current !== null) window.clearTimeout(rollTimer.current);
    },
    [],
  );

  const draw = () => {
    if (rolling) return;
    setError(null);
    setRolling(true);
    /* 抽卡悬念动效 → 生成并整工程替换 */
    rollTimer.current = window.setTimeout(() => {
      rollTimer.current = null;
      const { patternCount, beatAndChords, styleId } = optsRef.current;
      try {
        const before = getProjectSnapshot();
        const { project, info } = generateRandomSong({
          styleId: styleId ?? undefined,
          excludeStyleId: styleId ? undefined : lastStyle.current,
          patternCount,
          beatAndChords,
        });
        engine.stop();
        const ok = importProject(project);
        if (!ok) {
          setError(tRef.current.random.validationFail);
          setRolling(false);
          return;
        }
        /* importProject 会清空历史，这里手动补一步记录让抽卡可撤销 */
        useHistoryStore
          .getState()
          .record(tRef.current.random.record(info.styleName), before, getProjectSnapshot());
        lastStyle.current = info.styleId;
        setPlayMode('song');
        setResult(info);
        setSeq((n) => n + 1);
        setRolling(false);
        void engine.play();
      } catch (err) {
        setError(err instanceof Error ? err.message : tRef.current.random.genFail);
        setRolling(false);
      }
    }, 640);
  };

  return { draw, rolling, result, error, frame, seq };
}
