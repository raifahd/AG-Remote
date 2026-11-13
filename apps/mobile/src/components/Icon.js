import React from 'react';
import { HugeiconsIcon } from '@hugeicons/react-native';
import {
  Home01Icon,
  BubbleChatIcon,
  DashboardSquare01Icon,
  Settings01Icon,
  Notification01Icon,
  ArrowRight01Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  MoreHorizontalIcon,
  CommandLineIcon,
  File01Icon,
  ShieldCheckIcon,
  SentIcon,
  ArrowUp02Icon,
  Add01Icon,
  Copy01Icon,
  Attachment01Icon,
  Cancel01Icon,
  Moon01Icon,
  Sun01Icon,
  ComputerIcon,
  Tick02Icon,
  Wifi01Icon,
  Clock01Icon,
  AiBrain01Icon
} from '@hugeicons/core-free-icons';

const ICON_MAP = {
  home: Home01Icon,
  chat: BubbleChatIcon,
  grid: DashboardSquare01Icon,
  settings: Settings01Icon,
  bell: Notification01Icon,
  chevron: ArrowRight01Icon,
  'chevron-up': ArrowUp01Icon,
  more: MoreHorizontalIcon,
  terminal: CommandLineIcon,
  file: File01Icon,
  code: CommandLineIcon,
  shield: ShieldCheckIcon,
  send: ArrowUp02Icon,
  plus: Add01Icon,
  copy: Copy01Icon,
  attach: Attachment01Icon,
  arrow: ArrowRight01Icon,
  'arrow-down': ArrowDown01Icon,
  clock: Clock01Icon,
  brain: AiBrain01Icon,
  x: Cancel01Icon,
  moon: Moon01Icon,
  sun: Sun01Icon,
  monitor: ComputerIcon,
  check: Tick02Icon,
  wifi: Wifi01Icon
};

export default function Icon({ name, size = 21, color = 'currentColor' }) {
  const iconComponent = ICON_MAP[name] || Home01Icon;

  return (
    <HugeiconsIcon
      icon={iconComponent}
      size={size}
      color={color}
    />
  );
}
