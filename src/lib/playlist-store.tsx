import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { downloadPlaylist } from './download';
import { parseM3U, type Channel } from './m3u';
import { clearCachedPlaylist, readCachedPlaylist, writeCachedPlaylist } from './playlist-cache';
import type { PlaylistSource } from './source';
import { storage } from './storage';

/** Re-download the playlist in the background when the cached copy is older than this. */
const STALE_MS = 12 * 60 * 60 * 1000;
const MAX_RECENTS = 40;

interface PlaylistContextValue {
  hydrated: boolean;
  source: PlaylistSource | null;
  channels: Channel[];
  loading: boolean;
  error: string | null;
  loadedAt: number | null;
  favorites: ReadonlySet<string>;
  recents: readonly string[];
  /** Downloads the playlist for a new source and saves it. Throws if it can't be loaded. */
  connect(source: PlaylistSource): Promise<void>;
  refresh(): Promise<void>;
  disconnect(): Promise<void>;
  toggleFavorite(key: string): void;
  markWatched(key: string): void;
  /** The list the user picked a channel from; the player zaps through it. */
  setQueue(list: Channel[]): void;
  getQueue(): Channel[];
}

const PlaylistContext = createContext<PlaylistContextValue | null>(null);

export function PlaylistProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [source, setSource] = useState<PlaylistSource | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const queueRef = useRef<Channel[]>([]);
  // Only the latest download may update state (e.g. connect() while a refresh is running).
  const requestId = useRef(0);

  const load = useCallback(async (next: PlaylistSource, { save }: { save: boolean }) => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const { text, playlist } = await downloadPlaylist(next);
      if (id !== requestId.current) return;
      const now = Date.now();
      setSource(next);
      setChannels(playlist.channels);
      setLoadedAt(now);
      if (save) await storage.setSource(next);
      await Promise.all([writeCachedPlaylist(text), storage.setLoadedAt(now)]).catch(() => {});
    } catch (e) {
      if (id === requestId.current) setError((e as Error).message);
      throw e;
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [saved, favs, recent, savedAt] = await Promise.all([
        storage.getSource(),
        storage.getFavorites(),
        storage.getRecents(),
        storage.getLoadedAt(),
      ]);
      let cached: Channel[] = [];
      if (saved) {
        const text = await readCachedPlaylist().catch(() => null);
        if (text) cached = parseM3U(text).channels;
      }
      if (cancelled) return;

      setSource(saved);
      setChannels(cached);
      setFavorites(favs);
      setRecents(recent);
      setLoadedAt(savedAt);
      setHydrated(true);

      const stale = !savedAt || Date.now() - savedAt > STALE_MS;
      if (saved && (cached.length === 0 || stale)) {
        // Errors surface through `error`; the cached list stays usable meanwhile.
        load(saved, { save: false }).catch(() => {});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  // Persist favorites/recents after hydration so the initial empty state never overwrites saved data.
  useEffect(() => {
    if (hydrated) storage.setFavorites(favorites).catch(() => {});
  }, [hydrated, favorites]);
  useEffect(() => {
    if (hydrated) storage.setRecents(recents).catch(() => {});
  }, [hydrated, recents]);

  const connect = useCallback((next: PlaylistSource) => load(next, { save: true }), [load]);

  const refresh = useCallback(async () => {
    if (source) await load(source, { save: false });
  }, [load, source]);

  const disconnect = useCallback(async () => {
    requestId.current++;
    setSource(null);
    setChannels([]);
    setLoadedAt(null);
    setError(null);
    setLoading(false);
    await Promise.all([storage.clearSession(), clearCachedPlaylist().catch(() => {})]);
  }, []);

  const toggleFavorite = useCallback((key: string) => {
    setFavorites((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [key, ...prev]));
  }, []);

  const markWatched = useCallback((key: string) => {
    setRecents((prev) => [key, ...prev.filter((k) => k !== key)].slice(0, MAX_RECENTS));
  }, []);

  const setQueue = useCallback((list: Channel[]) => {
    queueRef.current = list;
  }, []);
  const getQueue = useCallback(() => queueRef.current, []);

  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);

  const value = useMemo<PlaylistContextValue>(
    () => ({
      hydrated,
      source,
      channels,
      loading,
      error,
      loadedAt,
      favorites: favoriteSet,
      recents,
      connect,
      refresh,
      disconnect,
      toggleFavorite,
      markWatched,
      setQueue,
      getQueue,
    }),
    [
      hydrated,
      source,
      channels,
      loading,
      error,
      loadedAt,
      favoriteSet,
      recents,
      connect,
      refresh,
      disconnect,
      toggleFavorite,
      markWatched,
      setQueue,
      getQueue,
    ],
  );

  return <PlaylistContext.Provider value={value}>{children}</PlaylistContext.Provider>;
}

export function usePlaylist(): PlaylistContextValue {
  const ctx = useContext(PlaylistContext);
  if (!ctx) throw new Error('usePlaylist must be used inside <PlaylistProvider>');
  return ctx;
}
