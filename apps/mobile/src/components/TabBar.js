import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, usePathname } from 'expo-router';
import { useTheme } from '../theme.js';
import Icon from './Icon.js';

const TABS = [
  { name: 'index', label: 'Home', icon: 'home', path: '/(tabs)' },
  { name: 'chat', label: 'Chat', icon: 'chat', path: '/(tabs)/chat' },
  { name: 'workspaces', label: 'Workspaces', icon: 'grid', path: '/(tabs)/workspaces' },
  { name: 'settings', label: 'Settings', icon: 'settings', path: '/(tabs)/settings' }
];

export default function TabBar(props) {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const router = useRouter();
  const pathname = usePathname() || '/';
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardVisible(true)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  if (keyboardVisible) {
    return null;
  }

  const bottomMargin = Math.max(insets.bottom, 14);

  const getIsFocused = (tabName) => {
    if (props.state?.index !== undefined && props.state.routes?.[props.state.index]) {
      return props.state.routes[props.state.index].name === tabName;
    }
    if (tabName === 'index') {
      return pathname === '/' || pathname === '/(tabs)' || pathname === '/index';
    }
    return pathname.includes(tabName);
  };

  return (
    <View
      style={[
        styles.outerContainer,
        {
          bottom: bottomMargin,
          pointerEvents: 'box-none'
        }
      ]}
    >
      <View
        style={[
          styles.tabbar,
          {
            backgroundColor: theme.raised,
            borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : theme.border,
            shadowColor: isDark ? '#ffffff' : '#000000',
            shadowOpacity: isDark ? 0.09 : 0.35,
            shadowOffset: { width: 0, height: isDark ? 4 : 10 },
            shadowRadius: isDark ? 16 : 28,
            elevation: isDark ? 12 : 8
          }
        ]}
      >
        {TABS.map((tab) => {
          const isFocused = getIsFocused(tab.name);

          const onPress = () => {
            if (isFocused) return;
            if (typeof router.navigate === 'function') {
              router.navigate(tab.path);
            } else {
              router.push(tab.path);
            }
          };

          const activeBg = `${theme.accent}2E`;
          const activeColor = theme.accent;
          const inactiveColor = theme.muted;

          return (
            <TouchableOpacity
              key={tab.name}
              onPress={onPress}
              style={[
                styles.tabButton,
                isFocused && { backgroundColor: activeBg }
              ]}
              activeOpacity={0.8}
            >
              <View style={styles.iconContainer}>
                <Icon name={tab.icon} size={20} color={isFocused ? activeColor : inactiveColor} />
              </View>
              <Text
                style={[
                  styles.tabLabel,
                  { color: isFocused ? activeColor : inactiveColor }
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const fontMedium = Platform.select({
  ios: 'Poppins-Medium',
  android: 'Poppins_500Medium',
  web: 'Poppins, sans-serif',
  default: 'System'
});

const styles = StyleSheet.create({
  outerContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10
  },
  tabbar: {
    width: '93%',
    maxWidth: 452,
    padding: 7,
    borderWidth: 1,
    borderRadius: 9999,
    flexDirection: 'row',
    justifyContent: 'space-between',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.35,
        shadowRadius: 28
      },
      android: {
        elevation: 8
      },
      default: {
        boxShadow: '0px 10px 28px rgba(0, 0, 0, 0.35)'
      }
    })
  },
  tabButton: {
    height: 52,
    flex: 1,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center'
  },
  iconContainer: {
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3
  },
  tabLabel: {
    fontSize: 9,
    fontFamily: fontMedium
  }
});
