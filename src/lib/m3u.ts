export type ChannelKind = 'live' | 'movie' | 'series';

export interface Channel {
  /** Unique within one parsed playlist (position based). */
  id: string;
  /** Stable across refreshes; used for favorites and recents. */
  key: string;
  name: string;
  url: string;
  group: string;
  logo?: string;
  tvgId?: string;
  kind: ChannelKind;
  /** Extra HTTP headers the stream needs (from #EXTVLCOPT / #EXTHTTP / `url|Header=value`). */
  headers?: Record<string, string>;
}

export interface Playlist {
  channels: Channel[];
  /** EPG (XMLTV) URL advertised in the #EXTM3U header, if any. */
  epgUrl?: string;
}

export const UNGROUPED = 'Uncategorized';

/**
 * Parses an M3U / M3U8 (extended M3U) IPTV playlist.
 *
 * Handles the variants that IPTV panels commonly emit: quoted and unquoted
 * attributes, commas inside quoted attributes, #EXTGRP groups, VLC/Kodi
 * header options and `url|User-Agent=...` style suffixes.
 */
export function parseM3U(text: string): Playlist {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const channels: Channel[] = [];
  let epgUrl: string | undefined;

  let pending: Partial<Channel> | null = null;
  let pendingGroup: string | undefined;
  let pendingHeaders: Record<string, string> = {};

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith('#')) {
      const upper = line.slice(0, 12).toUpperCase();

      if (upper.startsWith('#EXTM3U')) {
        const attrs = parseAttributes(line.slice(7));
        epgUrl = attrs['url-tvg'] || attrs['x-tvg-url'] || epgUrl;
      } else if (upper.startsWith('#EXTINF:')) {
        pending = parseExtInf(line.slice(8));
      } else if (upper.startsWith('#EXTGRP:')) {
        pendingGroup = line.slice(8).trim() || undefined;
      } else if (upper.startsWith('#EXTVLCOPT:')) {
        const [opt, ...rest] = line.slice(11).split('=');
        const value = rest.join('=').trim();
        const header = VLC_OPT_HEADERS[opt.trim().toLowerCase()];
        if (header && value) pendingHeaders[header] = value;
      } else if (upper.startsWith('#EXTHTTP:')) {
        try {
          const json = JSON.parse(line.slice(9));
          for (const [k, v] of Object.entries(json)) {
            if (typeof v === 'string') pendingHeaders[normalizeHeader(k)] = v;
          }
        } catch {
          // Ignore malformed header JSON rather than failing the whole playlist.
        }
      }
      continue;
    }

    // Any non-comment line is a stream URL that closes the current entry.
    const { url, headers: pipeHeaders } = splitPipeHeaders(line);
    const headers = { ...pendingHeaders, ...pipeHeaders };
    const index = channels.length;
    const name = pending?.name || nameFromUrl(url);

    channels.push({
      id: `c${index}`,
      key: url,
      name,
      url,
      group: pending?.group || pendingGroup || UNGROUPED,
      logo: pending?.logo,
      tvgId: pending?.tvgId,
      kind: detectKind(url),
      headers: Object.keys(headers).length ? headers : undefined,
    });

    pending = null;
    pendingGroup = undefined;
    pendingHeaders = {};
  }

  return { channels, epgUrl };
}

const VLC_OPT_HEADERS: Record<string, string> = {
  'http-user-agent': 'User-Agent',
  'http-referrer': 'Referer',
  'http-referer': 'Referer',
  'http-origin': 'Origin',
  'http-cookie': 'Cookie',
};

function normalizeHeader(name: string): string {
  const lower = name.trim().toLowerCase();
  if (lower === 'user-agent') return 'User-Agent';
  if (lower === 'referer' || lower === 'referrer') return 'Referer';
  if (lower === 'origin') return 'Origin';
  if (lower === 'cookie') return 'Cookie';
  return name.trim();
}

/** `#EXTINF:` body: `<duration> key="value" ...,<title>` */
function parseExtInf(body: string): Partial<Channel> {
  // The title starts after the first comma that is not inside double quotes.
  let inQuotes = false;
  let commaAt = -1;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ',' && !inQuotes) {
      commaAt = i;
      break;
    }
  }

  const head = commaAt >= 0 ? body.slice(0, commaAt) : body;
  const title = commaAt >= 0 ? body.slice(commaAt + 1).trim() : '';
  const attrs = parseAttributes(head);

  return {
    name: title || attrs['tvg-name'] || undefined,
    group: attrs['group-title']?.trim() || undefined,
    logo: attrs['tvg-logo']?.trim() || attrs['logo']?.trim() || undefined,
    tvgId: attrs['tvg-id']?.trim() || undefined,
  };
}

function parseAttributes(text: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([A-Za-z0-9_-]+)=(?:"([^"]*)"|'([^']*)'|([^\s"',]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return attrs;
}

/** Kodi style: `http://host/stream.ts|User-Agent=Foo&Referer=http://bar` */
function splitPipeHeaders(line: string): { url: string; headers: Record<string, string> } {
  const pipe = line.indexOf('|');
  if (pipe < 0) return { url: line, headers: {} };

  const headers: Record<string, string> = {};
  for (const pair of line.slice(pipe + 1).split('&')) {
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const key = pair.slice(0, eq);
    let value = pair.slice(eq + 1);
    try {
      value = decodeURIComponent(value);
    } catch {
      // Keep the raw value if it isn't valid percent-encoding.
    }
    headers[normalizeHeader(key)] = value;
  }
  return { url: line.slice(0, pipe).trim(), headers };
}

/** Xtream-style panels put VOD under /movie/ and /series/ paths. */
function detectKind(url: string): ChannelKind {
  if (/\/movie\//i.test(url)) return 'movie';
  if (/\/series\//i.test(url)) return 'series';
  return 'live';
}

function nameFromUrl(url: string): string {
  const path = url.split(/[?#]/)[0];
  const last = path.split('/').filter(Boolean).pop();
  return last ? decodeSafe(last) : url;
}

function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
