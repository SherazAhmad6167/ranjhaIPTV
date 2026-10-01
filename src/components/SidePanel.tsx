import { useEffect, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLayout } from '@/lib/layout';
import { colors, fonts } from '@/lib/theme';

import { IconButton } from './Button';
import { NATIVE_DRIVER } from './Focusable';

/** A sheet that slides in from the right edge, over the video. */
export function SidePanel({
  open,
  width,
  title,
  subtitle,
  onClose,
  children,
}: {
  open: boolean;
  width: number;
  title: string;
  subtitle?: string;
  onClose(): void;
  children: ReactNode;
}) {
  const { s } = useLayout();
  const insets = useSafeAreaInsets();
  const [slide] = useState(() => new Animated.Value(0));
  const [mounted, setMounted] = useState(open);

  if (open && !mounted) setMounted(true);

  useEffect(() => {
    Animated.timing(slide, {
      toValue: open ? 1 : 0,
      duration: 260,
      useNativeDriver: NATIVE_DRIVER,
    }).start(({ finished }) => {
      if (finished && !open) setMounted(false);
    });
  }, [open, slide]);

  if (!mounted) return null;

  return (
    <Animated.View
      style={[
        styles.panel,
        {
          width: width + insets.right,
          paddingRight: insets.right,
          transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [width + insets.right, 0] }) }],
        },
      ]}
    >
      <View style={[styles.header, { paddingTop: insets.top + s(16), paddingHorizontal: s(18), paddingBottom: s(12) }]}>
        <View style={styles.flex}>
          <Text style={[styles.title, { fontSize: s(20) }]}>{title}</Text>
          {subtitle ? <Text style={[styles.subtitle, { fontSize: s(13) }]}>{subtitle}</Text> : null}
        </View>
        <IconButton icon="close" label={`Close ${title}`} onPress={onClose} size={40} />
      </View>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(10,10,15,0.94)',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: 'rgba(255,255,255,0.12)',
  },
  flex: { flex: 1, minWidth: 0 },
  header: { flexDirection: 'row', alignItems: 'center' },
  title: { color: colors.text, fontFamily: fonts.extrabold },
  subtitle: { color: colors.textMuted, fontFamily: fonts.medium, marginTop: 2 },
});
