// Parser regression test. Run with: npm run test:parser (Node 22.18+ runs TypeScript directly).
import assert from 'node:assert/strict';
import { parseM3U } from '../src/lib/m3u.ts';

const text = '\uFEFF#EXTM3U url-tvg="http://epg.example/xmltv.xml"\r\n' +
`#EXTINF:-1 tvg-id="geo.pk" tvg-name="Geo News" tvg-logo="http://logo/geo.png" group-title="News, PK",Geo News HD
http://20.20.20.70:809/live/u/p/101.ts
#EXTINF:-1 tvg-id=ptv group-title=Sports,PTV Sports, Live
#EXTVLCOPT:http-user-agent=VLC/3.0
#EXTVLCOPT:http-referrer=http://ref.example/
http://103.66.159.193:8090/u/p/202
#EXTINF:0,Movie A
#EXTGRP:VOD Action
http://host/movie/u/p/5.mkv
#EXTINF:-1 group-title="Kodi",Piped
http://host/stream.m3u8|User-Agent=My%20UA&Referer=http://r/
http://host/bare/channel-name.ts
#EXTINF:-1 tvg-name="Only Tvg Name",
#EXTHTTP:{"cookie":"a=b"}
http://host/series/u/p/9.mp4
`;
const p = parseM3U(text);
assert.equal(p.epgUrl, 'http://epg.example/xmltv.xml');
assert.equal(p.channels.length, 6);
const [a, b, c, d, e, f] = p.channels;
assert.equal(a.name, 'Geo News HD'); assert.equal(a.group, 'News, PK'); assert.equal(a.logo, 'http://logo/geo.png'); assert.equal(a.tvgId, 'geo.pk'); assert.equal(a.kind, 'live');
assert.equal(b.name, 'PTV Sports, Live'); assert.equal(b.group, 'Sports'); assert.deepEqual(b.headers, { 'User-Agent': 'VLC/3.0', Referer: 'http://ref.example/' });
assert.equal(c.group, 'VOD Action'); assert.equal(c.kind, 'movie');
assert.equal(d.url, 'http://host/stream.m3u8'); assert.deepEqual(d.headers, { 'User-Agent': 'My UA', Referer: 'http://r/' });
assert.equal(e.name, 'channel-name.ts'); assert.equal(e.group, 'Uncategorized'); assert.equal(e.headers, undefined);
assert.equal(f.name, 'Only Tvg Name'); assert.equal(f.kind, 'series'); assert.deepEqual(f.headers, { Cookie: 'a=b' });
console.log('ALL PARSER TESTS PASSED');
