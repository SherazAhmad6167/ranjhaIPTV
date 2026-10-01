import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ChannelRail } from '@/components/ChannelRail';
import { NATIVE_DRIVER } from '@/components/Focusable';
import { Hero } from '@/components/Hero';
import { TopBar, useTopBarHeight, type Tab } from '@/components/TopBar';
import {
  availableKinds,
  groupChannels,
  type CardItem,
  KIND_ICONS,
  KIND_LABELS,
  pickFeatured,
  resolveKeys,
  variantFor,
} from '@/lib/catalog';
import { useLayout } from '@/lib/layout';
import type { Channel, ChannelKind } from '@/lib/m3u';
import { usePlaylist } from '@/lib/playlist-store';
import { progressFraction, type ProgressMap } from '@/lib/progress';
import { useWatchProgress } from '@/lib/progress-store';
import {
  getSeries,
  isShow,
  resumeBadge,
  resumePoints,
  resumeShows,
  showProgress,
  showSummary,
  type Show,
} from '@/lib/series';
import { colors, fonts } from '@/lib/theme';

interface RailBase {
  key: string;
  title: string;
  seeAll: { list?: 'recent' | 'favorites'; group?: string };
}

/** Live TV and movies list their channels; series list one folder per show. */
type Rail =
  | (RailBase & { channels: Channel[] })
  | (RailBase & { shows: Show[]; badge(show: Show): string | undefined });

interface HomeContent {
  rails: Rail[];
  featured: (Channel | Show)[];
  /** Share watched of a title in progress, for the bar on its card. */
  progressOf?(item: CardItem): number | undefined;
}

function channelHome(
  channels: Channel[],
  kind: ChannelKind,
  recents: readonly string[],
  favorites: ReadonlySet<string>,
  watched: ProgressMap,
): HomeContent {
  const ofKind = channels.filter((c) => c.kind === kind);
  const groups = groupChannels(ofKind);
  // A movie watched to the end has nothing left to continue.
  const recentList = resolveKeys(ofKind, recents).filter((c) => kind === 'live' || !watched.get(c.key)?.finished);
  const favoriteList = ofKind.filter((c) => favorites.has(c.key));
  const rails: Rail[] = [];
  if (recentList.length) {
    rails.push({
      key: 'recent',
      title: kind === 'live' ? 'Recently Watched' : 'Continue Watching',
      channels: recentList,
      seeAll: { list: 'recent' },
    });
  }
  if (favoriteList.length) {
    rails.push({ key: 'favorites', title: 'My List', channels: favoriteList, seeAll: { list: 'favorites' } });
  }
  for (const g of groups) {
    rails.push({ key: `g:${g.name}`, title: g.name, channels: g.channels, seeAll: { group: g.name } });
  }
  return {
    rails,
    featured: pickFeatured(recentList, groups.map((g) => g.channels)),
    progressOf: kind === 'live' ? undefined : (item) => progressFraction(watched.get(item.key)),
  };
}

function seriesHome(
  channels: Channel[],
  recents: readonly string[],
  favorites: ReadonlySet<string>,
  watched: ProgressMap,
): HomeContent {
  const catalog = getSeries(channels);
  const resume = resumePoints(catalog, recents, watched);
  const recentShows = resumeShows(catalog, resume);
  const favoriteShows = catalog.shows.filter((show) => favorites.has(show.key));
  const rails: Rail[] = [];
  if (recentShows.length) {
    rails.push({
      key: 'recent',
      title: 'Continue Watching',
      shows: recentShows,
      seeAll: { list: 'recent' },
      badge: resumeBadge(resume),
    });
  }
  if (favoriteShows.length) {
    rails.push({
      key: 'favorites',
      title: 'My List',
      shows: favoriteShows,
      seeAll: { list: 'favorites' },
      badge: showSummary,
    });
  }
  for (const g of catalog.groups) {
    rails.push({
      key: `g:${g.name}`,
      title: g.name,
      shows: g.shows,
      seeAll: { group: g.name },
      badge: showSummary,
    });
  }
  return {
    rails,
    featured: pickFeatured(recentShows, catalog.groups.map((g) => g.shows)),
    // A show's bar follows the episode it continues from.
    progressOf: showProgress(resume, watched),
  };
}

export default function HomeScreen() {
  const {
    source,
    channels,
    loading,
    error,
    favorites,
    recents,
    refresh,
    disconnect,
    toggleFavorite,
    setQueue,
  } = usePlaylist();
  const watched = useWatchProgress();
  const layout = useLayout();
  const { s, wide, gutter, gap } = layout;
  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;
  const listRef = useRef<FlatList<Rail>>(null);

  const [kindChoice, setKindChoice] = useState<ChannelKind>('live');
  const kinds = useMemo(() => availableKinds(channels), [channels]);
  const kind = kinds.includes(kindChoice) ? kindChoice : (kinds[0] ?? 'live');
  const variant = variantFor(kind);

  const { rails, featured, progressOf } = useMemo(
    () =>
      kind === 'series'
        ? seriesHome(channels, recents, favorites, watched)
        : channelHome(channels, kind, recents, favorites, watched),
    [channels, kind, recents, favorites, watched],
  );

  const tabs = useMemo<Tab[]>(
    () => kinds.map((k) => ({ key: k, label: KIND_LABELS[k], icon: KIND_ICONS[k] })),
    [kinds],
  );
  const topBarHeight = useTopBarHeight(tabs.length);

  const play = useCallback(
    (channel: Channel, list: Channel[]) => {
      setQueue(list);
      router.push({ pathname: '/player', params: { id: channel.id } });
    },
    [setQueue],
  );

  const openShow = useCallback((show: Show) => {
    router.push({ pathname: '/series', params: { show: show.key } });
  }, []);

  const playFeatured = useCallback(
    (item: Channel | Show) => {
      if (isShow(item)) openShow(item);
      else play(item, channels.filter((c) => c.kind === item.kind && c.group === item.group));
    },
    [play, openShow, channels],
  );

  const onRefresh = useCallback(() => {
    refresh().catch(() => {});
  }, [refresh]);

  const selectKind = (key: string) => {
    setKindChoice(key as ChannelKind);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  };

  const cardWidth = layout.cardWidth[variant];
  const titleSize = s(wide ? 21 : 17);

  const header = (
    <>
      {featured.length > 0 ? (
        <Hero
          items={featured}
          topInset={topBarHeight}
          favorites={favorites}
          onPlay={playFeatured}
          onToggleFavorite={toggleFavorite}
        />
      ) : (
        <View style={{ height: topBarHeight + s(16) }} />
      )}
      {error && channels.length > 0 && (
        <View style={[styles.banner, { marginHorizontal: gutter, marginBottom: s(16), padding: s(12), borderRadius: s(12) }]}>
          <Ionicons name="warning" size={s(18)} color={colors.danger} />
          <Text style={[styles.bannerText, { fontSize: s(14) }]} numberOfLines={2}>
            Couldn’t update your channels. {error}
          </Text>
          <Button label="Retry" variant="glass" onPress={onRefresh} busy={loading} />
        </View>
      )}
      <View style={{ height: s(wide ? 8 : 4) }} />
    </>
  );

  return (
    <View style={styles.screen}>
      <Animated.FlatList
        ref={listRef}
        data={rails}
        keyExtractor={(r) => r.key}
        extraData={favorites}
        renderItem={({ item }) => {
          const shared = {
            title: item.title,
            variant,
            cardWidth,
            gap,
            gutter,
            titleSize,
            favorites,
            progress: progressOf,
            onToggleFavorite: toggleFavorite,
            onSeeAll: () => router.push({ pathname: '/browse', params: { kind, ...item.seeAll } }),
          };
          return 'shows' in item ? (
            <ChannelRail {...shared} items={item.shows} badge={item.badge} onPress={openShow} />
          ) : (
            <ChannelRail {...shared} items={item.channels} onPress={play} />
          );
        }}
        ListHeaderComponent={header}
        ListFooterComponent={<View style={{ height: insets.bottom + s(32) }} />}
        ListEmptyComponent={
          <EmptyState loading={loading} error={error} onRetry={onRefresh} onSignOut={disconnect} />
        }
        initialNumToRender={4}
        maxToRenderPerBatch={3}
        windowSize={5}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: NATIVE_DRIVER,
        })}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={loading && channels.length > 0}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
            progressBackgroundColor={colors.surface}
            progressViewOffset={topBarHeight}
          />
        }
      />
      <TopBar
        scrollY={scrollY}
        tabs={tabs}
        active={kind}
        onTab={selectKind}
        onSearch={() => router.push('/search')}
        onAccount={() => router.push('/account')}
        userName={source?.username ?? ''}
      />
    </View>
  );
}

function EmptyState({
  loading,
  error,
  onRetry,
  onSignOut,
}: {
  loading: boolean;
  error: string | null;
  onRetry(): void;
  onSignOut(): void;
}) {
  const { s } = useLayout();
  if (loading || !error) {
    return (
      <View style={[styles.empty, { gap: s(14), paddingTop: s(80) }]}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={[styles.emptyText, { fontSize: s(16) }]}>Loading your channels…</Text>
      </View>
    );
  }
  return (
    <View style={[styles.empty, { gap: s(12), paddingTop: s(64) }]}>
      <View style={[styles.emptyIcon, { width: s(84), height: s(84), borderRadius: s(42) }]}>
        <Ionicons name="cloud-offline-outline" size={s(40)} color={colors.textMuted} />
      </View>
      <Text style={[styles.emptyTitle, { fontSize: s(22) }]}>Couldn’t load your channels</Text>
      <Text style={[styles.emptyText, { fontSize: s(15), maxWidth: s(460) }]}>{error}</Text>
      <View style={[styles.emptyActions, { gap: s(12), marginTop: s(12) }]}>
        <Button label="Try Again" icon="refresh" onPress={onRetry} />
        <Button label="Sign Out" variant="glass" onPress={onSignOut} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,92,99,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,92,99,0.28)',
  },
  bannerText: { flex: 1, color: colors.text, fontFamily: fonts.medium },
  empty: { alignItems: 'center', paddingHorizontal: 32 },
  emptyIcon: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, marginBottom: 6 },
  emptyTitle: { color: colors.text, fontFamily: fonts.bold, textAlign: 'center' },
  emptyText: { color: colors.textMuted, fontFamily: fonts.regular, textAlign: 'center', lineHeight: 22 },
  emptyActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
});
