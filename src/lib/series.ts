import type { Channel } from './m3u';
import { progressFraction, type ProgressMap } from './progress';

/**
 * IPTV playlists list series one episode per entry ("Show S01E02"). This
 * module folds those entries back into shows, so the app can present a series
 * as a single folder that opens onto its seasons and episodes.
 */

export interface Episode {
  channel: Channel;
  /** Key of the show this episode belongs to. */
  showKey: string;
  /** 0 for specials and for entries whose name carries no episode number. */
  season: number;
  number?: number;
  /** What follows the episode marker, e.g. "Pilot". Often empty. */
  title: string;
}

export interface Season {
  number: number;
  episodes: Episode[];
}

/** One series within one category, with its episodes in watching order. */
export interface Show {
  /** Same as `key`; lets a show be drawn as a card. */
  id: string;
  /** Stable across refreshes; used for favorites and the series screen's URL. */
  key: string;
  name: string;
  group: string;
  logo?: string;
  kind: 'series';
  seasons: Season[];
  episodes: Episode[];
}

export interface ShowGroup {
  name: string;
  shows: Show[];
}

export interface SeriesCatalog {
  /** Groups in playlist order, shows in the order they first appear. */
  groups: ShowGroup[];
  shows: Show[];
  byKey: ReadonlyMap<string, Show>;
  /** Episode lookup by channel key. */
  episodes: ReadonlyMap<string, Episode>;
}

export function isShow(item: object): item is Show {
  return 'seasons' in item;
}

// Tried in order. The leading `(.*)` is greedy so the last marker in a name wins,
// which keeps show names that contain a stray "E4" or "2x" intact.
const MARKERS: { re: RegExp; hasSeason: boolean }[] = [
  // "Show S01E02", "Show - S1 E2", "Show.S01.E02", "Show Season 1 Episode 2"
  {
    re: /^(.*)\bS(?:eason)?[\s._-]*(\d{1,3})[\s._,-]*E(?:p(?:isode)?)?[\s._-]*(\d{1,4})(?!\d)(.*)$/i,
    hasSeason: true,
  },
  // "Show 1x02"
  { re: /^(.*)\b(\d{1,2})x(\d{1,4})(?!\d)(.*)$/i, hasSeason: true },
  // "Show Episode 12", "Show Ep 12", "Show E12" (single-season dramas)
  { re: /^(.*)\b(?:Episode|Epi|Ep|E)[\s._#:-]*(\d{1,4})(?!\d)(.*)$/i, hasSeason: false },
];

export interface ParsedEpisodeName {
  show: string;
  season: number;
  number: number;
  title: string;
}

/** Splits "Show Name S01E02 - Title" into its parts; null when there's no episode marker. */
export function parseEpisodeName(name: string): ParsedEpisodeName | null {
  for (const { re, hasSeason } of MARKERS) {
    const m = re.exec(name);
    if (!m) continue;
    return {
      show: cleanShowName(m[1]),
      season: hasSeason ? Number(m[2]) : 1,
      number: Number(hasSeason ? m[3] : m[2]),
      title: cleanTitle(hasSeason ? m[4] : m[3]),
    };
  }
  return null;
}

function cleanShowName(raw: string): string {
  let name = raw.replace(/[\s._\-–—|:,([]+$/, '').trim();
  // "Show.Name" / "Show_Name" style release names.
  if (!name.includes(' ')) name = name.replace(/[._]+/g, ' ').trim();
  return name;
}

function cleanTitle(raw: string): string {
  return raw.replace(/^[\s._\-–—|:,)\]]+/, '').trim();
}

/** Makes "Show-Name", "show name" and "Show  Name" the same show. */
function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\s._\-–—:|,'’]+/g, ' ')
    .trim();
}

// The channel list only changes when a playlist is (re)loaded, so each list is folded once
// and every screen shares the result.
const cache = new WeakMap<readonly Channel[], SeriesCatalog>();

export function getSeries(channels: readonly Channel[]): SeriesCatalog {
  let catalog = cache.get(channels);
  if (!catalog) {
    catalog = buildSeries(channels);
    cache.set(channels, catalog);
  }
  return catalog;
}

interface Draft {
  show: Show;
  entries: { episode: Episode; order: number }[];
  logos: Map<string, number>;
}

function buildSeries(channels: readonly Channel[]): SeriesCatalog {
  const drafts = new Map<string, Draft>();
  const groupMap = new Map<string, Show[]>();

  channels.forEach((channel, order) => {
    if (channel.kind !== 'series') return;
    const parsed = parseEpisodeName(channel.name);
    // An entry without a marker is a show of its own; one with a marker but no
    // show name ("S01E01 - Pilot") belongs to its category.
    const name = parsed ? parsed.show || channel.group : channel.name;
    const key = `series:${channel.group}::${normalize(name)}`;

    let draft = drafts.get(key);
    if (!draft) {
      const show: Show = { id: key, key, name, group: channel.group, kind: 'series', seasons: [], episodes: [] };
      draft = { show, entries: [], logos: new Map() };
      drafts.set(key, draft);
      const list = groupMap.get(channel.group);
      if (list) list.push(show);
      else groupMap.set(channel.group, [show]);
    }

    draft.entries.push({
      episode: {
        channel,
        showKey: key,
        season: parsed?.season ?? 0,
        number: parsed?.number,
        title: parsed?.title ?? '',
      },
      order,
    });
    if (channel.logo) draft.logos.set(channel.logo, (draft.logos.get(channel.logo) ?? 0) + 1);
  });

  const episodes = new Map<string, Episode>();
  for (const { show, entries, logos } of drafts.values()) {
    // Specials (season 0) after the numbered seasons; unnumbered entries last within a season.
    entries.sort(
      (a, b) =>
        (a.episode.season || Infinity) - (b.episode.season || Infinity) ||
        (a.episode.number ?? Infinity) - (b.episode.number ?? Infinity) ||
        a.order - b.order,
    );
    show.episodes = entries.map((e) => e.episode);
    for (const episode of show.episodes) {
      const season = show.seasons[show.seasons.length - 1];
      if (season?.number === episode.season) season.episodes.push(episode);
      else show.seasons.push({ number: episode.season, episodes: [episode] });
      episodes.set(episode.channel.key, episode);
    }
    // Panels usually give every episode the series poster; the most common image is the cover.
    let best = 0;
    for (const [logo, count] of logos) {
      if (count > best) {
        best = count;
        show.logo = logo;
      }
    }
  }

  const groups = [...groupMap].map(([name, shows]) => ({ name, shows }));
  const shows = groups.flatMap((g) => g.shows);
  return { groups, shows, byKey: new Map(shows.map((s) => [s.key, s])), episodes };
}

/** The episode of a show watched last; `recents` holds channel keys, newest first. */
export function lastWatched(catalog: SeriesCatalog, show: Show, recents: readonly string[]): Episode | undefined {
  for (const key of recents) {
    const episode = catalog.episodes.get(key);
    if (episode?.showKey === show.key) return episode;
  }
  return undefined;
}

/** Where to pick a show back up: the episode watched last, or the next one once that was watched to the end. */
export function continueFrom(catalog: SeriesCatalog, episode: Episode, progress: ProgressMap): Episode {
  if (!progress.get(episode.channel.key)?.finished) return episode;
  const episodes = catalog.byKey.get(episode.showKey)?.episodes ?? [];
  return episodes[episodes.indexOf(episode) + 1] ?? episode;
}

/**
 * The episode to continue each show from, most recently watched show first.
 * `recents` holds channel keys, newest first.
 */
export function resumePoints(
  catalog: SeriesCatalog,
  recents: readonly string[],
  progress: ProgressMap,
): Map<string, Episode> {
  const out = new Map<string, Episode>();
  for (const key of recents) {
    const episode = catalog.episodes.get(key);
    if (episode && !out.has(episode.showKey)) out.set(episode.showKey, continueFrom(catalog, episode, progress));
  }
  return out;
}

/** The next episode of the same show, if there is one. */
export function nextEpisode(catalog: SeriesCatalog, channel: Channel): Episode | undefined {
  const episode = catalog.episodes.get(channel.key);
  if (!episode) return undefined;
  const episodes = catalog.byKey.get(episode.showKey)?.episodes ?? [];
  return episodes[episodes.indexOf(episode) + 1];
}

/** Shows for resume points, in the same order. */
export function resumeShows(catalog: SeriesCatalog, resume: ReadonlyMap<string, Episode>): Show[] {
  return [...resume.keys()].map((k) => catalog.byKey.get(k)).filter((s): s is Show => s !== undefined);
}

/** Share watched of the episode each show continues from, for the bar on its card. */
export function showProgress(
  resume: ReadonlyMap<string, Episode>,
  progress: ProgressMap,
): (show: Show) => number | undefined {
  return (show) => {
    const episode = resume.get(show.key);
    return episode && progressFraction(progress.get(episode.channel.key));
  };
}

/** Card label for shows in progress: the episode to pick up from, e.g. "S01 E03". */
export function resumeBadge(resume: ReadonlyMap<string, Episode>): (show: Show) => string {
  return (show) => {
    const episode = resume.get(show.key);
    return (episode && episodeCode(episode)) || showSummary(show);
  };
}

/** Favorites hold show keys for series, so "My List" collects whole shows. */
export function favoriteKeyFor(channel: Channel, channels: readonly Channel[]): string {
  if (channel.kind !== 'series') return channel.key;
  return getSeries(channels).episodes.get(channel.key)?.showKey ?? channel.key;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "S01 E02", or "" when the episode has no number. */
export function episodeCode(episode: Episode): string {
  if (episode.number === undefined) return '';
  return episode.season ? `S${pad(episode.season)} E${pad(episode.number)}` : `E${pad(episode.number)}`;
}

export function episodeTitle(episode: Episode): string {
  if (episode.title) return episode.title;
  return episode.number !== undefined ? `Episode ${episode.number}` : episode.channel.name;
}

export function seasonLabel(number: number): string {
  return number ? `Season ${number}` : 'Specials';
}

/** "3 Seasons" or "12 Episodes": what's inside the folder. */
export function showSummary(show: Show): string {
  const seasons = show.seasons.length;
  if (seasons > 1) return `${seasons} Seasons`;
  const n = show.episodes.length;
  return `${n} ${n === 1 ? 'Episode' : 'Episodes'}`;
}
