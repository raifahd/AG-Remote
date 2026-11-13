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

const COLOR_PURPLE = '#7C5CFF';
const COLOR_BLUE = '#4385F5';
const COLOR_CYAN = '#25C9DF';
const COLOR_PINK = '#ED5BA6';
const COLOR_GREEN = '#28C77B';
const COLOR_AMBER = '#F1B83A';

function AmbientAura({ delay, size, x, y, color, duration }) {
  const scale = useRef(new Animated.Value(0.7)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 800,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true
        }),
        Animated.spring(scale, {
          toValue: 1,
          friction: 6,
          tension: 40,
          useNativeDriver: true
        })
      ]).start(() => {
        Animated.loop(
          Animated.sequence([
            Animated.timing(scale, {
              toValue: 1.15,
              duration: duration || 3000,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true
            }),
            Animated.timing(scale, {
              toValue: 0.9,
              duration: duration || 3000,
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
      pointerEvents="none"
      style={[
        styles.auraOrb,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          left: x - size / 2,
          top: y - size / 2,
          opacity,
          transform: [{ scale }]
        }
      ]}
    />
  );
}

function HudCorner({ position }) {
  const isTop = position.includes('top');
  const isLeft = position.includes('left');

  return (
    <View
      style={[
        styles.hudCorner,
        isTop ? { top: 32 } : { bottom: 32 },
        isLeft ? { left: 28 } : { right: 28 }
      ]}
    >
      <View
        style={[
          styles.hudCornerLineH,
          isLeft ? { left: 0 } : { right: 0 },
          isTop ? { top: 0 } : { bottom: 0 }
        ]}
      />
      <View
        style={[
          styles.hudCornerLineV,
          isLeft ? { left: 0 } : { right: 0 },
          isTop ? { top: 0 } : { bottom: 0 }
        ]}
      />
    </View>
  );
}

export default function SplashScreen({ onFinished }) {
  const masterOpacity = useRef(new Animated.Value(1)).current;
  const coreScale = useRef(new Animated.Value(0.5)).current;
  const coreOpacity = useRef(new Animated.Value(0)).current;
  const coreRotate = useRef(new Animated.Value(0)).current;
  const ringsScale = useRef(new Animated.Value(0.6)).current;
  const ringsOpacity = useRef(new Animated.Value(0)).current;
  const ringsSpin = useRef(new Animated.Value(0)).current;
  const ringsSpinReverse = useRef(new Animated.Value(0)).current;
  const shimmerTranslate = useRef(new Animated.Value(-120)).current;
  const shimmerOpacity = useRef(new Animated.Value(0)).current;
  const typographyOpacity = useRef(new Animated.Value(0)).current;
  const typographyY = useRef(new Animated.Value(18)).current;
  const statusOpacity = useRef(new Animated.Value(0)).current;
  const statusY = useRef(new Animated.Value(14)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const beaconScale = useRef(new Animated.Value(1)).current;

  const [statusMessage, setStatusMessage] = useState('INITIALIZING ENGINE');

  useEffect(() => {
    Animated.loop(
      Animated.timing(ringsSpin, {
        toValue: 1,
        duration: 12000,
        easing: Easing.linear,
        useNativeDriver: true
      })
    ).start();

    Animated.loop(
      Animated.timing(ringsSpinReverse, {
        toValue: 1,
        duration: 9000,
        easing: Easing.linear,
        useNativeDriver: true
      })
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(beaconScale, {
          toValue: 1.4,
          duration: 800,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true
        }),
        Animated.timing(beaconScale, {
          toValue: 1,
          duration: 800,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true
        })
      ])
    ).start();

    Animated.parallel([
      Animated.spring(ringsScale, {
        toValue: 1,
        damping: 15,
        stiffness: 70,
        useNativeDriver: true
      }),
      Animated.timing(ringsOpacity, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true
      })
    ]).start();

    setTimeout(() => {
      Animated.parallel([
        Animated.spring(coreScale, {
          toValue: 1,
          damping: 11,
          stiffness: 110,
          useNativeDriver: true
        }),
        Animated.timing(coreOpacity, {
          toValue: 1,
          duration: 550,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true
        })
      ]).start();
    }, 200);

    setTimeout(() => {
      shimmerOpacity.setValue(0.7);
      Animated.timing(shimmerTranslate, {
        toValue: 140,
        duration: 850,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true
      }).start(() => {
        shimmerOpacity.setValue(0);
      });
    }, 600);

    setTimeout(() => {
      Animated.parallel([
        Animated.timing(typographyOpacity, {
          toValue: 1,
          duration: 500,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true
        }),
        Animated.timing(typographyY, {
          toValue: 0,
          duration: 550,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        })
      ]).start();
    }, 450);

    setTimeout(() => {
      Animated.parallel([
        Animated.timing(statusOpacity, {
          toValue: 1,
          duration: 450,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true
        }),
        Animated.timing(statusY, {
          toValue: 0,
          duration: 500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        }),
        Animated.timing(progressAnim, {
          toValue: 1,
          duration: 1300,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false
        })
      ]).start();
    }, 700);

    setTimeout(() => {
      setStatusMessage('AGENT CORE READY');
    }, 1450);

    setTimeout(() => {
      Animated.timing(masterOpacity, {
        toValue: 0,
        duration: 450,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true
      }).start(() => {
        if (onFinished) {
          onFinished();
        }
      });
    }, 2250);
  }, []);

  const spinInterpolation = ringsSpin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg']
  });

  const reverseSpinInterpolation = ringsSpinReverse.interpolate({
    inputRange: [0, 1],
    outputRange: ['360deg', '0deg']
  });

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [6, 140]
  });

  const CX = SCREEN_W / 2;
  const CY = SCREEN_H * 0.40;

  return (
    <Animated.View style={[styles.canvas, { opacity: masterOpacity }]}>
      <AmbientAura delay={50} size={300} x={CX - 30} y={CY - 40} color="rgba(124, 92, 255, 0.28)" duration={3200} />
      <AmbientAura delay={150} size={240} x={CX + 60} y={CY + 30} color="rgba(37, 201, 223, 0.24)" duration={2700} />
      <AmbientAura delay={250} size={200} x={CX - 70} y={CY + 50} color="rgba(237, 91, 166, 0.20)" duration={3100} />
      <AmbientAura delay={350} size={170} x={CX + 20} y={CY - 80} color="rgba(67, 133, 245, 0.22)" duration={2900} />

      <HudCorner position="top-left" />
      <HudCorner position="top-right" />
      <HudCorner position="bottom-left" />
      <HudCorner position="bottom-right" />

      <View style={[styles.stageCenter, { top: CY }]}>
        <Animated.View
          style={[
            styles.ringsContainer,
            {
              opacity: ringsOpacity,
              transform: [{ scale: ringsScale }]
            }
          ]}
        >
          <View style={styles.orbitRingOuter} />
          
          <Animated.View
            style={[
              styles.orbitRingMid,
              { transform: [{ rotate: spinInterpolation }] }
            ]}
          >
            <View style={[styles.satelliteDot, styles.satelliteDotCyan]} />
            <View style={[styles.satelliteDot, styles.satelliteDotAmber]} />
          </Animated.View>

          <Animated.View
            style={[
              styles.orbitRingInner,
              { transform: [{ rotate: reverseSpinInterpolation }] }
            ]}
          >
            <View style={[styles.satelliteDotInner, styles.satelliteDotPink]} />
            <View style={[styles.satelliteDotInner, styles.satelliteDotGreen]} />
          </Animated.View>

          <View style={styles.crosshairH} />
          <View style={styles.crosshairV} />
        </Animated.View>

        <Animated.View
          style={[
            styles.coreWrapper,
            {
              opacity: coreOpacity,
              transform: [{ scale: coreScale }]
            }
          ]}
        >
          <View style={styles.coreGlowBackdrop} />
          <View style={styles.coreCard}>
            <View style={styles.coreCornerAccentTL} />
            <View style={styles.coreCornerAccentBR} />

            <View style={styles.coreLevitationArrow}>
              <View style={styles.coreLevitationWingLeft} />
              <View style={styles.coreLevitationWingRight} />
              <View style={styles.coreLevitationPoint} />
            </View>

            <View style={styles.coreTextWrap}>
              <Text style={styles.coreMonogram}>AG</Text>
            </View>

            <Animated.View
              pointerEvents="none"
              style={[
                styles.shimmerBand,
                {
                  opacity: shimmerOpacity,
                  transform: [{ translateX: shimmerTranslate }]
                }
              ]}
            />
          </View>
        </Animated.View>

        <Animated.View
          style={[
            styles.typographyBlock,
            {
              opacity: typographyOpacity,
              transform: [{ translateY: typographyY }]
            }
          ]}
        >
          <Text style={styles.brandTitle}>AG REMOTE</Text>
          
          <View style={styles.categoryPill}>
            <View style={styles.spectrumStrip}>
              <View style={[styles.spectrumDot, { backgroundColor: COLOR_PURPLE }]} />
              <View style={[styles.spectrumDot, { backgroundColor: COLOR_BLUE }]} />
              <View style={[styles.spectrumDot, { backgroundColor: COLOR_CYAN }]} />
              <View style={[styles.spectrumDot, { backgroundColor: COLOR_PINK }]} />
              <View style={[styles.spectrumDot, { backgroundColor: COLOR_GREEN }]} />
            </View>
            <Text style={styles.categoryText}>ANTIGRAVITY COMPANION</Text>
          </View>
        </Animated.View>
      </View>

      <Animated.View
        style={[
          styles.footerDeck,
          {
            opacity: statusOpacity,
            transform: [{ translateY: statusY }]
          }
        ]}
      >
        <View style={styles.statusPill}>
          <Animated.View
            style={[
              styles.beaconDot,
              { transform: [{ scale: beaconScale }] }
            ]}
          />
          <Text style={styles.statusText}>{statusMessage}</Text>
        </View>

        <View style={styles.progressBarTrack}>
          <Animated.View
            style={[
              styles.progressBarFill,
              { width: progressWidth }
            ]}
          />
        </View>

        <Text style={styles.systemMetadata}>v0.1.0 • SECURE LOCAL LINK</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  auraOrb: {
    position: 'absolute'
  },
  hudCorner: {
    position: 'absolute',
    width: 18,
    height: 18
  },
  hudCornerLineH: {
    position: 'absolute',
    width: 14,
    height: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.22)'
  },
  hudCornerLineV: {
    position: 'absolute',
    width: 1.5,
    height: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.22)'
  },
  stageCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center'
  },
  ringsContainer: {
    position: 'absolute',
    width: 320,
    height: 320,
    alignItems: 'center',
    justifyContent: 'center'
  },
  orbitRingOuter: {
    position: 'absolute',
    width: 310,
    height: 310,
    borderRadius: 155,
    borderWidth: 1,
    borderColor: 'rgba(237, 91, 166, 0.16)',
    borderStyle: 'dashed'
  },
  orbitRingMid: {
    position: 'absolute',
    width: 236,
    height: 236,
    borderRadius: 118,
    borderWidth: 1.2,
    borderColor: 'rgba(124, 92, 255, 0.32)'
  },
  orbitRingInner: {
    position: 'absolute',
    width: 168,
    height: 168,
    borderRadius: 84,
    borderWidth: 1,
    borderColor: 'rgba(37, 201, 223, 0.28)'
  },
  satelliteDot: {
    position: 'absolute',
    width: 7,
    height: 7,
    borderRadius: 3.5
  },
  satelliteDotCyan: {
    top: -3.5,
    left: 115,
    backgroundColor: COLOR_CYAN,
    ...Platform.select({
      ios: {
        shadowColor: COLOR_CYAN,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.9,
        shadowRadius: 6
      },
      android: { elevation: 4 }
    })
  },
  satelliteDotAmber: {
    bottom: -3.5,
    right: 115,
    backgroundColor: COLOR_AMBER,
    ...Platform.select({
      ios: {
        shadowColor: COLOR_AMBER,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.9,
        shadowRadius: 6
      },
      android: { elevation: 4 }
    })
  },
  satelliteDotInner: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 2.5
  },
  satelliteDotPink: {
    top: 30,
    left: 12,
    backgroundColor: COLOR_PINK
  },
  satelliteDotGreen: {
    bottom: 30,
    right: 12,
    backgroundColor: COLOR_GREEN
  },
  crosshairH: {
    position: 'absolute',
    width: 280,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)'
  },
  crosshairV: {
    position: 'absolute',
    width: 1,
    height: 280,
    backgroundColor: 'rgba(255, 255, 255, 0.05)'
  },
  coreWrapper: {
    width: 112,
    height: 112,
    alignItems: 'center',
    justifyContent: 'center'
  },
  coreGlowBackdrop: {
    position: 'absolute',
    width: 116,
    height: 116,
    borderRadius: 34,
    backgroundColor: 'rgba(124, 92, 255, 0.35)',
    ...Platform.select({
      ios: {
        shadowColor: COLOR_PURPLE,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.8,
        shadowRadius: 28
      },
      android: { elevation: 18 }
    })
  },
  coreCard: {
    width: 104,
    height: 104,
    borderRadius: 30,
    backgroundColor: '#0c0c14',
    borderWidth: 1.5,
    borderColor: 'rgba(124, 92, 255, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  coreCornerAccentTL: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 16,
    height: 16,
    borderTopWidth: 2.5,
    borderLeftWidth: 2.5,
    borderColor: COLOR_CYAN,
    borderTopLeftRadius: 28
  },
  coreCornerAccentBR: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 16,
    height: 16,
    borderBottomWidth: 2.5,
    borderRightWidth: 2.5,
    borderColor: COLOR_PINK,
    borderBottomRightRadius: 28
  },
  coreLevitationArrow: {
    position: 'absolute',
    top: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row'
  },
  coreLevitationWingLeft: {
    width: 9,
    height: 2,
    backgroundColor: COLOR_CYAN,
    transform: [{ rotate: '-32deg' }]
  },
  coreLevitationPoint: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ffffff',
    marginHorizontal: 1
  },
  coreLevitationWingRight: {
    width: 9,
    height: 2,
    backgroundColor: COLOR_GREEN,
    transform: [{ rotate: '32deg' }]
  },
  coreTextWrap: {
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  coreMonogram: {
    fontSize: 36,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 2.5
  },
  shimmerBand: {
    position: 'absolute',
    top: -20,
    bottom: -20,
    width: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
    transform: [{ rotate: '25deg' }]
  },
  typographyBlock: {
    marginTop: 38,
    alignItems: 'center'
  },
  brandTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 3.5,
    marginBottom: 8
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 9999,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)'
  },
  spectrumStrip: {
    flexDirection: 'row',
    gap: 4,
    marginRight: 8
  },
  spectrumDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5
  },
  categoryText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.65)',
    letterSpacing: 2
  },
  footerDeck: {
    position: 'absolute',
    bottom: 52,
    alignItems: 'center'
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 9999,
    backgroundColor: '#0f0f17',
    borderWidth: 1,
    borderColor: 'rgba(124, 92, 255, 0.3)',
    marginBottom: 14
  },
  beaconDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLOR_GREEN,
    marginRight: 8
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ececec',
    letterSpacing: 1.8
  },
  progressBarTrack: {
    width: 140,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
    marginBottom: 14
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 1.5,
    backgroundColor: COLOR_CYAN
  },
  systemMetadata: {
    fontSize: 9.5,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.32)',
    letterSpacing: 1.6
  }
});
