import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChannelGrid } from '@/components/ChannelGrid';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SearchField } from '@/components/SearchField';
import { KIND_LABELS, matches, resolveKeys, variantFor } from '@/lib/catalog';
import { useLayout } from '@/lib/layout';
import type { Channel, ChannelKind } from '@/lib/m3u';
import { usePlaylist } from '@/lib/playlist-store';
import { getSeries, resumeBadge, resumePoints, resumeShows, showSummary, type Show } from '@/lib/series';
import { colors, fonts } from '@/lib/theme';

/** Live TV and movies list their channels; series list one folder per show. */
type Listing =
  | { title: string; channels: Channel[] }
  | { title: string; shows: Show[]; badge(show: Show): string | undefined };

/** "See all" for a rail: one group, the user's list, or recently watched. */
export default function BrowseScreen() {
  const params = useLocalSearchParams<{ kind?: string; group?: string; list?: string }>();
  const { channels, favorites, recents, toggleFavorite, setQueue } = usePlaylist();
  const { s, wide, gutter } = useLayout();
  const [query, setQuery] = useState('');
  const search = useDeferredValue(query.trim().toLowerCase());

  const kind: ChannelKind = params.kind === 'movie' || params.kind === 'series' ? params.kind : 'live';
  const variant = variantFor(kind);

  const listing = useMemo<Listing>(() => {
    const group = params.group ?? '';
    if (kind === 'series') {
      const catalog = getSeries(channels);
      if (params.list === 'favorites') {
        return { title: 'My List', shows: catalog.shows.filter((show) => favorites.has(show.key)), badge: showSummary };
      }
      if (params.list === 'recent') {
        const resume = resumePoints(catalog, recents);
        return { title: 'Continue Watching', shows: resumeShows(catalog, resume), badge: resumeBadge(resume) };
      }
      return {
        title: group || KIND_LABELS[kind],
        shows: group ? (catalog.groups.find((g) => g.name === group)?.shows ?? []) : catalog.shows,
        badge: showSummary,
      };
    }

    const ofKind = channels.filter((c) => c.kind === kind);
    if (params.list === 'favorites') {
      return { title: 'My List', channels: ofKind.filter((c) => favorites.has(c.key)) };
    }
    if (params.list === 'recent') {
      return {
        title: kind === 'live' ? 'Recently Watched' : 'Continue Watching',
        channels: resolveKeys(ofKind, recents),
      };
    }
    return { title: group || KIND_LABELS[kind], channels: ofKind.filter((c) => !group || c.group === group) };
  }, [channels, kind, params.list, params.group, favorites, recents]);

  const { title } = listing;
  const count = 'shows' in listing ? listing.shows.length : listing.channels.length;

  const visible = useMemo<Listing>(() => {
    if (!search) return listing;
    return 'shows' in listing
      ? { ...listing, shows: listing.shows.filter((show) => matches(show, search)) }
      : { ...listing, channels: listing.channels.filter((c) => matches(c, search)) };
  }, [listing, search]);

  const play = useCallback(
    (channel: Channel, queue: Channel[]) => {
      setQueue(queue);
      router.push({ pathname: '/player', params: { id: channel.id } });
    },
    [setQueue],
  );

  const openShow = useCallback((show: Show) => {
    router.push({ pathname: '/series', params: { show: show.key } });
  }, []);

  const filter = (
    <SearchField
      value={query}
      onChangeText={setQuery}
      placeholder={`Search in ${title}`}
      style={wide ? { width: s(320) } : { marginHorizontal: gutter, marginBottom: s(16) }}
    />
  );

  const empty = (
    <View style={[styles.empty, { paddingTop: s(64), gap: s(12) }]}>
      <Ionicons name={search ? 'search' : 'albums-outline'} size={s(40)} color={colors.textDim} />
      <Text style={[styles.emptyText, { fontSize: s(16) }]}>
        {search
          ? 'Nothing matches your search.'
          : params.list === 'favorites'
            ? 'Your list is empty. Long-press any title, or use “My List”, to save it here.'
            : 'Nothing here yet.'}
      </Text>
    </View>
  );

  const shared = { variant, favorites, onToggleFavorite: toggleFavorite, empty };

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={title}
        subtitle={`${KIND_LABELS[kind]} · ${count.toLocaleString()} ${count === 1 ? 'title' : 'titles'}`}
        right={wide ? filter : undefined}
      />
      {!wide && count > 8 && filter}
      {'shows' in visible ? (
        <ChannelGrid {...shared} items={visible.shows} badge={visible.badge} onPress={openShow} />
      ) : (
        <ChannelGrid {...shared} items={visible.channels} onPress={play} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  empty: { alignItems: 'center', paddingHorizontal: 32 },
  emptyText: { color: colors.textMuted, fontFamily: fonts.medium, textAlign: 'center', maxWidth: 420, lineHeight: 22 },
});
