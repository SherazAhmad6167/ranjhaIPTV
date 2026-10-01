import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentProps } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useLayout } from '@/lib/layout';
import { colors, fonts, gradients } from '@/lib/theme';

import { Focusable } from './Focusable';

export type IconName = ComponentProps<typeof Ionicons>['name'];
/** An Ionicons name, or `{ material }` for the few symbols only Material has, like picture-in-picture. */
export type IconSpec = IconName | { material: ComponentProps<typeof MaterialIcons>['name'] };

type Variant = 'brand' | 'light' | 'glass' | 'danger';

const FG: Record<Variant, string> = {
  brand: '#fff',
  light: '#0A0A0F',
  glass: '#fff',
  danger: colors.danger,
};

interface ButtonProps {
  label: string;
  onPress(): void;
  icon?: IconName;
  variant?: Variant;
  busy?: boolean;
  disabled?: boolean;
  size?: 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
  hasTVPreferredFocus?: boolean;
}

export function Button({
  label,
  onPress,
  icon,
  variant = 'brand',
  busy,
  disabled,
  size = 'md',
  style,
  hasTVPreferredFocus,
}: ButtonProps) {
  const { s } = useLayout();
  const height = s(size === 'lg' ? 54 : 46);
  const fontSize = s(size === 'lg' ? 17 : 15);
  const fg = FG[variant];

  return (
    <Focusable
      onPress={onPress}
      disabled={busy || disabled}
      zoom={1.04}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy, disabled }}
      hasTVPreferredFocus={hasTVPreferredFocus}
      style={[
        styles.button,
        { height, borderRadius: s(size === 'lg' ? 14 : 12), paddingHorizontal: s(22) },
        variant === 'light' && styles.light,
        variant === 'glass' && styles.glass,
        variant === 'danger' && styles.danger,
        (disabled || busy) && styles.dim,
        style,
      ]}
      focusStyle={styles.focused}
    >
      {variant === 'brand' && (
        <LinearGradient
          colors={gradients.brandButton}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      <View style={[styles.content, { gap: s(8) }]}>
        {busy ? (
          <ActivityIndicator color={fg} size="small" />
        ) : (
          icon && <Ionicons name={icon} size={Math.round(fontSize * 1.35)} color={fg} />
        )}
        <Text style={[styles.label, { color: fg, fontSize }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Focusable>
  );
}

interface IconButtonProps {
  icon: IconSpec;
  label: string;
  onPress(): void;
  /** Diameter in phone points; scaled for the screen. */
  size?: number;
  color?: string;
  /** Translucent disc behind the icon. */
  filled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function IconButton({
  icon,
  label,
  onPress,
  size = 42,
  color = colors.text,
  filled,
  busy,
  style,
}: IconButtonProps) {
  const { s } = useLayout();
  const d = s(size);
  return (
    <Focusable
      onPress={onPress}
      disabled={busy}
      zoom={1.1}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        styles.icon,
        { width: d, height: d, borderRadius: d / 2 },
        filled && styles.iconFilled,
        style,
      ]}
      focusStyle={styles.iconFocused}
    >
      {({ focused }) =>
        busy ? (
          <ActivityIndicator color={color} size="small" />
        ) : typeof icon === 'string' ? (
          <Ionicons name={icon} size={Math.round(d * 0.52)} color={focused ? '#0A0A0F' : color} />
        ) : (
          <MaterialIcons name={icon.material} size={Math.round(d * 0.52)} color={focused ? '#0A0A0F' : color} />
        )
      }
    </Focusable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: fonts.bold, letterSpacing: 0.2 },
  light: { backgroundColor: '#FFFFFF' },
  glass: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  danger: { backgroundColor: 'rgba(255,92,99,0.14)' },
  dim: { opacity: 0.6 },
  focused: { outlineWidth: 3, outlineColor: colors.focus, outlineOffset: 3, outlineStyle: 'solid' },
  icon: { alignItems: 'center', justifyContent: 'center' },
  iconFilled: {
    backgroundColor: 'rgba(20,20,28,0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  iconFocused: { backgroundColor: '#FFFFFF' },
});
