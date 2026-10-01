/**
 * How far into a movie or episode the viewer got, and what that means for
 * resuming it. Pure functions only; `progress-store.ts` keeps the records.
 */

export interface WatchProgress {
  /** Seconds in. */
  position: number;
  /** Length of the title in seconds. */
  duration: number;
  /** Watched to the end. The closing credits count as the end. */
  finished: boolean;
  updatedAt: number;
}

/** Watch progress by channel key. */
export type ProgressMap = ReadonlyMap<string, WatchProgress>;

/** Less than this into a title isn't worth resuming. */
export const MIN_RESUME_S = 10;
/** Resume slightly before where the viewer stopped, so they can pick the thread back up. */
const REWIND_S = 3;
/** The last 5% (or the last half minute of a short title) is the credits: the title counts as watched. */
const CREDITS_FRACTION = 0.95;
const CREDITS_MIN_S = 30;

export function isFinished(position: number, duration: number): boolean {
  return duration > 0 && (position >= duration * CREDITS_FRACTION || duration - position <= CREDITS_MIN_S);
}

/** A record for this position, or null when it can't be measured (e.g. a stream of unknown length). */
export function makeProgress(position: number, duration: number, now = Date.now()): WatchProgress | null {
  if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0 || position < 0) return null;
  const clamped = Math.min(position, duration);
  return { position: clamped, duration, finished: isFinished(clamped, duration), updatedAt: now };
}

/** Where playback should start, in seconds: 0 for a new or finished title. */
export function resumePosition(progress: WatchProgress | undefined): number {
  if (!progress || progress.finished || progress.position < MIN_RESUME_S) return 0;
  return Math.max(0, progress.position - REWIND_S);
}

/** Share watched, for the bar under a title's artwork; undefined when there's nothing to resume. */
export function progressFraction(progress: WatchProgress | undefined): number | undefined {
  if (!progress || progress.finished || progress.position < MIN_RESUME_S) return undefined;
  return Math.min(1, Math.max(0.02, progress.position / progress.duration));
}

/** "1 h 12 min left", "23 min left". */
export function timeLeftLabel(progress: WatchProgress): string {
  const mins = Math.max(1, Math.round((progress.duration - progress.position) / 60));
  if (mins < 60) return `${mins} min left`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min left` : `${h} h left`;
}

/** Restores records saved by `progress-store.ts`, dropping anything malformed. */
export function parseProgress(value: unknown): Map<string, WatchProgress> {
  const out = new Map<string, WatchProgress>();
  if (!value || typeof value !== 'object') return out;
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') continue;
    const { position, duration, finished, updatedAt } = raw as Record<string, unknown>;
    if (typeof position !== 'number' || typeof duration !== 'number') continue;
    const progress = makeProgress(position, duration, typeof updatedAt === 'number' ? updatedAt : 0);
    if (!progress) continue;
    // A title played through to the end stays watched even if the last position saved was earlier.
    out.set(key, finished === true ? { ...progress, finished: true } : progress);
  }
  return out;
}
