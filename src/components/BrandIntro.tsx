import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { colors, fonts } from '@/lib/theme';

import { NATIVE_DRIVER } from './Focusable';
import { LogoMark } from './Logo';

/** Matches `imageWidth` of the expo-splash-screen plugin in app.json. */
const SPLASH_IMAGE_WIDTH = 180;
/** Visible height of the mark inside the square splash image (600 of 1024 units). */
const MARK_HEIGHT = (SPLASH_IMAGE_WIDTH * 600) / 1024;

/**
 * Plays once at launch, on top of the first screen. It starts on the exact
 * frame the native splash screen shows, so the hand-off is invisible.
 */
export function BrandIntro({ onDone }: { onDone(): void }) {
  const { width, height } = useWindowDimensions();
  const glow = useRef(new Animated.Value(0)).current;
  const word = useRef(new Animated.Value(0)).current;
  const exit = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    const run = (reduceMotion: boolean) => {
      if (cancelled) return;
      const timing = (value: Animated.Value, duration: number, easing = Easing.out(Easing.cubic)) =>
        Animated.timing(value, { toValue: 1, duration, easing, useNativeDriver: NATIVE_DRIVER });
      const animation = reduceMotion
        ? Animated.sequence([timing(word, 250), Animated.delay(500), timing(exit, 250)])
        : Animated.sequence([
            timing(glow, 650),
            timing(word, 500),
            Animated.delay(550),
            timing(exit, 480, Easing.in(Easing.cubic)),
          ]);
      animation.start(() => {
        if (!cancelled) onDone();
      });
    };
    AccessibilityInfo.isReduceMotionEnabled()
      .then(run)
      .catch(() => run(false));
    return () => {
      cancelled = true;
    };
  }, [glow, word, exit, onDone]);

  const markScale = Animated.multiply(
    glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }),
    exit.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }),
  );
  const glowSize = Math.max(width, height) * 0.9;
  const textSize = Math.round(Math.min(width, height) * 0.055 + 8);

  return (
    <Animated.View
      style={[styles.overlay, { opacity: exit.interpolate({ inputRange: [0, 0.4, 1], outputRange: [1, 1, 0] }) }]}
      pointerEvents="none"
    >
      <Animated.View
        style={[
          styles.center,
          { width: glowSize, height: glowSize, marginLeft: -glowSize / 2, marginTop: -glowSize / 2, opacity: glow },
        ]}
      >
        <Svg width={glowSize} height={glowSize}>
          <Defs>
            <RadialGradient id="introGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={colors.accent} stopOpacity="0.38" />
              <Stop offset="0.4" stopColor={colors.accent} stopOpacity="0.12" />
              <Stop offset="1" stopColor={colors.accent} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect width={glowSize} height={glowSize} fill="url(#introGlow)" />
        </Svg>
      </Animated.View>

      <Animated.View
        style={[
          styles.center,
          {
            width: SPLASH_IMAGE_WIDTH,
            height: SPLASH_IMAGE_WIDTH,
            marginLeft: -SPLASH_IMAGE_WIDTH / 2,
            marginTop: -SPLASH_IMAGE_WIDTH / 2,
            transform: [{ scale: markScale }],
          },
        ]}
      >
        <LogoMark size={SPLASH_IMAGE_WIDTH} splashFrame />
      </Animated.View>

      <Animated.View
        style={[
          styles.word,
          {
            top: height / 2 + MARK_HEIGHT / 2 + 28,
            opacity: Animated.multiply(word, exit.interpolate({ inputRange: [0, 0.5], outputRange: [1, 0], extrapolate: 'clamp' })),
            transform: [{ translateY: word.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
          },
        ]}
      >
        {/* Letter spacing trails the last letter too; the left padding keeps the word optically centred. */}
        <Text style={[styles.wordText, { fontSize: textSize, letterSpacing: textSize * 0.28, paddingLeft: textSize * 0.28 }]}>
          RANJHA<Text style={styles.play}> PLAY</Text>
        </Text>
        <View style={[styles.rule, { width: textSize * 3 }]} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: colors.bg, zIndex: 100 },
  center: { position: 'absolute', left: '50%', top: '50%', alignItems: 'center', justifyContent: 'center' },
  word: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  wordText: { color: colors.text, fontFamily: fonts.black, includeFontPadding: false },
  play: { color: colors.accent },
  rule: { height: 2, marginTop: 14, borderRadius: 1, backgroundColor: colors.accent, opacity: 0.8 },
});
