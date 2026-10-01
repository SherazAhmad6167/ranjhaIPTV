import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLayout } from '@/lib/layout';
import { colors, fonts } from '@/lib/theme';

import { IconButton } from './Button';

interface Props {
  title?: string;
  subtitle?: string;
  /** Replaces the title, e.g. with a search field. */
  children?: ReactNode;
  right?: ReactNode;
}

export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export function ScreenHeader({ title, subtitle, children, right }: Props) {
  const insets = useSafeAreaInsets();
  const { s, gutter } = useLayout();
  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: insets.top + s(10),
          paddingBottom: s(14),
          paddingLeft: gutter + insets.left - s(8),
          paddingRight: gutter + insets.right,
          gap: s(10),
        },
      ]}
    >
      <IconButton icon="arrow-back" label="Back" onPress={goBack} size={44} />
      {children ?? (
        <View style={styles.titles}>
          <Text style={[styles.title, { fontSize: s(26) }]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { fontSize: s(14) }]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      )}
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center' },
  titles: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontFamily: fonts.extrabold, letterSpacing: -0.2 },
  subtitle: { color: colors.textMuted, fontFamily: fonts.medium, marginTop: 2 },
});
