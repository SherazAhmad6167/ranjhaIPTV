import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

export const NATIVE_DRIVER = Platform.OS !== 'web';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface FocusState {
  /** Focused with a TV remote / keyboard, or hovered with a mouse. */
  focused: boolean;
  pressed: boolean;
}

interface Props extends Omit<PressableProps, 'style' | 'children'> {
  style?: StyleProp<ViewStyle>;
  /** Added while focused or hovered. */
  focusStyle?: StyleProp<ViewStyle>;
  /** Scale while focused or hovered, e.g. 1.06 for cards. */
  zoom?: number;
  children?: ReactNode | ((state: FocusState) => ReactNode);
}

/**
 * Pressable that reacts to every input the app runs with: touch (press-in
 * shrink), mouse (hover) and D-pad / keyboard focus on TVs and desktops.
 */
export function Focusable({
  style,
  focusStyle,
  zoom = 1,
  children,
  onFocus,
  onBlur,
  onHoverIn,
  onHoverOut,
  onPressIn,
  onPressOut,
  ...rest
}: Props) {
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  const active = focused || hovered;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: pressed ? 0.965 : active ? zoom : 1,
      useNativeDriver: NATIVE_DRIVER,
      friction: 7,
      tension: 160,
    }).start();
  }, [scale, pressed, active, zoom]);

  return (
    <AnimatedPressable
      {...rest}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      onHoverIn={(e) => {
        setHovered(true);
        onHoverIn?.(e);
      }}
      onHoverOut={(e) => {
        setHovered(false);
        onHoverOut?.(e);
      }}
      onPressIn={(e) => {
        setPressed(true);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        onPressOut?.(e);
      }}
      // Every usage draws its own focus state, so the browser's default outline is turned off.
      style={[styles.base, style, active && focusStyle, { transform: [{ scale }] }]}
    >
      {typeof children === 'function' ? children({ focused: active, pressed }) : children}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: { outlineWidth: 0 },
});
