import { Ionicons } from '@expo/vector-icons';
import type { AudioTrack, SubtitleTrack } from 'expo-video';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLayout } from '@/lib/layout';
import { colors, fonts } from '@/lib/theme';
import { describeTracks, sameTrack } from '@/lib/tracks';

import type { IconName } from './Button';
import { Focusable } from './Focusable';
import { SidePanel } from './SidePanel';

interface Props {
  open: boolean;
  audioTracks: AudioTrack[];
  audioTrack: AudioTrack | null;
  subtitleTracks: SubtitleTrack[];
  subtitleTrack: SubtitleTrack | null;
  onSelectAudio(track: AudioTrack): void;
  onSelectSubtitles(track: SubtitleTrack | null): void;
  onClose(): void;
}

/** The audio language and subtitle picker; the two lists sit side by side where there's room. */
export function TrackPanel({
  open,
  audioTracks,
  audioTrack,
  subtitleTracks,
  subtitleTrack,
  onSelectAudio,
  onSelectSubtitles,
  onClose,
}: Props) {
  const { s, width, isTV } = useLayout();
  const insets = useSafeAreaInsets();
  const hasAudio = audioTracks.length > 0;
  const hasSubtitles = subtitleTracks.length > 0;
  const both = hasAudio && hasSubtitles;
  const panelWidth = Math.round(both ? Math.min(s(620), width * 0.7) : Math.min(s(380), width * 0.55));
  const sideBySide = both && panelWidth >= s(440);
  const bottom = insets.bottom + s(16);

  const audio = hasAudio && (
    <Section icon="volume-high" title="Audio">
      {describeTracks(audioTracks, 'Audio').map((option, i) => {
        const selected = sameTrack(option.track, audioTrack);
        return (
          <TrackRow
            key={option.track.id ?? `${i}`}
            title={option.title}
            detail={option.detail}
            selected={selected}
            preferFocus={isTV && selected}
            onPress={() => onSelectAudio(option.track)}
          />
        );
      })}
    </Section>
  );

  const subtitles = hasSubtitles && (
    <Section icon="text" title="Subtitles">
      <TrackRow
        title="Off"
        selected={!subtitleTrack}
        preferFocus={isTV && !hasAudio && !subtitleTrack}
        onPress={() => onSelectSubtitles(null)}
      />
      {describeTracks(subtitleTracks, 'Subtitles').map((option, i) => {
        const selected = sameTrack(option.track, subtitleTrack);
        return (
          <TrackRow
            key={option.track.id ?? `${i}`}
            title={option.title}
            detail={option.detail}
            selected={selected}
            preferFocus={isTV && !hasAudio && selected}
            onPress={() => onSelectSubtitles(option.track)}
          />
        );
      })}
    </Section>
  );

  return (
    <SidePanel
      open={open}
      width={panelWidth}
      title={hasAudio ? (hasSubtitles ? 'Audio & Subtitles' : 'Audio') : 'Subtitles'}
      onClose={onClose}
    >
      {sideBySide ? (
        <View style={[styles.columns, { paddingHorizontal: s(10), gap: s(10) }]}>
          <ScrollView style={styles.flex} contentContainerStyle={{ paddingBottom: bottom }}>
            {audio}
          </ScrollView>
          <View style={styles.divider} />
          <ScrollView style={styles.flex} contentContainerStyle={{ paddingBottom: bottom }}>
            {subtitles}
          </ScrollView>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: s(10), paddingBottom: bottom, gap: s(18) }}>
          {audio}
          {subtitles}
        </ScrollView>
      )}
    </SidePanel>
  );
}

function Section({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  const { s } = useLayout();
  return (
    <View style={{ gap: s(4) }}>
      <View style={[styles.sectionHeader, { gap: s(8), paddingHorizontal: s(14), paddingVertical: s(6) }]}>
        <Ionicons name={icon} size={s(16)} color={colors.textMuted} />
        <Text style={[styles.sectionTitle, { fontSize: s(12) }]}>{title.toUpperCase()}</Text>
      </View>
      {children}
    </View>
  );
}

function TrackRow({
  title,
  detail,
  selected,
  preferFocus,
  onPress,
}: {
  title: string;
  detail?: string;
  selected: boolean;
  preferFocus: boolean;
  onPress(): void;
}) {
  const { s } = useLayout();
  return (
    <Focusable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={detail ? `${title}, ${detail}` : title}
      accessibilityState={{ checked: selected }}
      hasTVPreferredFocus={preferFocus}
      style={[
        styles.row,
        { minHeight: s(52), paddingHorizontal: s(14), paddingVertical: s(8), gap: s(12), borderRadius: s(12) },
        selected && styles.rowSelected,
      ]}
      focusStyle={styles.rowFocused}
    >
      <View style={{ width: s(20) }}>
        {selected && <Ionicons name="checkmark" size={s(20)} color={colors.accentBright} />}
      </View>
      <View style={styles.flex}>
        <Text style={[styles.rowTitle, { fontSize: s(15) }, selected && styles.rowTitleSelected]} numberOfLines={1}>
          {title}
        </Text>
        {detail ? (
          <Text style={[styles.rowDetail, { fontSize: s(12) }]} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
    </Focusable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  columns: { flex: 1, flexDirection: 'row' },
  divider: { width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.12)' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center' },
  sectionTitle: { color: colors.textMuted, fontFamily: fonts.bold, letterSpacing: 1.2 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowSelected: { backgroundColor: 'rgba(255,36,71,0.12)' },
  rowFocused: { backgroundColor: 'rgba(255,255,255,0.1)' },
  rowTitle: { color: colors.text, fontFamily: fonts.semibold },
  rowTitleSelected: { color: colors.accentBright },
  rowDetail: { color: colors.textMuted, fontFamily: fonts.regular, marginTop: 2 },
});
