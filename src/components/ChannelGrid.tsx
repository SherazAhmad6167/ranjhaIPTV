import { useCallback, type ReactElement } from 'react';
import { FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CardItem } from '@/lib/catalog';
import { useLayout, type CardVariant } from '@/lib/layout';

import { ChannelCard } from './ChannelCard';

interface Props<T extends CardItem> {
  items: T[];
  variant: CardVariant;
  favorites: ReadonlySet<string>;
  /** Label on each card, e.g. what's inside a series folder. */
  badge?(item: T): string | undefined;
  /** Share watched of titles in progress. */
  progress?(item: T): number | undefined;
  onPress(item: T, list: T[]): void;
  onToggleFavorite(key: string): void;
  header?: ReactElement;
  empty?: ReactElement;
}

/** Responsive, virtualised grid of cards; the column count follows the screen size. */
export function ChannelGrid<T extends CardItem>({
  items,
  variant,
  favorites,
  badge,
  progress,
  onPress,
  onToggleFavorite,
  header,
  empty,
}: Props<T>) {
  const { width, gutter, gap, columns, s } = useLayout();
  const insets = useSafeAreaInsets();
  const cols = columns[variant];
  const cardWidth = Math.floor((width - insets.left - insets.right - gutter * 2 - gap * (cols - 1)) / cols);

  const press = useCallback((item: T) => onPress(item, items), [onPress, items]);
  const toggle = useCallback((item: T) => onToggleFavorite(item.key), [onToggleFavorite]);

  return (
    <FlatList
      // numColumns can't change on the fly, so a new column count remounts the list.
      key={`grid-${cols}`}
      data={items}
      numColumns={cols}
      keyExtractor={(item) => item.id}
      extraData={favorites}
      renderItem={({ item }) => (
        <ChannelCard
          item={item}
          variant={variant}
          width={cardWidth}
          favorite={favorites.has(item.key)}
          badge={badge?.(item)}
          progress={progress?.(item)}
          onPress={press}
          onLongPress={toggle}
        />
      )}
      columnWrapperStyle={{ gap }}
      contentContainerStyle={{
        paddingLeft: gutter + insets.left,
        paddingRight: gutter + insets.right,
        paddingBottom: insets.bottom + s(32),
        gap,
      }}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ListFooterComponent={<View />}
      initialNumToRender={cols * 5}
      maxToRenderPerBatch={cols * 4}
      windowSize={7}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    />
  );
}
