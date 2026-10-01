import { useSyncExternalStore } from 'react';

import { makeProgress, parseProgress, type ProgressMap, type WatchProgress } from './progress';
import { storage } from './storage';

/** Titles remembered; the least recently watched are forgotten first. */
const MAX_ENTRIES = 300;
/** While a title plays, its position reaches storage at most this often. */
const SAVE_EVERY_MS = 15_000;

// Insertion order is recency: an updated record moves to the end.
let entries = new Map<string, WatchProgress>();
/** What screens see; replaced on `flush()`, so playback ticks don't re-render the app. */
let snapshot: ProgressMap = new Map();
let published = true;
let unsaved = false;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function put(key: string, progress: WatchProgress) {
  entries.delete(key);
  entries.set(key, progress);
  if (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest !== undefined) entries.delete(oldest);
  }
  published = false;
  unsaved = true;
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  if (!unsaved) return;
  unsaved = false;
  storage.setProgress(Object.fromEntries(entries)).catch(() => {});
}

function publish() {
  if (published) return;
  published = true;
  snapshot = new Map(entries);
  listeners.forEach((listener) => listener());
}

/** Where the viewer is in each movie and episode, kept across launches. */
export const watchProgress = {
  async hydrate(): Promise<void> {
    const saved = parseProgress(await storage.getProgress());
    // Anything recorded while storage was being read is newer than what it held.
    for (const [key, progress] of entries) {
      saved.delete(key);
      saved.set(key, progress);
    }
    entries = saved;
    published = false;
    publish();
  },

  get(key: string): WatchProgress | undefined {
    return entries.get(key);
  },

  /**
   * Notes the playback position. Cheap enough to call every second: storage is
   * written now and then, and screens catch up on `flush()`.
   */
  record(key: string, position: number, duration: number) {
    const progress = makeProgress(position, duration);
    if (!progress) return;
    put(key, progress);
    saveTimer ??= setTimeout(save, SAVE_EVERY_MS);
  },

  /** Marks a title as watched to the end. */
  finish(key: string, duration: number) {
    const progress = makeProgress(duration, duration);
    if (progress) put(key, { ...progress, finished: true });
  },

  /** Saves right away and updates every screen that shows progress. */
  flush() {
    save();
    publish();
  },
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => snapshot;

/** Watch progress by channel key. Updates when the player saves (pause, exit, finish), not every second. */
export function useWatchProgress(): ProgressMap {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
