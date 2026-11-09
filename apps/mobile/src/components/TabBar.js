import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme.js';
import Icon from './Icon.js';

export default function TabBar({ state, descriptors, navigation }) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  const getRouteInfo = (routeName) => {
    switch (routeName) {
      case 'index':
        return { label: 'Home', icon: 'home' };
      case 'chat':
        return { label: 'Chat', icon: 'chat' };
      case 'workspaces':
      case 'bridges':
        return { label: 'Workspaces', icon: 'grid' };
      case 'settings':
        return { label: 'Settings', icon: 'settings' };
      default:
        return { label: routeName, icon: 'home' };
    }
  };

  const bottomMargin = Math.max(insets.bottom, 14);

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
            borderColor: theme.border
          }
        ]}
      >
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const { label, icon } = getRouteInfo(route.name);

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const activeBg = `${theme.accent}2E`;
          const activeColor = theme.accent;
          const inactiveColor = theme.muted;

          return (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              style={[
                styles.tabButton,
                isFocused && { backgroundColor: activeBg }
              ]}
              activeOpacity={0.8}
            >
              <View style={styles.iconContainer}>
                <Icon name={icon} size={20} color={isFocused ? activeColor : inactiveColor} />
              </View>
              <Text
                style={[
                  styles.tabLabel,
                  { color: isFocused ? activeColor : inactiveColor }
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

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
    borderRadius: 22,
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
    borderRadius: 16,
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
    fontWeight: '500'
  }
});
