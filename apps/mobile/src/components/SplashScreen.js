import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
  Platform
} from 'react-native';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const ACCENT = '#6C63FF';
const ACCENT2 = '#4F9EFF';
const ACCENT3 = '#FF6B9D';
const DARK_BG = '#080810';

function Orb({ delay, size, x, y, color, duration }) {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          damping: 14,
          stiffness: 80,
          useNativeDriver: true
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 900,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        })
      ]).start(() => {
        Animated.loop(
          Animated.sequence([
            Animated.timing(translateY, {
              toValue: -12,
              duration: duration || 2800,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true
            }),
            Animated.timing(translateY, {
              toValue: 12,
              duration: duration || 2800,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true
            })
          ])
        ).start();
      });
    }, delay);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View
      style={[
        styles.orb,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          left: x - size / 2,
          top: y - size / 2,
          opacity,
          transform: [{ scale }, { translateY }]
        }
      ]}
    />
  );
}

function GridLine({ isHorizontal, position, opacity }) {
  return (
    <Animated.View
      style={[
        isHorizontal ? styles.gridLineH : styles.gridLineV,
        isHorizontal ? { top: position } : { left: position },
        { opacity }
      ]}
    />
  );
}

export default function SplashScreen({ onFinished }) {
  const masterOpacity = useRef(new Animated.Value(1)).current;
  const logoScale = useRef(new Animated.Value(0.3)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const taglineY = useRef(new Animated.Value(16)).current;
  const gridOpacity = useRef(new Animated.Value(0)).current;
  const ringScale1 = useRef(new Animated.Value(0.4)).current;
  const ringOpacity1 = useRef(new Animated.Value(0)).current;
  const ringScale2 = useRef(new Animated.Value(0.4)).current;
  const ringOpacity2 = useRef(new Animated.Value(0)).current;
  const ringScale3 = useRef(new Animated.Value(0.4)).current;
  const ringOpacity3 = useRef(new Animated.Value(0)).current;
  const scanLineY = useRef(new Animated.Value(-SCREEN_H * 0.3)).current;
  const scanLineOpacity = useRef(new Animated.Value(0)).current;
  const [done, setDone] = useState(false);

  useEffect(() => {
    Animated.timing(gridOpacity, {
      toValue: 1,
      duration: 600,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true
    }).start();

    setTimeout(() => {
      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1,
          damping: 12,
          stiffness: 120,
          useNativeDriver: true
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true
        })
      ]).start();
    }, 300);

    setTimeout(() => {
      Animated.parallel([
        Animated.spring(ringScale1, { toValue: 1, damping: 10, stiffness: 60, useNativeDriver: true }),
        Animated.timing(ringOpacity1, { toValue: 0.35, duration: 500, useNativeDriver: true })
      ]).start(() => {
        Animated.loop(
          Animated.sequence([
            Animated.timing(ringOpacity1, { toValue: 0.12, duration: 1600, useNativeDriver: true }),
            Animated.timing(ringOpacity1, { toValue: 0.35, duration: 1600, useNativeDriver: true })
          ])
        ).start();
      });
    }, 500);

    setTimeout(() => {
      Animated.parallel([
        Animated.spring(ringScale2, { toValue: 1, damping: 10, stiffness: 50, useNativeDriver: true }),
        Animated.timing(ringOpacity2, { toValue: 0.22, duration: 500, useNativeDriver: true })
      ]).start(() => {
        Animated.loop(
          Animated.sequence([
            Animated.timing(ringOpacity2, { toValue: 0.08, duration: 2000, useNativeDriver: true }),
            Animated.timing(ringOpacity2, { toValue: 0.22, duration: 2000, useNativeDriver: true })
          ])
        ).start();
      });
    }, 650);

    setTimeout(() => {
      Animated.parallel([
        Animated.spring(ringScale3, { toValue: 1, damping: 10, stiffness: 40, useNativeDriver: true }),
        Animated.timing(ringOpacity3, { toValue: 0.14, duration: 500, useNativeDriver: true })
      ]).start(() => {
        Animated.loop(
          Animated.sequence([
            Animated.timing(ringOpacity3, { toValue: 0.05, duration: 2400, useNativeDriver: true }),
            Animated.timing(ringOpacity3, { toValue: 0.14, duration: 2400, useNativeDriver: true })
          ])
        ).start();
      });
    }, 800);

    setTimeout(() => {
      scanLineOpacity.setValue(1);
      Animated.loop(
        Animated.sequence([
          Animated.timing(scanLineY, {
            toValue: SCREEN_H * 0.3,
            duration: 1800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true
          }),
          Animated.timing(scanLineY, {
            toValue: -SCREEN_H * 0.3,
            duration: 1800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true
          })
        ])
      ).start();
    }, 600);

    setTimeout(() => {
      Animated.parallel([
        Animated.timing(taglineOpacity, {
          toValue: 1,
          duration: 500,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true
        }),
        Animated.timing(taglineY, {
          toValue: 0,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        })
      ]).start();
    }, 900);

    setTimeout(() => {
      Animated.timing(masterOpacity, {
        toValue: 0,
        duration: 500,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true
      }).start(() => {
        setDone(true);
        if (onFinished) onFinished();
      });
    }, 2600);
  }, []);

  if (done) return null;

  const gridLines = [];
  const lineCount = 10;
  for (let i = 0; i <= lineCount; i++) {
    gridLines.push(
      <GridLine key={`h${i}`} isHorizontal position={(SCREEN_H / lineCount) * i} opacity={gridOpacity} />,
      <GridLine key={`v${i}`} isHorizontal={false} position={(SCREEN_W / lineCount) * i} opacity={gridOpacity} />
    );
  }

  const CX = SCREEN_W / 2;
  const CY = SCREEN_H * 0.42;

  return (
    <Animated.View style={[styles.container, { opacity: masterOpacity }]}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {gridLines}
      </View>

      <Orb delay={200} size={280} x={CX - 80} y={CY - 60} color={`${ACCENT}30`} duration={3400} />
      <Orb delay={350} size={200} x={CX + 90} y={CY + 50} color={`${ACCENT2}28`} duration={2900} />
      <Orb delay={500} size={150} x={CX - 100} y={CY + 80} color={`${ACCENT3}22`} duration={3200} />

      <View style={[styles.logoCenter, { top: CY - 80 }]}>
        <Animated.View style={[styles.ringOuter3, { transform: [{ scale: ringScale3 }], opacity: ringOpacity3 }]} />
        <Animated.View style={[styles.ringOuter2, { transform: [{ scale: ringScale2 }], opacity: ringOpacity2 }]} />
        <Animated.View style={[styles.ringOuter1, { transform: [{ scale: ringScale1 }], opacity: ringOpacity1 }]} />

        <Animated.View style={{ opacity: scanLineOpacity, overflow: 'hidden', ...StyleSheet.absoluteFillObject, borderRadius: 60 }}>
          <Animated.View style={[styles.scanLine, { transform: [{ translateY: scanLineY }] }]} />
        </Animated.View>

        <Animated.View style={[styles.logoBox, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
          <View style={styles.logoInner}>
            <Text style={styles.logoLetterA}>AG</Text>
          </View>
        </Animated.View>

        <Animated.View style={[styles.taglineWrap, { opacity: taglineOpacity, transform: [{ translateY: taglineY }] }]}>
          <Text style={styles.appName}>AG Remote</Text>
          <Text style={styles.tagline}>Your AI, Anywhere</Text>
        </Animated.View>
      </View>

      <View style={styles.bottomBadge}>
        <View style={styles.dotRow}>
          {[ACCENT, ACCENT2, ACCENT3].map((c, i) => (
            <View key={i} style={[styles.dot, { backgroundColor: c }]} />
          ))}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: DARK_BG,
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'center'
  },
  gridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(108, 99, 255, 0.12)'
  },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(108, 99, 255, 0.12)'
  },
  orb: {
    position: 'absolute'
  },
  logoCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center'
  },
  ringOuter1: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 1.5,
    borderColor: ACCENT,
    alignSelf: 'center',
    top: -30
  },
  ringOuter2: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    borderWidth: 1,
    borderColor: ACCENT2,
    alignSelf: 'center',
    top: -70
  },
  ringOuter3: {
    position: 'absolute',
    width: 390,
    height: 390,
    borderRadius: 195,
    borderWidth: 1,
    borderColor: ACCENT3,
    alignSelf: 'center',
    top: -115
  },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: `${ACCENT}88`
  },
  logoBox: {
    width: 100,
    height: 100,
    borderRadius: 28,
    backgroundColor: 'rgba(108, 99, 255, 0.18)',
    borderWidth: 1.5,
    borderColor: `${ACCENT}80`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
    ...Platform.select({
      ios: {
        shadowColor: ACCENT,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.9,
        shadowRadius: 30
      },
      android: { elevation: 20 }
    })
  },
  logoInner: {
    alignItems: 'center',
    justifyContent: 'center'
  },
  logoLetterA: {
    fontSize: 34,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 2
  },
  taglineWrap: {
    alignItems: 'center'
  },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 1,
    marginBottom: 6
  },
  tagline: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 2.5,
    textTransform: 'uppercase'
  },
  bottomBadge: {
    position: 'absolute',
    bottom: 60,
    alignItems: 'center'
  },
  dotRow: {
    flexDirection: 'row',
    gap: 8
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    opacity: 0.7
  }
});
