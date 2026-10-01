import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';

import { useLayout } from '@/lib/layout';
import { colors, tileGradient } from '@/lib/theme';

import { NATIVE_DRIVER } from './Focusable';

const ROW_MS = 70_000;

/**
 * A slowly drifting, tilted wall of title cards behind the login form, in the
 * spirit of a cinema lobby. Pure shapes, so it needs no artwork or network.
 */
export function PosterWall() {
  const { width, height, s } = useLayout();
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => {});
  }, []);

  const tileW = s(150);
  const tileH = Math.round(tileW * 0.6);
  const gap = s(12);
  // The wall is rotated, so it must overhang the screen on every side.
  const span = Math.hypot(width, height) * 1.15;
  const rows = Math.ceil(span / (tileH + gap)) + 1;
  const perRow = Math.ceil(span / (tileW + gap)) + 1;
  const rowWidth = perRow * (tileW + gap);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View
        style={[
          styles.wall,
          {
            width: span,
            height: span,
            left: (width - span) / 2,
            top: (height - span) / 2,
            gap,
          },
        ]}
      >
        {Array.from({ length: rows }, (_, r) => (
          <Row
            key={r}
            row={r}
            count={perRow}
            tileW={tileW}
            tileH={tileH}
            gap={gap}
            distance={rowWidth}
            animate={!reduceMotion}
          />
        ))}
      </View>
      <LinearGradient
        colors={['rgba(7,7,11,0.72)', 'rgba(7,7,11,0.86)', colors.bg]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['rgba(255,36,71,0.22)', 'rgba(255,36,71,0)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.6 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

function Row({
  row,
  count,
  tileW,
  tileH,
  gap,
  distance,
  animate,
}: {
  row: number;
  count: number;
  tileW: number;
  tileH: number;
  gap: number;
  distance: number;
  animate: boolean;
}) {
  const x = useRef(new Animated.Value(0)).current;
  const reverse = row % 2 === 1;

  useEffect(() => {
    if (!animate) return;
    const loop = Animated.loop(
      Animated.timing(x, {
        toValue: 1,
        duration: ROW_MS + row * 4000,
        easing: Easing.linear,
        useNativeDriver: NATIVE_DRIVER,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [x, animate, row]);

  // Two copies of the row, so sliding by one copy's width loops seamlessly.
  const tiles = useMemo(
    () =>
      Array.from({ length: count * 2 }, (_, i) => {
        const seed = `${row}:${i % count}`;
        const [from] = tileGradient(seed);
        return { key: i, color: from, play: (row * 7 + (i % count)) % 5 === 0, dim: ((row + i) % 3) * 0.12 };
      }),
    [count, row],
  );

  const translateX = x.interpolate({
    inputRange: [0, 1],
    outputRange: reverse ? [-distance, 0] : [0, -distance],
  });

  return (
    <Animated.View style={[styles.row, { gap, transform: [{ translateX }] }]}>
      {tiles.map((t) => (
        <View
          key={t.key}
          style={[
            styles.tile,
            { width: tileW, height: tileH, backgroundColor: t.color, opacity: 0.85 - t.dim },
          ]}
        >
          {t.play && <Ionicons name="play" size={tileH * 0.32} color="rgba(255,255,255,0.35)" />}
        </View>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wall: { position: 'absolute', transform: [{ rotate: '-12deg' }] },
  row: { flexDirection: 'row' },
  tile: { borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
