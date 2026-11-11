import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { getChatFontSize, saveChatFontSize } from './storage.js';

export const CHAT_FONT_SIZES = {
  small: { label: 'Small', size: 12, lineHeight: 18 },
  medium: { label: 'Default', size: 13, lineHeight: 20 },
  large: { label: 'Large', size: 15, lineHeight: 22 },
  xlarge: { label: 'XL', size: 17, lineHeight: 25 }
};

export const ACCENTS = [
  '#7C5CFF',
  '#4385F5',
  '#25C9DF',
  '#28C77B',
  '#A4D832',
  '#F1B83A',
  '#F47C3C',
  '#ED5BA6'
];

export function getDarkTheme(accent = ACCENTS[0]) {
  return {
    mode: 'dark',
    bg: '#000000',
    surface: '#0d0d0d',
    raised: '#161616',
    border: '#282828',
    text: '#ffffff',
    muted: '#8a8a8a',
    subtle: '#5b5b5b',
    accent,
    danger: '#ff5d5d',
    warning: '#f1b83a',
    success: '#31c77a',
    userBubble: '#2f2f2f',
    userBubbleBorder: '#3d3d3d',
    userText: '#ececec',
    agentBubble: '#0d0d0d',
    agentText: '#ffffff',
    tabBar: '#161616'
  };
}

export function getLightTheme(accent = ACCENTS[0]) {
  return {
    mode: 'light',
    bg: '#ffffff',
    surface: '#f6f6f6',
    raised: '#ffffff',
    border: '#e5e5e5',
    text: '#0a0a0a',
    muted: '#6b6b6b',
    subtle: '#969696',
    accent,
    danger: '#ff5d5d',
    warning: '#f1b83a',
    success: '#31c77a',
    userBubble: '#f2f2f2',
    userBubbleBorder: '#e4e4e7',
    userText: '#0d0d0d',
    agentBubble: '#f6f6f6',
    agentText: '#0a0a0a',
    tabBar: '#ffffff'
  };
}

const ThemeContext = createContext({
  theme: getDarkTheme(),
  isDark: true,
  toggleTheme: () => {},
  setDark: () => {},
  accent: ACCENTS[0],
  setAccent: () => {},
  chatFontSize: 'medium',
  setChatFontSize: () => {}
});

export function ThemeProvider({ children }) {
  const systemScheme = useColorScheme();
  const [isDark, setIsDark] = useState(true);
  const [accent, setAccentState] = useState(ACCENTS[0]);
  const [chatFontSize, setChatFontSizeState] = useState('medium');

  useEffect(() => {
    async function loadFont() {
      const saved = await getChatFontSize();
      if (saved && CHAT_FONT_SIZES[saved]) {
        setChatFontSizeState(saved);
      }
    }
    loadFont();
  }, []);

  useEffect(() => {
    if (systemScheme) {
      setIsDark(systemScheme === 'dark');
    }
  }, [systemScheme]);

  const toggleTheme = () => {
    setIsDark((prev) => !prev);
  };

  const setDark = (val) => {
    setIsDark(Boolean(val));
  };

  const setAccent = (color) => {
    setAccentState(color);
  };

  const setChatFontSize = (size) => {
    setChatFontSizeState(size);
    saveChatFontSize(size);
  };

  const theme = isDark ? getDarkTheme(accent) : getLightTheme(accent);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        isDark,
        toggleTheme,
        setDark,
        accent,
        setAccent,
        chatFontSize,
        setChatFontSize
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
