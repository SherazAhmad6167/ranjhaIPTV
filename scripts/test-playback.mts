// Resume and track-picking rules. Run with: npm run test:playback (Node 22.18+ runs TypeScript directly).
import assert from 'node:assert/strict';
import type { AudioTrack, SubtitleTrack } from 'expo-video';

import {
  isFinished,
  makeProgress,
  parseProgress,
  progressFraction,
  resumePosition,
  timeLeftLabel,
} from '../src/lib/progress.ts';
import { describeTracks, languageCode, preferredTrack, sameTrack } from '../src/lib/tracks.ts';

// The credits count as the end: the last 5%, or the last half minute.
assert.equal(isFinished(6800, 7200), false);
assert.equal(isFinished(6850, 7200), true);
assert.equal(isFinished(80, 100), true);
assert.equal(isFinished(10, 0), false);

// Streams of unknown length can't be measured.
assert.equal(makeProgress(NaN, 100), null);
assert.equal(makeProgress(10, 0), null);
assert.equal(makeProgress(10, Infinity), null);
assert.deepEqual(makeProgress(9000, 7200, 1), { position: 7200, duration: 7200, finished: true, updatedAt: 1 });

// Resume a little early; a few seconds in, or a finished title, starts over.
assert.equal(resumePosition(undefined), 0);
assert.equal(resumePosition(makeProgress(5, 3600)!), 0);
assert.equal(resumePosition(makeProgress(600, 3600)!), 597);
assert.equal(resumePosition(makeProgress(3500, 3600)!), 0);

assert.equal(progressFraction(makeProgress(5, 3600)!), undefined);
assert.equal(progressFraction(makeProgress(3500, 3600)!), undefined);
assert.equal(progressFraction(makeProgress(1800, 3600)!), 0.5);
assert.equal(progressFraction(makeProgress(12, 7200)!), 0.02);

assert.equal(timeLeftLabel(makeProgress(1800, 3600)!), '30 min left');
assert.equal(timeLeftLabel(makeProgress(0, 7200)!), '2 h left');
assert.equal(timeLeftLabel(makeProgress(1080, 5400)!), '1 h 12 min left');
assert.equal(timeLeftLabel(makeProgress(7190, 7200)!), '1 min left');

const restored = parseProgress({
  a: { position: 100, duration: 1000, finished: false, updatedAt: 5 },
  b: { position: 10, duration: 1000, finished: true, updatedAt: 6 },
  c: { position: 'x', duration: 1000 },
  d: null,
  e: { position: 50, duration: 0 },
});
assert.deepEqual([...restored.keys()], ['a', 'b']);
assert.equal(restored.get('b')!.finished, true);
assert.equal(parseProgress('garbage').size, 0);

// Languages, however the container spells them.
assert.equal(languageCode('hin'), 'hi');
assert.equal(languageCode('HI-in'), 'hi');
assert.equal(languageCode('en'), 'en');
assert.equal(languageCode('und'), '');
assert.equal(languageCode(undefined), '');

const audio = (o: Partial<AudioTrack>): AudioTrack => ({ language: '', label: '', ...o });
const hindi = audio({ id: '1', language: 'hin', label: 'Hindi' });
const english = audio({ id: '2', language: 'eng', label: 'English', isDefault: true });
const commentary = audio({ id: '3', language: 'en', label: 'English', name: 'Commentary' });
const unknown = audio({ id: '4', language: 'und', label: 'und' });
const tracks = [hindi, english, commentary, unknown];

assert.deepEqual(
  describeTracks(tracks, 'Audio').map((o) => [o.title, o.detail]),
  [
    ['Hindi', undefined],
    ['English', undefined],
    ['English', 'Commentary'],
    ['Audio 4', undefined],
  ],
);
// Tracks that would read the same are numbered.
assert.deepEqual(
  describeTracks([english, audio({ id: '9', language: 'eng', label: 'English' })], 'Audio').map((o) => o.detail),
  [undefined, 'Track 2'],
);

// iOS tracks have no id and are matched by what they describe.
assert.equal(sameTrack(hindi, { ...hindi }), true);
assert.equal(sameTrack(hindi, english), false);
assert.equal(sameTrack(audio({ language: 'hi', label: 'Hindi' }), audio({ language: 'hi', label: 'Hindi' })), true);
assert.equal(sameTrack(null, null), true);
assert.equal(sameTrack(hindi, null), false);

// The preferred language wins, the stream's default among several matches.
assert.equal(preferredTrack(tracks, hindi, 'en'), english);
assert.equal(preferredTrack(tracks, english, 'en'), undefined);
assert.equal(preferredTrack(tracks, english, 'hi'), hindi);
assert.equal(preferredTrack(tracks, english, 'fr'), undefined);
assert.equal(preferredTrack(tracks, english, null), undefined);
const subtitle: SubtitleTrack = { id: 's1', language: 'ur', label: 'Urdu' };
assert.equal(preferredTrack([subtitle], null, 'ur'), subtitle);

console.log('ALL PLAYBACK TESTS PASSED');
