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
import { AppState } from 'react-native';

import { downloadPlaylist, findServer } from './download';
import { parseM3U, type Channel } from './m3u';
import { clearCachedPlaylist, readCachedPlaylist, writeCachedPlaylist } from './playlist-cache';
import { preferences } from './preferences';
import { watchProgress } from './progress-store';
import { retarget, type PlaylistSource } from './source';
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
      const { text, playlist, server } = await downloadPlaylist(next);
      if (id !== requestId.current) return;
      const now = Date.now();
      const answered = { ...next, server };
      setSource(answered);
      setChannels(retarget(playlist.channels, server));
      setLoadedAt(now);
      // A refresh that switched address saves it too, so the next launch points the cache there.
      if (save || server !== next.server) await storage.setSource(answered);
      await Promise.all([writeCachedPlaylist(text), storage.setLoadedAt(now)]).catch(() => {});
    } catch (e) {
      if (id === requestId.current) setError((e as Error).message);
      throw e;
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  /** Points the channels at whichever server answers from this network now, without re-downloading. */
  const recheckServer = useCallback(async (current: PlaylistSource) => {
    const id = requestId.current;
    const server = await findServer();
    // A download or sign-out since then has the final say.
    if (id !== requestId.current || server === current.server) return;
    const moved = { ...current, server };
    setSource(moved);
    setChannels((prev) => retarget(prev, server));
    await storage.setSource(moved);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [saved, favs, recent, savedAt] = await Promise.all([
        storage.getSource(),
        storage.getFavorites(),
        storage.getRecents(),
        storage.getLoadedAt(),
        // Ready before any screen shows, so the first title opened already resumes.
        watchProgress.hydrate(),
        preferences.hydrate(),
      ]);
      let cached: Channel[] = [];
      if (saved) {
        const text = await readCachedPlaylist().catch(() => null);
        if (text) {
          cached = parseM3U(text).channels;
          if (saved.server) cached = retarget(cached, saved.server);
        }
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
      } else if (saved) {
        recheckServer(saved).catch(() => {});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load, recheckServer]);

  // Phones move between networks while in the background, so check again on every return.
  useEffect(() => {
    if (!source) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') recheckServer(source).catch(() => {});
    });
    return () => sub.remove();
  }, [source, recheckServer]);

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
