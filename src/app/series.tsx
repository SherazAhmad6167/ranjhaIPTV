import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { memo, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { initials } from '@/components/ChannelLogo';
import { Chip } from '@/components/Chip';
import { Focusable } from '@/components/Focusable';
import { ProgressBar } from '@/components/ProgressBar';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useLayout } from '@/lib/layout';
import { usePlaylist } from '@/lib/playlist-store';
import { progressFraction, timeLeftLabel, type WatchProgress } from '@/lib/progress';
import { useWatchProgress } from '@/lib/progress-store';
import {
  continueFrom,
  episodeCode,
  episodeTitle,
  getSeries,
  lastWatched,
  seasonLabel,
  type Episode,
  type Show,
} from '@/lib/series';
import { colors, fonts, gradients, tileGradient } from '@/lib/theme';

/** A series folder: the show's seasons and episodes. */
export default function SeriesScreen() {
  const params = useLocalSearchParams<{ show?: string }>();
  const { channels, loading, favorites, recents, toggleFavorite, setQueue } = usePlaylist();
  const watched = useWatchProgress();
  const { s, wide, gutter, gap, width, height, bp } = useLayout();
  const insets = useSafeAreaInsets();

  const catalog = useMemo(() => getSeries(channels), [channels]);
  const show = catalog.byKey.get(params.show ?? '');

  // Where the main button picks up: the episode watched last, or the next one once it's finished.
  const resume = useMemo(() => {
    const last = show && lastWatched(catalog, show, recents);
    if (!last) return undefined;
    const episode = continueFrom(catalog, last, watched);
    const inProgress = progressFraction(watched.get(episode.channel.key)) !== undefined;
    const tag: EpisodeTag = inProgress ? 'CONTINUE' : episode === last ? 'LAST WATCHED' : 'UP NEXT';
    return { episode, tag };
  }, [catalog, show, recents, watched]);

  const [seasonChoice, setSeasonChoice] = useState<number | null>(null);
  const season =
    show?.seasons.find((x) => x.number === seasonChoice) ??
    show?.seasons.find((x) => x.number === resume?.episode.season) ??
    show?.seasons[0];

  // The player's next/previous and episode list run through the whole show, across seasons.
  const queue = useMemo(() => show?.episodes.map((e) => e.channel) ?? [], [show]);

  const play = useCallback(
    (episode: Episode) => {
      setQueue(queue);
      router.push({ pathname: '/player', params: { id: episode.channel.id } });
    },
    [queue, setQueue],
  );

  if (!show || !season) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Series" />
        <View style={[styles.missing, { gap: s(12), paddingTop: s(64) }]}>
          {loading ? (
            <ActivityIndicator color={colors.accent} size="large" />
          ) : (
            <>
              <Ionicons name="albums-outline" size={s(40)} color={colors.textDim} />
              <Text style={[styles.missingText, { fontSize: s(16) }]}>This series isn’t available anymore.</Text>
            </>
          )}
        </View>
      </View>
    );
  }

  const cols = bp === 'phone' || bp === 'tablet' ? 1 : bp === 'ultra' ? 3 : 2;
  const rowWidth = Math.floor((width - insets.left - insets.right - gutter * 2 - gap * (cols - 1)) / cols);
  const thumbWidth = Math.round(Math.min(rowWidth * 0.42, s(wide ? 220 : 150)));
  const start = resume?.episode ?? show.episodes[0];

  return (
    <View style={styles.screen}>
      <Backdrop show={show} height={Math.round(height * 0.62)} />
      <ScreenHeader>
        <View style={styles.flex} />
      </ScreenHeader>
      <FlatList
        // numColumns can't change on the fly, so a new column count remounts the list.
        key={`episodes-${cols}`}
        data={season.episodes}
        numColumns={cols}
        keyExtractor={(e) => e.channel.id}
        extraData={watched}
        renderItem={({ item }) => (
          <EpisodeRow
            episode={item}
            fallbackLogo={show.logo}
            width={rowWidth}
            thumbWidth={thumbWidth}
            tag={item === resume?.episode ? resume.tag : undefined}
            progress={watched.get(item.channel.key)}
            onPress={play}
          />
        )}
        columnWrapperStyle={cols > 1 ? { gap } : undefined}
        contentContainerStyle={{
          paddingLeft: gutter + insets.left,
          paddingRight: gutter + insets.right,
          paddingBottom: insets.bottom + s(32),
          gap: s(6),
        }}
        ListHeaderComponent={
          <View style={{ paddingBottom: s(8) }}>
            <Details
              show={show}
              start={start}
              progress={watched.get(start.channel.key)}
              favorite={favorites.has(show.key)}
              onPlay={play}
              onToggleFavorite={toggleFavorite}
            />
            <Text style={[styles.sectionTitle, { fontSize: s(wide ? 22 : 19), marginTop: s(wide ? 36 : 28) }]}>
              Episodes
            </Text>
            {show.seasons.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginHorizontal: -(gutter + insets.left) }}
                contentContainerStyle={{
                  paddingHorizontal: gutter + insets.left,
                  gap: s(8),
                  paddingTop: s(12),
                  paddingBottom: s(4),
                }}
              >
                {show.seasons.map((x) => (
                  <Chip
                    key={x.number}
                    label={seasonLabel(x.number)}
                    count={x.episodes.length}
                    selected={x === season}
                    onPress={() => setSeasonChoice(x.number)}
                  />
                ))}
              </ScrollView>
            )}
          </View>
        }
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={7}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

/** The show's artwork, blurred and faded into the page behind the header. */
function Backdrop({ show, height }: { show: Show; height: number }) {
  const [from, to] = tileGradient(show.name);
  return (
    <View style={[styles.backdrop, { height }]} pointerEvents="none">
      <LinearGradient colors={[from, to]} start={{ x: 0.8, y: 0 }} end={{ x: 0.1, y: 1 }} style={StyleSheet.absoluteFill} />
      {show.logo && (
        <Image
          source={show.logo}
          style={[StyleSheet.absoluteFill, styles.ambient]}
          contentFit="cover"
          blurRadius={60}
          cachePolicy="memory-disk"
        />
      )}
      <LinearGradient colors={gradients.fadeBottom} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
    </View>
  );
}

function Details({
  show,
  start,
  progress,
  favorite,
  onPlay,
  onToggleFavorite,
}: {
  show: Show;
  /** The episode the main button plays. */
  start: Episode;
  /** How far into `start` the viewer got. */
  progress?: WatchProgress;
  favorite: boolean;
  onPlay(episode: Episode): void;
  onToggleFavorite(key: string): void;
}) {
  const { s, wide, width } = useLayout();
  const [failed, setFailed] = useState(false);
  const [from, to] = tileGradient(show.name);
  const logo = show.logo && !failed ? show.logo : undefined;

  const posterWidth = wide ? s(210) : Math.round(Math.min(width * 0.32, s(130)));
  const titleSize = s(wide ? 40 : 24);
  const seasons = show.seasons.length;
  const episodes = show.episodes.length;
  const meta = [
    seasons > 1 ? `${seasons} Seasons` : null,
    `${episodes.toLocaleString()} ${episodes === 1 ? 'Episode' : 'Episodes'}`,
  ]
    .filter(Boolean)
    .join('  ·  ');

  const code = episodeCode(start);
  const share = progressFraction(progress);
  const actions = (
    <View style={[wide ? styles.actionsRow : styles.actionsColumn, { gap: s(wide ? 12 : 10), marginTop: s(wide ? 24 : 18) }]}>
      <Button
        label={`${share !== undefined ? 'Resume' : 'Play'}${code ? ` ${code}` : ''}`}
        icon="play"
        variant="light"
        size="lg"
        onPress={() => onPlay(start)}
        hasTVPreferredFocus
      />
      <Button
        label="My List"
        icon={favorite ? 'checkmark' : 'add'}
        variant="glass"
        size="lg"
        onPress={() => onToggleFavorite(show.key)}
      />
    </View>
  );

  return (
    <View style={{ paddingTop: s(wide ? 12 : 4) }}>
      <View style={[styles.details, { gap: s(wide ? 32 : 16) }]}>
        <View
          style={[
            styles.poster,
            { width: posterWidth, height: Math.round(posterWidth * 1.5), borderRadius: s(wide ? 14 : 10) },
          ]}
        >
          <LinearGradient colors={[from, to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          {logo ? (
            <Image
              source={logo}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={200}
              onError={() => setFailed(true)}
            />
          ) : (
            <Text style={[styles.posterInitials, { fontSize: Math.round(posterWidth * 0.28) }]}>
              {initials(show.name)}
            </Text>
          )}
        </View>
        <View style={styles.detailsText}>
          <View style={[styles.kicker, { gap: s(10), marginBottom: s(8) }]}>
            <View style={[styles.kind, { paddingHorizontal: s(8), paddingVertical: s(3), borderRadius: s(5) }]}>
              <Text style={[styles.kindText, { fontSize: s(11) }]}>SERIES</Text>
            </View>
            <Text style={[styles.group, { fontSize: s(14) }]} numberOfLines={1}>
              {show.group}
            </Text>
          </View>
          <Text
            style={[styles.title, { fontSize: titleSize, lineHeight: Math.round(titleSize * 1.1) }]}
            numberOfLines={wide ? 2 : 3}
          >
            {show.name}
          </Text>
          <Text style={[styles.meta, { fontSize: s(15), marginTop: s(8) }]}>{meta}</Text>
          {progress && share !== undefined && (
            <View style={[styles.resumeRow, { gap: s(10), marginTop: s(10) }]}>
              <ProgressBar value={share} height={s(4)} style={{ width: s(wide ? 140 : 90) }} />
              <Text style={[styles.resumeText, { fontSize: s(13) }]} numberOfLines={1}>
                {timeLeftLabel(progress)}
              </Text>
            </View>
          )}
          {wide && actions}
        </View>
      </View>
      {!wide && actions}
    </View>
  );
}

type EpisodeTag = 'CONTINUE' | 'UP NEXT' | 'LAST WATCHED';

const EpisodeRow = memo(function EpisodeRow({
  episode,
  fallbackLogo,
  width,
  thumbWidth,
  tag,
  progress,
  onPress,
}: {
  episode: Episode;
  /** The show's poster, for episodes without their own image. */
  fallbackLogo?: string;
  width: number;
  thumbWidth: number;
  /** Marks the episode the show continues from. */
  tag?: EpisodeTag;
  progress?: WatchProgress;
  onPress(episode: Episode): void;
}) {
  const { s } = useLayout();
  const [failed, setFailed] = useState(false);
  const [from, to] = tileGradient(episode.channel.name);
  const logo = failed ? undefined : (episode.channel.logo ?? fallbackLogo);
  const thumbHeight = Math.round((thumbWidth * 9) / 16);
  const code = episodeCode(episode);
  const title = episodeTitle(episode);
  const share = progressFraction(progress);
  const finished = progress?.finished === true;
  const status = progress && share !== undefined ? timeLeftLabel(progress) : finished ? 'Watched' : undefined;

  return (
    <Focusable
      onPress={() => onPress(episode)}
      zoom={1.02}
      accessibilityRole="button"
      accessibilityLabel={`${share !== undefined ? 'Resume' : 'Play'} ${code ? `${code}, ` : ''}${title}${status ? `, ${status}` : ''}`}
      style={[
        styles.row,
        { width, padding: s(8), gap: s(14), borderRadius: s(14) },
        tag && styles.rowCurrent,
      ]}
      focusStyle={styles.rowFocused}
    >
      {({ focused }) => (
        <>
          <View style={[styles.thumb, { width: thumbWidth, height: thumbHeight, borderRadius: s(10) }]}>
            <LinearGradient colors={[from, to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            {logo ? (
              <Image
                source={logo}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                cachePolicy="memory-disk"
                recyclingKey={logo}
                transition={150}
                onError={() => setFailed(true)}
              />
            ) : (
              <Text style={[styles.thumbNumber, { fontSize: Math.round(thumbHeight * 0.42) }]} numberOfLines={1}>
                {episode.number ?? initials(episode.channel.name)}
              </Text>
            )}
            <View style={[StyleSheet.absoluteFill, styles.thumbShade]} />
            <View
              style={[
                styles.playDisc,
                { width: s(34), height: s(34), borderRadius: s(17) },
                focused && styles.playDiscFocused,
              ]}
            >
              <Ionicons name="play" size={s(16)} color={focused ? '#0A0A0F' : '#fff'} style={{ marginLeft: s(2) }} />
            </View>
            {finished && (
              <View style={[styles.watchedBadge, { top: s(5), right: s(5), borderRadius: s(10) }]}>
                <Ionicons name="checkmark-circle" size={s(18)} color={colors.success} />
              </View>
            )}
            {share !== undefined && (
              <ProgressBar
                value={share}
                height={s(4)}
                style={[styles.thumbProgress, { left: s(6), right: s(6), bottom: s(6) }]}
              />
            )}
          </View>
          <View style={[styles.rowText, { gap: s(4) }]}>
            {code ? <Text style={[styles.code, { fontSize: s(12) }]}>{code}</Text> : null}
            <Text style={[styles.episodeTitle, { fontSize: s(16), lineHeight: s(21) }]} numberOfLines={2}>
              {title}
            </Text>
            {status && (
              <Text style={[styles.status, { fontSize: s(12) }, finished && styles.statusWatched]} numberOfLines={1}>
                {status}
              </Text>
            )}
            {tag && (
              <View style={[styles.currentTag, { paddingHorizontal: s(7), paddingVertical: s(2), borderRadius: s(5) }]}>
                <Text style={[styles.currentText, { fontSize: s(10) }]}>{tag}</Text>
              </View>
            )}
          </View>
        </>
      )}
    </Focusable>
  );
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
  ambient: { opacity: 0.45 },
  details: { flexDirection: 'row', alignItems: 'flex-end' },
  detailsText: { flex: 1, minWidth: 0 },
  poster: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
    boxShadow: '0px 18px 44px rgba(0,0,0,0.6)',
  },
  posterInitials: { color: 'rgba(255,255,255,0.9)', fontFamily: fonts.black, letterSpacing: 2 },
  kicker: { flexDirection: 'row', alignItems: 'center' },
  kind: { backgroundColor: 'rgba(255,255,255,0.16)' },
  kindText: { color: '#fff', fontFamily: fonts.extrabold, letterSpacing: 1.2 },
  group: { flexShrink: 1, color: colors.textMuted, fontFamily: fonts.medium },
  title: {
    color: '#fff',
    fontFamily: fonts.black,
    letterSpacing: -0.4,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 18,
  },
  meta: { color: colors.textMuted, fontFamily: fonts.semibold },
  resumeRow: { flexDirection: 'row', alignItems: 'center' },
  resumeText: { color: colors.text, fontFamily: fonts.medium },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap' },
  actionsColumn: { flexDirection: 'column' },
  sectionTitle: { color: colors.text, fontFamily: fonts.bold, letterSpacing: 0.2 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowCurrent: { backgroundColor: 'rgba(255,36,71,0.10)' },
  rowFocused: { backgroundColor: colors.surfaceHigh },
  thumb: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  thumbNumber: { color: 'rgba(255,255,255,0.85)', fontFamily: fonts.black },
  thumbShade: { backgroundColor: 'rgba(0,0,0,0.18)' },
  thumbProgress: { position: 'absolute' },
  watchedBadge: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.55)' },
  playDisc: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10,10,15,0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  playDiscFocused: { backgroundColor: '#fff', borderColor: '#fff' },
  rowText: { flex: 1, minWidth: 0, alignItems: 'flex-start' },
  code: { color: colors.textMuted, fontFamily: fonts.bold, letterSpacing: 1 },
  episodeTitle: { color: colors.text, fontFamily: fonts.semibold },
  status: { color: colors.textMuted, fontFamily: fonts.medium },
  statusWatched: { color: colors.success },
  currentTag: { backgroundColor: colors.accent, marginTop: 2 },
  currentText: { color: '#fff', fontFamily: fonts.extrabold, letterSpacing: 1 },
  missing: { alignItems: 'center', paddingHorizontal: 32 },
  missingText: { color: colors.textMuted, fontFamily: fonts.medium, textAlign: 'center' },
});
