import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { CardItem } from '@/lib/catalog';
import { cardAspect, type CardVariant } from '@/lib/layout';
import { colors, fonts, gradients, tileGradient } from '@/lib/theme';

import { initials } from './ChannelLogo';
import { Focusable } from './Focusable';

interface Props<T extends CardItem> {
  item: T;
  variant: CardVariant;
  width: number;
  favorite?: boolean;
  /** Short label on the artwork, e.g. "12 Episodes" on a series folder. */
  badge?: string;
  onPress(item: T): void;
  onLongPress?(item: T): void;
}

export function cardRadius(width: number) {
  return Math.round(Math.min(14, Math.max(6, width * 0.045)));
}

/** Draws a channel, a movie or a series folder; generic so callbacks get back what was passed in. */
export const ChannelCard = memo(Card) as typeof Card;

function Card<T extends CardItem>({ item, variant, width, favorite, badge, onPress, onLongPress }: Props<T>) {
  const height = Math.round(width * cardAspect(variant));
  const radius = cardRadius(width);
  const poster = variant === 'poster';
  const nameSize = Math.round(Math.min(26, Math.max(11, width * (poster ? 0.095 : 0.068))));
  const badgeSize = Math.round(Math.min(18, Math.max(10, width * 0.068)));

  return (
    <Focusable
      onPress={() => onPress(item)}
      onLongPress={onLongPress && (() => onLongPress(item))}
      delayLongPress={400}
      zoom={1.07}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${item.name}, ${badge}` : `Play ${item.name}`}
      style={[styles.card, { width, height, borderRadius: radius }]}
      focusStyle={styles.cardFocused}
    >
      {({ focused }) => (
        <>
          <Artwork item={item} poster={poster} radius={radius} height={height} />
          <LinearGradient
            colors={gradients.scrimBottom}
            locations={[0.45, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={[styles.caption, { padding: Math.round(width * 0.05) }]} pointerEvents="none">
            <Text
              style={[styles.name, { fontSize: nameSize, lineHeight: Math.round(nameSize * 1.2) }]}
              numberOfLines={poster ? 2 : 1}
            >
              {item.name}
            </Text>
          </View>
          {badge ? (
            <View
              style={[
                styles.pill,
                {
                  top: Math.round(radius * 0.6),
                  left: Math.round(radius * 0.6),
                  gap: Math.round(badgeSize * 0.3),
                  paddingHorizontal: Math.round(badgeSize * 0.5),
                  paddingVertical: Math.round(badgeSize * 0.2),
                  borderRadius: Math.round(badgeSize * 0.5),
                },
              ]}
              pointerEvents="none"
            >
              <Ionicons name="albums" size={badgeSize} color="#fff" />
              <Text style={[styles.pillText, { fontSize: badgeSize }]} numberOfLines={1}>
                {badge}
              </Text>
            </View>
          ) : null}
          {favorite && (
            <View style={[styles.badge, { top: radius * 0.6, right: radius * 0.6 }]} pointerEvents="none">
              <Ionicons name="star" size={Math.max(11, Math.round(width * 0.06))} color={colors.star} />
            </View>
          )}
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              styles.ring,
              { borderRadius: radius },
              focused && styles.ringFocused,
            ]}
          />
        </>
      )}
    </Focusable>
  );
}

function Artwork({
  item,
  poster,
  radius,
  height,
}: {
  item: CardItem;
  poster: boolean;
  radius: number;
  height: number;
}) {
  const [failed, setFailed] = useState(false);
  const [from, to] = tileGradient(item.name);
  const hasLogo = !!item.logo && !failed;

  return (
    <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
      <LinearGradient colors={[from, to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.7, y: 0.7 }}
        style={StyleSheet.absoluteFill}
      />
      {hasLogo ? (
        <Image
          source={item.logo}
          style={poster ? StyleSheet.absoluteFill : styles.logo}
          contentFit={poster ? 'cover' : 'contain'}
          cachePolicy="memory-disk"
          recyclingKey={item.logo}
          transition={180}
          onError={() => setFailed(true)}
        />
      ) : (
        <View style={styles.initialsBox}>
          <Text
            style={[styles.initials, { fontSize: Math.round(height * (poster ? 0.2 : 0.3)) }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {initials(item.name)}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    boxShadow: '0px 6px 18px rgba(0,0,0,0.45)',
  },
  // Lifts a zoomed card above its neighbours.
  cardFocused: { zIndex: 2, boxShadow: '0px 14px 36px rgba(0,0,0,0.7)' },
  logo: {
    position: 'absolute',
    top: '14%',
    bottom: '30%',
    left: '18%',
    right: '18%',
  },
  initialsBox: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: '12%',
    paddingHorizontal: '10%',
  },
  initials: {
    color: 'rgba(255,255,255,0.88)',
    fontFamily: fonts.black,
    letterSpacing: 1,
  },
  caption: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  name: {
    color: '#fff',
    fontFamily: fonts.semibold,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 6,
  },
  pill: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '80%',
    backgroundColor: 'rgba(0,0,0,0.62)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  pillText: { flexShrink: 1, color: '#fff', fontFamily: fonts.bold, letterSpacing: 0.2 },
  badge: {
    position: 'absolute',
    padding: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  ring: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  ringFocused: { borderWidth: 3, borderColor: colors.focus },
});
