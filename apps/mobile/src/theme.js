import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from './storage.js';

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
    userBubble: '#ffffff',
    userText: '#000000',
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
    userBubble: '#000000',
    userText: '#ffffff',
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
  setAccent: () => {}
});

export function ThemeProvider({ children }) {
  const systemScheme = useColorScheme();
  const [isDark, setIsDark] = useState(true);
  const [accent, setAccentState] = useState(ACCENTS[0]);

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

  const theme = isDark ? getDarkTheme(accent) : getLightTheme(accent);

  return (
    <ThemeContext.Provider value={{ theme, isDark, toggleTheme, setDark, accent, setAccent }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
