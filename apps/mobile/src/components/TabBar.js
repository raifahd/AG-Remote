import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Keyboard, Animated } from 'react-native';
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
  const [tabWidth, setTabWidth] = useState(0);

  const getIsFocused = (tabName) => {
    if (props.state?.index !== undefined && props.state.routes?.[props.state.index]) {
      return props.state.routes[props.state.index].name === tabName;
    }
    if (tabName === 'index') {
      return pathname === '/' || pathname === '/(tabs)' || pathname === '/index';
    }
    return pathname.includes(tabName);
  };

  const activeIndex = useMemo(() => {
    const idx = TABS.findIndex((tab) => getIsFocused(tab.name));
    return idx >= 0 ? idx : 0;
  }, [props.state?.index, pathname]);

  const slideAnim = useRef(new Animated.Value(activeIndex)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: activeIndex,
      damping: 24,
      stiffness: 240,
      mass: 0.7,
      useNativeDriver: true
    }).start();
  }, [activeIndex]);

  useEffect(() => {
    const showSub1 = Keyboard.addListener('keyboardWillShow', () => setKeyboardVisible(true));
    const showSub2 = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub1 = Keyboard.addListener('keyboardWillHide', () => setKeyboardVisible(false));
    const hideSub2 = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      showSub1.remove();
      showSub2.remove();
      hideSub1.remove();
      hideSub2.remove();
    };
  }, []);

  if (keyboardVisible) {
    return null;
  }

  const bottomMargin = Math.max(insets.bottom, 14);

  const onLayout = (e) => {
    const totalW = e.nativeEvent.layout.width;
    if (totalW > 0) {
      const computedTabWidth = (totalW - 8) / TABS.length;
      if (Math.abs(computedTabWidth - tabWidth) > 0.5) {
        setTabWidth(computedTabWidth);
      }
    }
  };

  const glassBg = isDark ? 'rgba(20, 20, 24, 0.74)' : 'rgba(255, 255, 255, 0.78)';
  const glassBorder = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)';
  const glassTopHighlight = isDark ? 'rgba(255, 255, 255, 0.26)' : 'rgba(255, 255, 255, 0.95)';

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
        onLayout={onLayout}
        style={[
          styles.tabbar,
          {
            backgroundColor: glassBg,
            borderColor: glassBorder,
            borderTopColor: glassTopHighlight
          }
        ]}
      >
        {tabWidth > 0 && (
          <Animated.View
            style={[
              styles.slidingPill,
              {
                width: tabWidth,
                backgroundColor: isDark ? `${theme.accent}2E` : `${theme.accent}1C`,
                borderColor: isDark ? `${theme.accent}4D` : `${theme.accent}2E`,
                transform: [
                  {
                    translateX: slideAnim.interpolate({
                      inputRange: [0, 1, 2, 3],
                      outputRange: [0, tabWidth, tabWidth * 2, tabWidth * 3]
                    })
                  }
                ]
              }
            ]}
          />
        )}
        {TABS.map((tab, idx) => {
          const isFocused = idx === activeIndex;

          const onPress = () => {
            if (isFocused) return;
            if (typeof router.navigate === 'function') {
              router.navigate(tab.path);
            } else {
              router.push(tab.path);
            }
          };

          const activeColor = theme.accent;
          const inactiveColor = theme.muted;

          return (
            <TouchableOpacity
              key={tab.name}
              onPress={onPress}
              style={styles.tabButton}
              activeOpacity={0.7}
            >
              <View style={styles.iconContainer}>
                <Icon name={tab.icon} size={20} color={isFocused ? activeColor : inactiveColor} />
              </View>
              <Text
                style={[
                  styles.tabLabel,
                  { color: isFocused ? activeColor : inactiveColor }
                ]}
                numberOfLines={1}
                ellipsizeMode="clip"
                adjustsFontSizeToFit
                minimumFontScale={0.75}
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
    width: '94%',
    maxWidth: 452,
    height: 58,
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderRadius: 9999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.35,
        shadowRadius: 20
      },
      android: {
        elevation: 14
      },
      web: {
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.22)',
        backdropFilter: 'blur(24px) saturate(190%)',
        WebkitBackdropFilter: 'blur(24px) saturate(190%)'
      }
    })
  },
  slidingPill: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    borderRadius: 9999,
    borderWidth: 1,
    zIndex: 1
  },
  tabButton: {
    height: 50,
    flex: 1,
    paddingHorizontal: 2,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    backgroundColor: 'transparent'
  },
  iconContainer: {
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2
  },
  tabLabel: {
    fontSize: 8.5,
    fontFamily: fontMedium,
    textAlign: 'center',
    includeFontPadding: false
  }
});
