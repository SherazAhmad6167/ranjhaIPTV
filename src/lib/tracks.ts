import type { AudioTrack, SubtitleTrack } from 'expo-video';

/**
 * Naming and matching audio and subtitle tracks. Containers label languages
 * inconsistently ("hin", "hi", "hi-IN", "und"), so everything is compared by a
 * normalised two-letter code.
 */

type Track = AudioTrack | SubtitleTrack;

// ISO 639-2 (three letters, as MKV and MPEG-TS use) to ISO 639-1, for the languages
// IPTV catalogs carry most. Unlisted codes are kept as they are.
const TWO_LETTER: Record<string, string> = {
  eng: 'en', hin: 'hi', urd: 'ur', pan: 'pa', ara: 'ar', ben: 'bn', tam: 'ta', tel: 'te',
  mal: 'ml', kan: 'kn', mar: 'mr', guj: 'gu', per: 'fa', fas: 'fa', pus: 'ps', snd: 'sd',
  nep: 'ne', sin: 'si', tur: 'tr', spa: 'es', fre: 'fr', fra: 'fr', ger: 'de', deu: 'de',
  ita: 'it', por: 'pt', rus: 'ru', jpn: 'ja', kor: 'ko', chi: 'zh', zho: 'zh', ind: 'id',
  may: 'ms', msa: 'ms', tha: 'th', vie: 'vi', dut: 'nl', nld: 'nl', pol: 'pl', swe: 'sv',
  nor: 'no', dan: 'da', fin: 'fi', gre: 'el', ell: 'el', heb: 'he', ukr: 'uk', rum: 'ro',
  ron: 'ro', hun: 'hu', cze: 'cs', ces: 'cs', fil: 'tl', tgl: 'tl', swa: 'sw', kur: 'ku',
  aze: 'az', uzb: 'uz', kaz: 'kk', bul: 'bg', hrv: 'hr', srp: 'sr', slo: 'sk', slk: 'sk',
};

const NAMES: Record<string, string> = {
  en: 'English', hi: 'Hindi', ur: 'Urdu', pa: 'Punjabi', ar: 'Arabic', bn: 'Bengali', ta: 'Tamil',
  te: 'Telugu', ml: 'Malayalam', kn: 'Kannada', mr: 'Marathi', gu: 'Gujarati', fa: 'Persian',
  ps: 'Pashto', sd: 'Sindhi', ne: 'Nepali', si: 'Sinhala', tr: 'Turkish', es: 'Spanish',
  fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese', ru: 'Russian', ja: 'Japanese',
  ko: 'Korean', zh: 'Chinese', id: 'Indonesian', ms: 'Malay', th: 'Thai', vi: 'Vietnamese',
  nl: 'Dutch', pl: 'Polish', sv: 'Swedish', no: 'Norwegian', da: 'Danish', fi: 'Finnish',
  el: 'Greek', he: 'Hebrew', uk: 'Ukrainian', ro: 'Romanian', hu: 'Hungarian', cs: 'Czech',
  tl: 'Filipino', sw: 'Swahili', ku: 'Kurdish', az: 'Azerbaijani', uz: 'Uzbek', kk: 'Kazakh',
  bg: 'Bulgarian', hr: 'Croatian', sr: 'Serbian', sk: 'Slovak',
};

/** "hin", "HI" and "hi-IN" are all "hi"; "" when the language isn't known. */
export function languageCode(language: string | null | undefined): string {
  const base = (language ?? '').trim().toLowerCase().split(/[-_]/)[0];
  if (!base || base === 'und' || base === 'mul' || base === 'zxx' || base === 'unknown') return '';
  return TWO_LETTER[base] ?? base;
}

/** The language, in words: "Hindi". */
function languageName(track: Track): string {
  const code = languageCode(track.language);
  if (NAMES[code]) return NAMES[code];
  // The platform names the language in the device's language; use that unless it's just the code again.
  const label = track.label?.trim();
  if (label && label.toLowerCase() !== (track.language ?? '').toLowerCase() && languageCode(label) !== '') {
    return label[0].toUpperCase() + label.slice(1);
  }
  return code ? code.toUpperCase() : '';
}

export interface TrackOption<T extends Track> {
  track: T;
  /** "Hindi" */
  title: string;
  /** What sets it apart from the others, e.g. "Commentary" or "Dolby 5.1". */
  detail?: string;
}

/**
 * Names for a list of tracks. Each gets its language, plus the stream's own name
 * for the track when that adds something; tracks that would still read the same
 * are numbered.
 */
export function describeTracks<T extends Track>(tracks: readonly T[], fallback: string): TrackOption<T>[] {
  const options = tracks.map((track, i) => {
    const language = languageName(track);
    const name = track.name?.trim();
    const title = language || name || `${fallback} ${i + 1}`;
    const detail = name && name.toLowerCase() !== title.toLowerCase() ? name : undefined;
    return { track, title, detail };
  });
  const seen = new Map<string, number>();
  for (const option of options) {
    const id = `${option.title}\n${option.detail ?? ''}`;
    const n = (seen.get(id) ?? 0) + 1;
    seen.set(id, n);
    if (n > 1) option.detail = option.detail ? `${option.detail} · ${n}` : `Track ${n}`;
  }
  return options;
}

/** iOS tracks carry no id, so they are told apart by what they describe. */
export function sameTrack(a: Track | null | undefined, b: Track | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  if (a.id && b.id) return a.id === b.id;
  return a.language === b.language && a.label === b.label && (a.name ?? '') === (b.name ?? '');
}

/**
 * The track to switch to so playback follows the viewer's language, or undefined
 * when the current one already does (or nothing matches).
 */
export function preferredTrack<T extends Track>(
  tracks: readonly T[],
  current: T | null,
  language: string | null,
): T | undefined {
  if (!language || languageCode(current?.language) === language) return undefined;
  const matches = tracks.filter((t) => languageCode(t.language) === language);
  return matches.find((t) => t.isDefault) ?? matches[0];
}
