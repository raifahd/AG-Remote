import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';

export const darkTheme = {
  mode: 'dark',
  bg: '#000000',
  surface: '#0c0c0e',
  surfaceSubtle: '#141417',
  card: '#18181b',
  border: '#27272a',
  borderSubtle: '#1f1f23',
  text: '#ffffff',
  textSecondary: '#a1a1aa',
  textMuted: '#71717a',
  userBubble: '#ffffff',
  userText: '#000000',
  agentBubble: '#141417',
  agentText: '#ffffff',
  green: '#10b981',
  greenSurface: '#064e3b',
  amber: '#f59e0b',
  amberSurface: '#451a03',
  red: '#ef4444',
  redSurface: '#450a0a',
  accent: '#ffffff',
  tabBar: '#0c0c0e'
};

export const lightTheme = {
  mode: 'light',
  bg: '#ffffff',
  surface: '#f8fafc',
  surfaceSubtle: '#f1f5f9',
  card: '#ffffff',
  border: '#e2e8f0',
  borderSubtle: '#f1f5f9',
  text: '#09090b',
  textSecondary: '#52525b',
  textMuted: '#a1a1aa',
  userBubble: '#000000',
  userText: '#ffffff',
  agentBubble: '#f4f4f5',
  agentText: '#09090b',
  green: '#059669',
  greenSurface: '#d1fae5',
  amber: '#d97706',
  amberSurface: '#fef3c7',
  red: '#dc2626',
  redSurface: '#fee2e2',
  accent: '#09090b',
  tabBar: '#ffffff'
};

const ThemeContext = createContext({
  theme: darkTheme,
  isDark: true,
  toggleTheme: () => {}
});

export function ThemeProvider({ children }) {
  const systemScheme = useColorScheme();
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    if (systemScheme) {
      setIsDark(systemScheme === 'dark');
    }
  }, [systemScheme]);

  const toggleTheme = () => {
    setIsDark((prev) => !prev);
  };

  const theme = isDark ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider value={{ theme, isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

