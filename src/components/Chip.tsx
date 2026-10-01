import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text } from 'react-native';

import { useLayout } from '@/lib/layout';
import { colors, fonts } from '@/lib/theme';

import type { IconName } from './Button';
import { Focusable } from './Focusable';

interface Props {
  label: string;
  selected?: boolean;
  count?: number;
  icon?: IconName;
  onPress(): void;
}

export function Chip({ label, selected, count, icon, onPress }: Props) {
  const { s } = useLayout();
  const fontSize = s(14);
  const fg = selected ? '#0A0A0F' : colors.text;
  return (
    <Focusable
      onPress={onPress}
      zoom={1.06}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[
        styles.chip,
        { height: s(36), paddingHorizontal: s(16), borderRadius: s(18), gap: s(6) },
        selected && styles.selected,
      ]}
      focusStyle={styles.focused}
    >
      {icon && <Ionicons name={icon} size={Math.round(fontSize * 1.1)} color={fg} />}
      <Text style={[styles.label, { fontSize, color: fg }]} numberOfLines={1}>
        {label}
      </Text>
      {count !== undefined && (
        <Text style={[styles.count, { fontSize: s(12) }, selected && styles.countSelected]}>
          {count.toLocaleString()}
        </Text>
      )}
    </Focusable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: 'rgba(10,10,15,0.35)',
    maxWidth: 280,
  },
  selected: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },
  focused: { outlineWidth: 3, outlineColor: colors.accent, outlineOffset: 2, outlineStyle: 'solid' },
  label: { fontFamily: fonts.semibold, flexShrink: 1 },
  count: { color: colors.textMuted, fontFamily: fonts.medium, fontVariant: ['tabular-nums'] },
  countSelected: { color: '#4A4A55' },
});
