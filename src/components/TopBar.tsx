import { LinearGradient } from 'expo-linear-gradient';
import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLayout } from '@/lib/layout';
import { colors, fonts, gradients } from '@/lib/theme';

import { IconButton, type IconName } from './Button';
import { Chip } from './Chip';
import { Focusable } from './Focusable';
import { Wordmark } from './Logo';

export interface Tab {
  key: string;
  label: string;
  icon: IconName;
}

interface Props {
  scrollY: Animated.Value;
  tabs: Tab[];
  active: string;
  onTab(key: string): void;
  onSearch(): void;
  onAccount(): void;
  userName: string;
}

/** Height of the bar, so screens can pad their content below it. */
export function useTopBarHeight(tabCount: number) {
  const insets = useSafeAreaInsets();
  const { s, wide } = useLayout();
  return insets.top + s(64) + (!wide && tabCount > 1 ? s(48) : 0);
}

export function TopBar({ scrollY, tabs, active, onTab, onSearch, onAccount, userName }: Props) {
  const insets = useSafeAreaInsets();
  const { s, wide, gutter } = useLayout();
  const height = useTopBarHeight(tabs.length);
  const solid = scrollY.interpolate({ inputRange: [0, s(160)], outputRange: [0, 1], extrapolate: 'clamp' });
  const showTabs = tabs.length > 1;

  return (
    <View style={[styles.bar, { height }]} pointerEvents="box-none">
      <LinearGradient colors={gradients.scrimTop} style={[StyleSheet.absoluteFill, styles.scrim]} pointerEvents="none" />
      <Animated.View style={[StyleSheet.absoluteFill, styles.solid, { opacity: solid }]} pointerEvents="none" />

      <View
        style={[
          styles.row,
          {
            marginTop: insets.top,
            height: s(64),
            paddingLeft: gutter + insets.left,
            paddingRight: gutter + insets.right,
            gap: s(wide ? 28 : 12),
          },
        ]}
      >
        <Wordmark size={s(wide ? 30 : 26)} />
        {wide && showTabs && (
          <View style={[styles.tabs, { gap: s(6) }]}>
            {tabs.map((t) => (
              <TextTab key={t.key} label={t.label} active={t.key === active} onPress={() => onTab(t.key)} />
            ))}
          </View>
        )}
        <View style={styles.spacer} />
        <IconButton icon="search" label="Search" onPress={onSearch} />
        <Focusable
          onPress={onAccount}
          zoom={1.1}
          accessibilityRole="button"
          accessibilityLabel="Account"
          style={[styles.avatar, { width: s(34), height: s(34), borderRadius: s(8) }]}
          focusStyle={styles.avatarFocused}
        >
          <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <Text style={[styles.avatarText, { fontSize: s(16) }]}>{(userName[0] ?? '?').toUpperCase()}</Text>
        </Focusable>
      </View>

      {!wide && showTabs && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.pills, { paddingHorizontal: gutter, gap: s(8), height: s(48) }]}
        >
          {tabs.map((t) => (
            <Chip key={t.key} label={t.label} icon={t.icon} selected={t.key === active} onPress={() => onTab(t.key)} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function TextTab({ label, active, onPress }: { label: string; active: boolean; onPress(): void }) {
  const { s } = useLayout();
  return (
    <Focusable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={[styles.tab, { paddingHorizontal: s(12), height: s(40), borderRadius: s(8) }]}
      focusStyle={styles.tabFocused}
    >
      {({ focused }) => (
        <>
          <Text style={[styles.tabText, { fontSize: s(15) }, (active || focused) && styles.tabTextActive]}>{label}</Text>
          {active && (
            <LinearGradient
              colors={gradients.brand}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.tabBar, { height: s(3), left: s(12), right: s(12) }]}
            />
          )}
        </>
      )}
    </Focusable>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  scrim: { bottom: -24 },
  solid: {
    backgroundColor: 'rgba(7,7,11,0.96)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  tabs: { flexDirection: 'row', alignItems: 'center' },
  spacer: { flex: 1 },
  tab: { justifyContent: 'center' },
  tabFocused: { backgroundColor: 'rgba(255,255,255,0.1)' },
  tabText: { color: colors.textMuted, fontFamily: fonts.semibold },
  tabTextActive: { color: colors.text },
  tabBar: { position: 'absolute', bottom: 2, borderRadius: 2 },
  avatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarFocused: { outlineWidth: 3, outlineColor: colors.focus, outlineOffset: 2, outlineStyle: 'solid' },
  avatarText: { color: '#fff', fontFamily: fonts.extrabold },
  pills: { alignItems: 'center' },
});
