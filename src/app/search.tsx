import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ChannelGrid } from '@/components/ChannelGrid';
import { Chip } from '@/components/Chip';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SearchField } from '@/components/SearchField';
import { KIND_ICONS, KIND_LABELS, KINDS, matches, variantFor } from '@/lib/catalog';
import { useLayout } from '@/lib/layout';
import type { Channel, ChannelKind } from '@/lib/m3u';
import { usePlaylist } from '@/lib/playlist-store';
import { progressFraction } from '@/lib/progress';
import { useWatchProgress } from '@/lib/progress-store';
import { getSeries, resumePoints, showProgress, showSummary, type Show } from '@/lib/series';
import { colors, fonts } from '@/lib/theme';

export default function SearchScreen() {
  const { channels, favorites, recents, toggleFavorite, setQueue } = usePlaylist();
  const watched = useWatchProgress();
  const { s, gutter } = useLayout();
  const [query, setQuery] = useState('');
  const search = useDeferredValue(query.trim().toLowerCase());
  const [kindChoice, setKindChoice] = useState<ChannelKind | null>(null);

  const results = useMemo(
    () => (search ? channels.filter((c) => c.kind !== 'series' && matches(c, search)) : []),
    [channels, search],
  );
  // Series are found as whole shows: by the show's name or any of its episodes' names.
  const shows = useMemo(
    () =>
      search
        ? getSeries(channels).shows.filter(
            (show) => matches(show, search) || show.episodes.some((e) => matches(e.channel, search)),
          )
        : [],
    [channels, search],
  );
  const counts = useMemo(
    () =>
      KINDS.map((kind) => ({
        kind,
        count: kind === 'series' ? shows.length : results.filter((c) => c.kind === kind).length,
      })).filter((k) => k.count > 0),
    [results, shows],
  );
  const kind = counts.find((k) => k.kind === kindChoice)?.kind ?? counts[0]?.kind ?? 'live';
  const list = useMemo(() => results.filter((c) => c.kind === kind), [results, kind]);

  const play = useCallback(
    (channel: Channel, queue: Channel[]) => {
      setQueue(queue);
      router.push({ pathname: '/player', params: { id: channel.id } });
    },
    [setQueue],
  );

  const channelProgress = useCallback(
    (c: Channel) => (c.kind === 'live' ? undefined : progressFraction(watched.get(c.key))),
    [watched],
  );
  const showsProgress = useMemo(
    () => showProgress(resumePoints(getSeries(channels), recents, watched), watched),
    [channels, recents, watched],
  );

  const openShow = useCallback((show: Show) => {
    router.push({ pathname: '/series', params: { show: show.key } });
  }, []);

  const shared = {
    variant: variantFor(kind),
    favorites,
    onToggleFavorite: toggleFavorite,
    empty: (
      <View style={[styles.empty, { paddingTop: s(72), gap: s(12) }]}>
        <View style={[styles.emptyIcon, { width: s(88), height: s(88), borderRadius: s(44) }]}>
          <Ionicons name={search ? 'sad-outline' : 'search'} size={s(38)} color={colors.textMuted} />
        </View>
        <Text style={[styles.emptyTitle, { fontSize: s(20) }]}>
          {search ? `No results for “${query.trim()}”` : 'Find something to watch'}
        </Text>
        <Text style={[styles.emptyText, { fontSize: s(15) }]}>
          {search
            ? 'Check the spelling, or try a shorter name.'
            : 'Search across every live channel, movie and series in your subscription.'}
        </Text>
      </View>
    ),
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader>
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder="Search channels, movies, series"
          autoFocus
          large
          style={styles.field}
        />
      </ScreenHeader>

      {counts.length > 0 && (
        <View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: gutter, gap: s(8), paddingBottom: s(16), paddingTop: s(2) }}
          >
            {counts.map((k) => (
              <Chip
                key={k.kind}
                label={KIND_LABELS[k.kind]}
                icon={KIND_ICONS[k.kind]}
                count={k.count}
                selected={k.kind === kind}
                onPress={() => setKindChoice(k.kind)}
              />
            ))}
          </ScrollView>
        </View>
      )}

      {kind === 'series' ? (
        <ChannelGrid {...shared} items={shows} badge={showSummary} progress={showsProgress} onPress={openShow} />
      ) : (
        <ChannelGrid {...shared} items={list} progress={channelProgress} onPress={play} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  field: { flex: 1 },
  empty: { alignItems: 'center', paddingHorizontal: 32 },
  emptyIcon: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, marginBottom: 6 },
  emptyTitle: { color: colors.text, fontFamily: fonts.bold, textAlign: 'center' },
  emptyText: { color: colors.textMuted, fontFamily: fonts.regular, textAlign: 'center', maxWidth: 420, lineHeight: 22 },
});
