/** 八大模块统一配置（左侧导航 / 首页方块 / 工作区共用） */
import type { LucideIcon } from 'lucide-react';
import {
  AudioWaveform,
  Dices,
  FolderOpen,
  Keyboard,
  LayoutGrid,
  ListMusic,
  Piano,
  SlidersHorizontal,
} from 'lucide-react';
import type { ViewModule } from '../../stores/uiStore';

export type ModuleId = Exclude<ViewModule, 'home'>;

export interface ModuleDef {
  id: ModuleId;
  label: string;
  /** 模块图标（lucide 描边风格，导航 / 首页 / 工作区共用） */
  icon: LucideIcon;
  /** 模块荧光功能色 */
  color: string;
  /** 数字快捷键 */
  hotkey: string;
}

export const MODULES: ModuleDef[] = [
  {
    id: 'channelRack',
    label: 'Channel Rack',
    icon: LayoutGrid,
    color: '#00E5FF',
    hotkey: '1',
  },
  {
    id: 'pianoRoll',
    label: 'Piano Roll',
    icon: Piano,
    color: '#FF3DBE',
    hotkey: '2',
  },
  {
    id: 'mixer',
    label: 'Mixer',
    icon: SlidersHorizontal,
    color: '#FFE600',
    hotkey: '3',
  },
  {
    id: 'synth',
    label: 'Synth',
    icon: AudioWaveform,
    color: '#39FF88',
    hotkey: '4',
  },
  {
    id: 'song',
    label: 'Song',
    icon: ListMusic,
    color: '#A78BFA',
    hotkey: '5',
  },
  {
    id: 'keyboard',
    label: 'Live Keys',
    icon: Keyboard,
    color: '#FF9F1C',
    hotkey: '6',
  },
  {
    id: 'random',
    label: 'Random',
    icon: Dices,
    color: '#FF5CA8',
    hotkey: '7',
  },
  {
    id: 'files',
    label: 'Files',
    icon: FolderOpen,
    color: '#4D9FFF',
    hotkey: '8',
  },
];

export const moduleByView = (view: ViewModule): ModuleDef | undefined =>
  MODULES.find((m) => m.id === view);
