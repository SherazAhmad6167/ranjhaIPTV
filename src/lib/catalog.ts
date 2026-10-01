import type { IconName } from '@/components/Button';

import type { Channel, ChannelKind } from './m3u';
import type { CardVariant } from './layout';

export const KINDS: readonly ChannelKind[] = ['live', 'movie', 'series'];

export const KIND_LABELS: Record<ChannelKind, string> = {
  live: 'Live TV',
  movie: 'Movies',
  series: 'Series',
};

export const KIND_ICONS: Record<ChannelKind, IconName> = {
  live: 'tv-outline',
  movie: 'film-outline',
  series: 'albums-outline',
};

/** What a card draws: a channel, a movie, or a whole series. */
export interface CardItem {
  id: string;
  key: string;
  name: string;
  logo?: string;
}

export const variantFor = (kind: ChannelKind): CardVariant => (kind === 'live' ? 'landscape' : 'poster');

export function availableKinds(channels: readonly Channel[]): ChannelKind[] {
  return KINDS.filter((k) => channels.some((c) => c.kind === k));
}

export interface ChannelGroup {
  name: string;
  channels: Channel[];
}

/** Groups in playlist order, which is the order the provider arranged them in. */
export function groupChannels(channels: readonly Channel[]): ChannelGroup[] {
  const map = new Map<string, Channel[]>();
  for (const c of channels) {
    const list = map.get(c.group);
    if (list) list.push(c);
    else map.set(c.group, [c]);
  }
  return [...map].map(([name, list]) => ({ name, channels: list }));
}

/** Resolves recently watched keys to channels, most recent first. */
export function resolveKeys(channels: readonly Channel[], keys: readonly string[]): Channel[] {
  const byKey = new Map(channels.map((c) => [c.key, c]));
  return keys.map((k) => byKey.get(k)).filter((c): c is Channel => c !== undefined);
}

/**
 * Titles for the home billboard: what the user watched last, then the lead
 * title of the first few groups. Titles with artwork are preferred.
 */
export function pickFeatured<T extends CardItem>(
  recent: readonly T[],
  groups: readonly (readonly T[])[],
  max = 5,
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  const add = (c: T | undefined) => {
    if (!c || seen.has(c.key) || out.length >= max) return;
    seen.add(c.key);
    out.push(c);
  };
  recent.filter((c) => c.logo).slice(0, 2).forEach(add);
  for (const g of groups) add(g.find((c) => c.logo));
  for (const g of groups) add(g[0]);
  return out;
}

export function matches(item: { name: string }, query: string): boolean {
  return item.name.toLowerCase().includes(query);
}
