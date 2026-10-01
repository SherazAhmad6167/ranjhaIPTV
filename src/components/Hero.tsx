import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import type { CardItem } from '@/lib/catalog';
import type { ChannelKind } from '@/lib/m3u';
import { useLayout, type Layout } from '@/lib/layout';
import { colors, fonts, gradients, tileGradient } from '@/lib/theme';

import { Button, type IconName } from './Button';
import { initials } from './ChannelLogo';
import { Focusable, NATIVE_DRIVER } from './Focusable';

const ROTATE_MS = 9000;
const FADE_MS = 800;

const KIND_BADGE: Record<ChannelKind, string> = { live: 'LIVE', movie: 'MOVIE', series: 'SERIES' };

// A featured series opens its episode list rather than playing straight away.
const PRIMARY: Record<ChannelKind, { label: string; icon: IconName }> = {
  live: { label: 'Watch Live', icon: 'play' },
  movie: { label: 'Play', icon: 'play' },
  series: { label: 'Episodes', icon: 'albums' },
};

/** A channel, a movie or a whole series. */
export interface HeroItem extends CardItem {
  group: string;
  kind: ChannelKind;
}

interface Props<T extends HeroItem> {
  items: T[];
  /** Height covered by the transparent top bar. */
  topInset: number;
  favorites: ReadonlySet<string>;
  onPlay(item: T): void;
  onToggleFavorite(key: string): void;
}

/** Full-bleed featured billboard that cross-fades between a few highlighted titles. */
export function Hero<T extends HeroItem>({ items, topInset, favorites, onPlay, onToggleFavorite }: Props<T>) {
  const layout = useLayout();
  // Sized for the tallest artwork among the slides, so the page doesn't jump as they rotate.
  const height = heroHeight(layout, topInset, items.some((c) => c.kind !== 'live'));
  const [index, setIndex] = useState(0);
  const [previous, setPrevious] = useState<number | null>(null);
  // Set once the billboard has moved on from its first slide.
  const [rotated, setRotated] = useState(false);
  const fade = useRef(new Animated.Value(1)).current;
  const count = items.length;
  const current = Math.min(index, Math.max(0, count - 1));

  const go = useCallback(
    (next: number) => {
      if (next === current) return;
      setPrevious(current);
      setIndex(next);
      setRotated(true);
      fade.setValue(0);
      Animated.timing(fade, { toValue: 1, duration: FADE_MS, useNativeDriver: NATIVE_DRIVER }).start(
        ({ finished }) => finished && setPrevious(null),
      );
    },
    [current, fade],
  );

  useEffect(() => {
    if (count < 2) return;
    const timer = setTimeout(() => go((current + 1) % count), ROTATE_MS);
    return () => clearTimeout(timer);
  }, [go, current, count]);

  const channel = items[current];
  if (!channel) return <View style={{ height }} />;
  const art = artFrame(layout, height, topInset, channel.kind !== 'live');

  // Android's hasTVPreferredFocus calls requestFocus() on phones too, and the home list
  // then scrolls back up to the hero. So only a TV gets it, and only for the first slide:
  // a rotation must never pull focus (or the page) away from what the viewer is browsing.
  const slide = (c: T, preferFocus: boolean) => (
    <Slide
      channel={c}
      layout={layout}
      height={height}
      topInset={topInset}
      preferFocus={preferFocus}
      favorite={favorites.has(c.key)}
      onPlay={() => onPlay(c)}
      onToggleFavorite={() => onToggleFavorite(c.key)}
    />
  );

  return (
    <View style={{ height }}>
      {previous !== null && items[previous] && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {slide(items[previous], false)}
        </View>
      )}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]}>
        {slide(channel, layout.isTV && !rotated)}
      </Animated.View>

      {count > 1 && (
        <View
          style={[
            styles.dots,
            // Centred just below the artwork, so a tall poster never runs into them.
            layout.wide
              ? { top: art.top + art.height + layout.s(14), right: art.right, width: art.width, justifyContent: 'center' }
              : { left: 0, right: 0, bottom: layout.s(6), justifyContent: 'center' },
          ]}
        >
          {items.map((c, i) => (
            <Focusable
              key={c.id}
              onPress={() => go(i)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Show ${c.name}`}
              style={[
                styles.dot,
                { height: layout.s(4), width: layout.s(i === current ? 26 : 10) },
                i === current && styles.dotActive,
              ]}
              focusStyle={styles.dotFocused}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const PHONE_TITLE = 30;

/**
 * Wide screens give the billboard a cinematic share of the window. Phones stack
 * artwork, title and buttons, so there it is exactly as tall as that stack, with
 * room for a two-line title.
 */
function heroHeight(layout: Layout, topInset: number, poster: boolean): number {
  if (layout.wide) return layout.heroHeight;
  const { s } = layout;
  const info = s(22) + s(10) + 2 * Math.round(s(PHONE_TITLE) * 1.08) + s(16) + s(54);
  return topInset + s(8) + artFrame(layout, 0, topInset, poster).height + s(20) + info + s(26);
}

/**
 * The artwork box: a 16:9 glass panel for channel logos, a 2:3 poster for movies and series.
 * `top` and `right` place it on wide layouts; phones lay it out in the stack.
 */
function artFrame(layout: Layout, height: number, topInset: number, poster: boolean) {
  const { wide, gutter, width, s } = layout;
  if (!wide) {
    const artHeight = poster
      ? Math.round(Math.min(width * 0.72, layout.height * 0.4))
      : Math.round((Math.min(width * 0.8, s(420)) * 9) / 16);
    return { top: 0, right: 0, height: artHeight, width: Math.round(poster ? artHeight / 1.5 : (artHeight * 16) / 9) };
  }
  const space = height - topInset;
  const artHeight = Math.round(space * (poster ? 0.72 : 0.5));
  return {
    top: topInset + Math.round((space - artHeight) * 0.42),
    right: Math.round(gutter + width * 0.06),
    height: artHeight,
    width: Math.min(Math.round(poster ? artHeight / 1.5 : (artHeight * 16) / 9), Math.round(width * 0.4)),
  };
}

function Slide({
  channel,
  layout,
  height,
  topInset,
  preferFocus,
  favorite,
  onPlay,
  onToggleFavorite,
}: {
  channel: HeroItem;
  layout: Layout;
  height: number;
  topInset: number;
  /** Puts the remote's initial focus on the primary button. */
  preferFocus: boolean;
  favorite: boolean;
  onPlay(): void;
  onToggleFavorite(): void;
}) {
  const { wide, gutter, width, s } = layout;
  const [failed, setFailed] = useState(false);
  const [from, to] = tileGradient(channel.name);
  const poster = channel.kind !== 'live';
  const logo = channel.logo && !failed ? channel.logo : undefined;
  const art = artFrame(layout, height, topInset, poster);

  const titleSize = s(wide ? 46 : PHONE_TITLE);

  const artwork = (
    <View
      style={[
        styles.art,
        { width: art.width, height: art.height, borderRadius: s(poster ? 10 : 18) },
        wide && { position: 'absolute', top: art.top, right: art.right },
      ]}
    >
      <LinearGradient colors={[from, to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      {logo ? (
        <Image
          source={logo}
          style={poster ? StyleSheet.absoluteFill : styles.artLogo}
          contentFit={poster ? 'cover' : 'contain'}
          cachePolicy="memory-disk"
          transition={250}
          onError={() => setFailed(true)}
        />
      ) : (
        <Text style={[styles.artInitials, { fontSize: Math.round(art.height * 0.3) }]}>{initials(channel.name)}</Text>
      )}
      <LinearGradient
        colors={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.6, y: 0.6 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
    </View>
  );

  const info = (
    <View
      style={
        wide
          ? [styles.info, { left: gutter, bottom: Math.round(height * 0.14), maxWidth: Math.min(width * 0.46, s(620)) }]
          : [styles.infoStacked, { marginTop: s(20) }]
      }
    >
      <View style={[styles.badges, { gap: s(10), marginBottom: s(10), minHeight: s(22) }]}>
        <View style={[styles.badge, channel.kind === 'live' ? styles.badgeLive : styles.badgeKind, { paddingHorizontal: s(8), paddingVertical: s(3), borderRadius: s(5) }]}>
          {channel.kind === 'live' && <View style={[styles.liveDot, { width: s(6), height: s(6), borderRadius: s(3) }]} />}
          <Text style={[styles.badgeText, { fontSize: s(11) }]}>{KIND_BADGE[channel.kind]}</Text>
        </View>
        <Text style={[styles.group, { fontSize: s(14) }]} numberOfLines={1}>
          {channel.group}
        </Text>
      </View>
      <Text
        style={[
          styles.title,
          { fontSize: titleSize, lineHeight: Math.round(titleSize * 1.08) },
          !wide && styles.center,
        ]}
        numberOfLines={2}
      >
        {channel.name}
      </Text>
      <View style={[styles.actions, { gap: s(12), marginTop: s(wide ? 22 : 16) }]}>
        <Button
          label={PRIMARY[channel.kind].label}
          icon={PRIMARY[channel.kind].icon}
          variant="light"
          size="lg"
          onPress={onPlay}
          hasTVPreferredFocus={preferFocus}
        />
        <Button
          label="My List"
          icon={favorite ? 'checkmark' : 'add'}
          variant="glass"
          size="lg"
          onPress={onToggleFavorite}
        />
      </View>
    </View>
  );

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Ambient backdrop: the channel's colours plus a heavily blurred copy of its artwork. */}
      <LinearGradient colors={[from, to, colors.bg]} start={{ x: 0.8, y: 0 }} end={{ x: 0.1, y: 1 }} style={StyleSheet.absoluteFill} />
      {logo && (
        <Image
          source={logo}
          style={[StyleSheet.absoluteFill, styles.ambient]}
          contentFit="cover"
          blurRadius={60}
          cachePolicy="memory-disk"
        />
      )}
      <LinearGradient colors={gradients.scrimTop} style={[styles.topScrim, { height: topInset * 2 }]} />
      {wide && (
        <LinearGradient
          colors={gradients.fadeLeft}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          locations={[0, 0.45, 1]}
          style={[styles.leftScrim, { width: width * 0.7 }]}
        />
      )}
      <LinearGradient
        colors={gradients.fadeBottom}
        locations={[0, 0.5, 1]}
        style={[styles.bottomScrim, { height: height * (wide ? 0.55 : 0.6) }]}
      />

      {wide ? (
        <>
          {artwork}
          {info}
        </>
      ) : (
        <View
          style={[
            StyleSheet.absoluteFill,
            styles.stack,
            { paddingTop: topInset + s(8), paddingBottom: s(26), paddingHorizontal: gutter },
          ]}
        >
          {artwork}
          {info}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  ambient: { opacity: 0.5 },
  topScrim: { position: 'absolute', top: 0, left: 0, right: 0 },
  leftScrim: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  bottomScrim: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  art: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
    boxShadow: '0px 24px 60px rgba(0,0,0,0.6)',
  },
  artLogo: { position: 'absolute', top: '16%', bottom: '16%', left: '16%', right: '16%' },
  artInitials: { color: 'rgba(255,255,255,0.9)', fontFamily: fonts.black, letterSpacing: 2 },
  info: { position: 'absolute' },
  stack: { alignItems: 'center', justifyContent: 'center' },
  infoStacked: { alignSelf: 'stretch', alignItems: 'center' },
  badges: { flexDirection: 'row', alignItems: 'center' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  badgeLive: { backgroundColor: colors.live },
  badgeKind: { backgroundColor: 'rgba(255,255,255,0.16)' },
  liveDot: { backgroundColor: '#fff' },
  badgeText: { color: '#fff', fontFamily: fonts.extrabold, letterSpacing: 1.2 },
  group: { color: colors.textMuted, fontFamily: fonts.medium, flexShrink: 1 },
  title: {
    color: '#fff',
    fontFamily: fonts.black,
    letterSpacing: -0.5,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 18,
  },
  center: { textAlign: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap' },
  dots: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.3)' },
  dotActive: { backgroundColor: colors.accent },
  dotFocused: { backgroundColor: '#fff' },
});
