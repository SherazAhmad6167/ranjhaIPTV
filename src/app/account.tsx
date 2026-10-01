import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { isPictureInPictureSupported } from 'expo-video';
import { useMemo, useState, type ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, type IconName } from '@/components/Button';
import { Focusable } from '@/components/Focusable';
import { LogoMark } from '@/components/Logo';
import { ScreenHeader } from '@/components/ScreenHeader';
import { KIND_ICONS, KIND_LABELS, KINDS } from '@/lib/catalog';
import { useLayout } from '@/lib/layout';
import { usePlaylist } from '@/lib/playlist-store';
import { preferences, usePreferences } from '@/lib/preferences';
import { colors, fonts, gradients } from '@/lib/theme';

// Phones and tablets only; TVs and most browsers have no floating window to offer.
const PIP_SUPPORTED = (() => {
  if (Platform.isTV || Platform.OS === 'web') return false;
  try {
    return isPictureInPictureSupported();
  } catch {
    return false;
  }
})();

export default function AccountScreen() {
  const { source, channels, loadedAt, loading, refresh, disconnect } = usePlaylist();
  const { autoPictureInPicture } = usePreferences();
  const { s, wide } = useLayout();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const stats = useMemo(
    () => KINDS.map((kind) => ({ kind, count: channels.filter((c) => c.kind === kind).length })),
    [channels],
  );
  const name = source?.username ?? '';

  const onRefresh = () => {
    setMessage(null);
    refresh()
      .then(() => setMessage({ ok: true, text: 'Your channels are up to date.' }))
      .catch((e: Error) => setMessage({ ok: false, text: e.message }));
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Account" />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: s(20), paddingBottom: insets.bottom + s(40), maxWidth: s(640) },
        ]}
      >
        <View style={[styles.profile, { borderRadius: s(20), padding: s(wide ? 28 : 20), gap: s(18) }]}>
          <LinearGradient
            colors={['rgba(255,36,71,0.22)', 'rgba(255,138,31,0.06)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.avatar, { width: s(72), height: s(72), borderRadius: s(18) }]}>
            <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <Text style={[styles.avatarText, { fontSize: s(32) }]}>{(name[0] ?? '?').toUpperCase()}</Text>
          </View>
          <View style={styles.profileText}>
            <Text style={[styles.label, { fontSize: s(12) }]}>SIGNED IN AS</Text>
            <Text style={[styles.name, { fontSize: s(24) }]} numberOfLines={1}>
              {name}
            </Text>
            {loadedAt ? (
              <Text style={[styles.meta, { fontSize: s(13) }]}>Updated {formatWhen(loadedAt)}</Text>
            ) : null}
          </View>
        </View>

        <View style={[styles.stats, { gap: s(12), marginTop: s(16) }]}>
          {stats.map((st) => (
            <Stat key={st.kind} icon={KIND_ICONS[st.kind]} label={KIND_LABELS[st.kind]} value={st.count} />
          ))}
        </View>

        {message && (
          <View
            style={[
              styles.message,
              message.ok ? styles.messageOk : styles.messageError,
              { padding: s(12), borderRadius: s(12), marginTop: s(16) },
            ]}
          >
            <Ionicons
              name={message.ok ? 'checkmark-circle' : 'alert-circle'}
              size={s(18)}
              color={message.ok ? colors.success : colors.danger}
            />
            <Text style={[styles.messageText, { fontSize: s(14) }]}>{message.text}</Text>
          </View>
        )}

        {PIP_SUPPORTED && (
          <>
            <Text style={[styles.section, { fontSize: s(12), marginTop: s(28), marginBottom: s(10) }]}>PLAYBACK</Text>
            <ToggleRow
              icon={<MaterialIcons name="picture-in-picture-alt" size={s(22)} color={colors.accent} />}
              title="Picture-in-picture"
              description="Keep watching in a small window when you leave the app"
              value={autoPictureInPicture}
              onChange={(value) => preferences.set({ autoPictureInPicture: value })}
            />
          </>
        )}

        <View style={[styles.actions, { gap: s(12), marginTop: s(24) }]}>
          <Button label="Refresh Channels" icon="refresh" variant="glass" size="lg" busy={loading} onPress={onRefresh} />
          <Button label="Sign Out" icon="log-out-outline" variant="danger" size="lg" onPress={() => disconnect()} />
        </View>

        <View style={[styles.footer, { marginTop: s(48), gap: s(10) }]}>
          <LogoMark size={s(28)} />
          <Text style={[styles.footerText, { fontSize: s(13) }]}>
            Ranjha Play · v{Constants.expoConfig?.version ?? '1.0.0'}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function Stat({ icon, label, value }: { icon: IconName; label: string; value: number }) {
  const { s } = useLayout();
  return (
    <View style={[styles.stat, { borderRadius: s(16), padding: s(16), gap: s(6) }]}>
      <Ionicons name={icon} size={s(22)} color={colors.accent} />
      <Text style={[styles.statValue, { fontSize: s(26) }]}>{value.toLocaleString()}</Text>
      <Text style={[styles.statLabel, { fontSize: s(13) }]}>{label}</Text>
    </View>
  );
}

function ToggleRow({
  icon,
  title,
  description,
  value,
  onChange,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  value: boolean;
  onChange(value: boolean): void;
}) {
  const { s } = useLayout();
  const trackWidth = s(46);
  const knob = s(22);
  return (
    <Focusable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityHint={description}
      accessibilityState={{ checked: value }}
      style={[styles.toggleRow, { borderRadius: s(16), padding: s(16), gap: s(14) }]}
      focusStyle={styles.toggleRowFocused}
    >
      {icon}
      <View style={styles.profileText}>
        <Text style={[styles.toggleTitle, { fontSize: s(16) }]}>{title}</Text>
        <Text style={[styles.toggleText, { fontSize: s(13) }]}>{description}</Text>
      </View>
      <View
        style={[
          styles.track,
          { width: trackWidth, height: knob + s(6), borderRadius: (knob + s(6)) / 2, padding: s(3) },
          value && styles.trackOn,
        ]}
      >
        <View
          style={[
            styles.knob,
            { width: knob, height: knob, borderRadius: knob / 2 },
            value && { transform: [{ translateX: trackWidth - knob - s(6) }] },
          ]}
        />
      </View>
    </Focusable>
  );
}

function formatWhen(t: number): string {
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(t).toLocaleDateString();
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { width: '100%', alignSelf: 'center' },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarText: { color: '#fff', fontFamily: fonts.black },
  profileText: { flex: 1, minWidth: 0 },
  label: { color: colors.textMuted, fontFamily: fonts.bold, letterSpacing: 1.4 },
  name: { color: colors.text, fontFamily: fonts.extrabold, marginTop: 2 },
  meta: { color: colors.textMuted, fontFamily: fonts.regular, marginTop: 4 },
  stats: { flexDirection: 'row' },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: { color: colors.text, fontFamily: fonts.extrabold, fontVariant: ['tabular-nums'] },
  statLabel: { color: colors.textMuted, fontFamily: fonts.medium },
  message: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1 },
  messageOk: { backgroundColor: 'rgba(43,213,118,0.1)', borderColor: 'rgba(43,213,118,0.3)' },
  messageError: { backgroundColor: 'rgba(255,92,99,0.12)', borderColor: 'rgba(255,92,99,0.3)' },
  messageText: { flex: 1, color: colors.text, fontFamily: fonts.medium },
  actions: { flexDirection: 'row', flexWrap: 'wrap' },
  section: { color: colors.textMuted, fontFamily: fonts.bold, letterSpacing: 1.4 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleRowFocused: { borderColor: colors.focus, backgroundColor: colors.surfaceHigh },
  toggleTitle: { color: colors.text, fontFamily: fonts.semibold },
  toggleText: { color: colors.textMuted, fontFamily: fonts.regular, marginTop: 2 },
  track: { backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center' },
  trackOn: { backgroundColor: colors.accent },
  knob: { backgroundColor: '#fff' },
  footer: { alignItems: 'center' },
  footerText: { color: colors.textDim, fontFamily: fonts.medium },
});
