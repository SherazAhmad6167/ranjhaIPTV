import { useSyncExternalStore } from 'react';

import { storage } from './storage';

/** Choices the viewer made once and expects the app to remember. */
export interface Preferences {
  /** Language of the audio track picked last, e.g. "hi"; null until one is picked. */
  audioLanguage: string | null;
  /** Language of the subtitles picked last, `SUBTITLES_OFF` once turned off, null until either. */
  subtitleLanguage: string | null;
  /** Keep playing in a floating window when leaving the app mid-video. */
  autoPictureInPicture: boolean;
}

export const SUBTITLES_OFF = 'off';

const DEFAULTS: Preferences = {
  audioLanguage: null,
  subtitleLanguage: null,
  autoPictureInPicture: true,
};

let current = DEFAULTS;
const listeners = new Set<() => void>();

function parse(value: unknown): Preferences {
  if (!value || typeof value !== 'object') return DEFAULTS;
  const v = value as Record<string, unknown>;
  const text = (x: unknown) => (typeof x === 'string' && x ? x : null);
  return {
    audioLanguage: text(v.audioLanguage),
    subtitleLanguage: text(v.subtitleLanguage),
    autoPictureInPicture:
      typeof v.autoPictureInPicture === 'boolean' ? v.autoPictureInPicture : DEFAULTS.autoPictureInPicture,
  };
}

export const preferences = {
  async hydrate(): Promise<void> {
    current = parse(await storage.getPreferences());
    listeners.forEach((listener) => listener());
  },

  get(): Preferences {
    return current;
  },

  set(patch: Partial<Preferences>) {
    const next = { ...current, ...patch };
    if ((Object.keys(next) as (keyof Preferences)[]).every((k) => next[k] === current[k])) return;
    current = next;
    listeners.forEach((listener) => listener());
    storage.setPreferences(current).catch(() => {});
  },
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => current;

export function usePreferences(): Preferences {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
