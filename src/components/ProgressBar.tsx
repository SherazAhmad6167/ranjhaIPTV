import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors } from '@/lib/theme';

/** The thin "watched so far" bar drawn under a title's artwork. */
export function ProgressBar({
  value,
  height = 3,
  style,
}: {
  /** 0 to 1. */
  value: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <View
      pointerEvents="none"
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      style={[styles.track, { height, borderRadius: height / 2 }, style]}
    >
      <View style={[styles.fill, { width: `${percent}%`, borderRadius: height / 2 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.28)' },
  fill: { height: '100%', backgroundColor: colors.accent },
});
