import { Ionicons } from '@expo/vector-icons';
import { memo, useCallback } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import type { CardItem } from '@/lib/catalog';
import { cardAspect, type CardVariant } from '@/lib/layout';
import { colors, fonts } from '@/lib/theme';

import { cardRadius, ChannelCard } from './ChannelCard';
import { Focusable } from './Focusable';

/** Cards rendered per rail before the "See all" tile. */
export const RAIL_LIMIT = 24;

const SEE_ALL = '\u0000see-all';
interface Props<T extends CardItem> {
  title: string;
  items: T[];
  variant: CardVariant;
  cardWidth: number;
  gap: number;
  gutter: number;
  titleSize: number;
  favorites: ReadonlySet<string>;
  /** Label on each card, e.g. what's inside a series folder. */
  badge?(item: T): string | undefined;
  onPress(item: T, list: T[]): void;
  onToggleFavorite(key: string): void;
  onSeeAll?(): void;
}

/** A titled, horizontally scrolling row of cards: channels, movies or series folders. */
export const ChannelRail = memo(Rail) as typeof Rail;

function Rail<T extends CardItem>({
  title,
  items,
  variant,
  cardWidth,
  gap,
  gutter,
  titleSize,
  favorites,
  badge,
  onPress,
  onToggleFavorite,
  onSeeAll,
}: Props<T>) {
  const more = onSeeAll && items.length > RAIL_LIMIT;
  const data: (T | typeof SEE_ALL)[] = more ? [...items.slice(0, RAIL_LIMIT), SEE_ALL] : items;
  const cardHeight = Math.round(cardWidth * cardAspect(variant));
  // Room above and below the row so a focused card can grow without being clipped.
  const pad = Math.round(cardHeight * 0.06) + 4;
  // Scrolling snaps so a card always comes to rest lined up under the title.
  const step = cardWidth + gap;

  const press = useCallback((item: T) => onPress(item, items), [onPress, items]);
  const toggle = useCallback((item: T) => onToggleFavorite(item.key), [onToggleFavorite]);

  return (
    <View style={{ marginBottom: Math.round(titleSize * 0.9) }}>
      <View style={[styles.header, { paddingHorizontal: gutter, marginBottom: Math.max(0, 8 - pad) }]}>
        <Text style={[styles.title, { fontSize: titleSize }]} numberOfLines={1}>
          {title}
        </Text>
        {onSeeAll && (
          <Focusable
            onPress={onSeeAll}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`See all ${title}`}
            style={styles.seeAll}
            focusStyle={styles.seeAllFocused}
          >
            <Text style={[styles.seeAllText, { fontSize: Math.round(titleSize * 0.72) }]}>See all</Text>
            <Ionicons name="chevron-forward" size={Math.round(titleSize * 0.8)} color={colors.textMuted} />
          </Focusable>
        )}
      </View>
      <FlatList
        horizontal
        data={data}
        keyExtractor={(item) => (item === SEE_ALL ? SEE_ALL : item.id)}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: gutter, paddingVertical: pad, gap }}
        snapToInterval={step}
        decelerationRate="fast"
        getItemLayout={(_, index) => ({ length: step, offset: step * index, index })}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={5}
        removeClippedSubviews={false}
        renderItem={({ item }) =>
          item === SEE_ALL ? (
            <SeeAllTile width={cardWidth} height={cardHeight} count={items.length} onPress={onSeeAll!} />
          ) : (
            <ChannelCard
              item={item}
              variant={variant}
              width={cardWidth}
              favorite={favorites.has(item.key)}
              badge={badge?.(item)}
              onPress={press}
              onLongPress={toggle}
            />
          )
        }
      />
    </View>
  );
}

function SeeAllTile({
  width,
  height,
  count,
  onPress,
}: {
  width: number;
  height: number;
  count: number;
  onPress(): void;
}) {
  const size = Math.round(Math.min(22, Math.max(13, width * 0.075)));
  return (
    <Focusable
      onPress={onPress}
      zoom={1.07}
      accessibilityRole="button"
      accessibilityLabel={`See all ${count} titles`}
      style={[styles.tile, { width, height, borderRadius: cardRadius(width) }]}
      focusStyle={styles.tileFocused}
    >
      <View style={[styles.tileIcon, { width: size * 2.4, height: size * 2.4, borderRadius: size * 1.2 }]}>
        <Ionicons name="arrow-forward" size={size * 1.2} color="#fff" />
      </View>
      <Text style={[styles.tileText, { fontSize: size }]}>See all</Text>
      <Text style={[styles.tileCount, { fontSize: Math.round(size * 0.75) }]}>
        {count.toLocaleString()} titles
      </Text>
    </Focusable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: { flexShrink: 1, color: colors.text, fontFamily: fonts.bold, letterSpacing: 0.2 },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  seeAllFocused: { backgroundColor: 'rgba(255,255,255,0.12)' },
  seeAllText: { color: colors.textMuted, fontFamily: fonts.semibold },
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tileFocused: {
    outlineWidth: 3,
    outlineColor: colors.focus,
    outlineStyle: 'solid',
    backgroundColor: colors.surfaceHigh,
  },
  tileIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    marginBottom: 4,
  },
  tileText: { color: colors.text, fontFamily: fonts.bold },
  tileCount: { color: colors.textMuted, fontFamily: fonts.medium },
});
