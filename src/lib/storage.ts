import AsyncStorage from '@react-native-async-storage/async-storage';

import { parseSavedSource, type PlaylistSource } from './source';

const KEYS = {
  source: 'iptv.source',
  favorites: 'iptv.favorites',
  recents: 'iptv.recents',
  loadedAt: 'iptv.loadedAt',
  progress: 'iptv.progress',
  preferences: 'iptv.preferences',
} as const;

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): Promise<void> {
  return AsyncStorage.setItem(key, JSON.stringify(value));
}

export const storage = {
  getSource: async () => parseSavedSource(await readJson<unknown>(KEYS.source, null)),
  setSource: (s: PlaylistSource) => writeJson(KEYS.source, s),

  getFavorites: () => readJson<string[]>(KEYS.favorites, []),
  setFavorites: (keys: string[]) => writeJson(KEYS.favorites, keys),

  getRecents: () => readJson<string[]>(KEYS.recents, []),
  setRecents: (keys: string[]) => writeJson(KEYS.recents, keys),

  getLoadedAt: () => readJson<number | null>(KEYS.loadedAt, null),
  setLoadedAt: (t: number) => writeJson(KEYS.loadedAt, t),

  // Validated by their own modules: watch-progress.ts and preferences.ts.
  getProgress: () => readJson<unknown>(KEYS.progress, null),
  setProgress: (entries: unknown) => writeJson(KEYS.progress, entries),

  getPreferences: () => readJson<unknown>(KEYS.preferences, null),
  setPreferences: (prefs: unknown) => writeJson(KEYS.preferences, prefs),

  clearSession: () => AsyncStorage.multiRemove([KEYS.source, KEYS.loadedAt]),
};
