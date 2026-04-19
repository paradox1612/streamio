'use strict';

/**
 * Release title parser — port of the patterns used by Sonarr/Radarr's
 * Parser.cs, rewritten in JavaScript. The goal is deterministic decomposition
 * of messy provider titles into structured fields so the downstream matcher
 * can rely on exact (normalized) equality instead of fuzzy scoring.
 *
 * Pipeline (order matters):
 *   1. Pre-clean: strip file extension, website prefix, request-info tags,
 *      containers/URLs, leading/trailing separators.
 *   2. Detect + strip release group (-GROUP at end, [GROUP] at start).
 *   3. Detect season/episode / daily air-date / anime absolute numbering.
 *   4. Detect year.
 *   5. Detect quality, source, codec, resolution, HDR, edition.
 *   6. Detect language tags (bracketed / explicit only).
 *   7. Everything remaining = title. Normalize.
 */

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

const FILE_EXTENSION_RE = /\.(mkv|mp4|avi|mov|wmv|flv|webm|m4v|mpe?g|ts|m2ts|iso|strm)$/i;

const WEBSITE_PREFIX_RE = /^(?:www\.)?\w[\w-]*\.(?:com|net|org|co|io|tv|me|cc|to|info|biz|us|uk|de|ru|fr|es|it|nl|ws|xyz|icu|club|store|site|online|space)\s*[-_.:]\s*/i;

const REQUEST_INFO_RE = /\[(?:req(?:uest)?|request[ _-]?info)[^\]]*\]/gi;

// Release group: trailing "-GROUP" or "[GROUP]" at end of string.
// Avoid matching things that look like years or qualities.
const TRAILING_GROUP_RE = /-([A-Za-z0-9_.]{2,}?)(?:\[.+?\])?$/;
const LEADING_GROUP_RE = /^\[([A-Za-z0-9_.-]{2,})\]\s*/;

const YEAR_RE = /\b((?:19|20)\d{2})\b/g;
const YEAR_PARENS_RE = /[\(\[](?:19|20)\d{2}[\)\]]/g;

// Season/episode: priority-ordered. First match wins.
const SEASON_EPISODE_PATTERNS = [
  // S01E01, S01E01E02, S01E01-E05
  {
    re: /\bS(\d{1,4})(?:\s*[-._x]?\s*E)(\d{1,4})(?:(?:[-._]?(?:E|to|&)\s*)(\d{1,4}))?\b/i,
    pick: (m) => ({
      season: +m[1],
      episodes: buildEpisodeRange(+m[2], m[3] ? +m[3] : null),
    }),
  },
  // 1x01, 1x01x02
  {
    re: /\b(\d{1,4})x(\d{1,4})(?:x(\d{1,4}))?\b/i,
    pick: (m) => ({
      season: +m[1],
      episodes: buildEpisodeRange(+m[2], m[3] ? +m[3] : null),
    }),
  },
  // "Season 1 Episode 2" / "Season 1"
  {
    re: /\b(?:Season|Series|Saison|Stagione|Temporada)\s*[:._-]?\s*(\d{1,4})(?:\s*(?:Episode|Ep|E)\s*[:._-]?\s*(\d{1,4}))?\b/i,
    pick: (m) => ({
      season: +m[1],
      episodes: m[2] ? [+m[2]] : [],
    }),
  },
  // Part 1, Part I / Part one (arabic only, roman handled separately if needed)
  {
    re: /\bPart\s*(\d{1,3})\b/i,
    pick: (m) => ({ season: null, episodes: [+m[1]], isPart: true }),
  },
];

// Daily-air-date: 2024.01.15, 2024-01-15, 2024 01 15
const DAILY_DATE_RE = /\b(19|20)(\d{2})[._\s-](\d{2})[._\s-](\d{2})\b/;

// Anime absolute episode: " - 01 -", " - 001 ", "[001]"
const ANIME_ABSOLUTE_RE = /(?:\s-\s*|\[)(\d{1,4})(?=\s*(?:-|\]|v\d|\s\[))/;

// Quality
const QUALITY_PATTERNS = {
  resolution: /\b(2160p|1440p|1080p|720p|576p|480p|360p|4k|uhd|fhd|qhd|hd|sd)\b/i,
  source: /\b(bluray|blu[\s._-]?ray|bd(?:rip|r)?|brrip|web[\s._-]?dl|web[\s._-]?rip|webdl|webrip|web|hdtv|pdtv|dvdrip|dvd[\s._-]?r?|hdrip|hdcam|hd[\s._-]?cam|cam|telesync|ts|telecine|tc|workprint|scr|screener|remux|hdtc|ppv|amzn|nf|hmax|dsnp|atvp|itnv|pcok|hulu|crav|strp)\b/i,
  codec: /\b(x264|x265|h[\s._-]?264|h[\s._-]?265|hevc|avc|xvid|divx|vp9|av1)\b/i,
  hdr: /\b(hdr10\+?|hdr|dv|dolby[\s._-]?vision|sdr)\b/i,
  edition: /\b(imax|extended|unrated|uncut|remastered|director'?s?[\s._-]?cut|dc|theatrical|special[\s._-]?edition|anniversary|criterion|fan[\s._-]?edit|ultimate[\s._-]?cut|rogue[\s._-]?cut|final[\s._-]?cut)\b/i,
  audio: /\b(dd5\.?1|ddp5\.?1|ddp?[0-9]\.?[0-9]|dts(?:[\s._-]?hd)?(?:[\s._-]?ma)?|atmos|truehd|aac|ac3|flac|mp3|opus|dual[\s._-]?audio)\b/i,
};

// Language tags. Match ONLY when bracket-bounded or as standalone dot/space
// tokens — never as substrings of normal words. "Spanish Inquisition" must
// not trigger the Spanish filter.
const LANGUAGE_TAG_MAP = {
  en: 'english', eng: 'english', english: 'english',
  ru: 'russian', rus: 'russian', russian: 'russian',
  es: 'spanish', spa: 'spanish', esp: 'spanish', spanish: 'spanish', latino: 'spanish', castellano: 'spanish',
  fr: 'french', fra: 'french', fre: 'french', french: 'french', vff: 'french', vostfr: 'french', truefrench: 'french',
  de: 'german', ger: 'german', deu: 'german', german: 'german',
  it: 'italian', ita: 'italian', italian: 'italian',
  pt: 'portuguese', por: 'portuguese', portuguese: 'portuguese', dublado: 'portuguese',
  ja: 'japanese', jpn: 'japanese', japanese: 'japanese', jp: 'japanese',
  ko: 'korean', kor: 'korean', korean: 'korean',
  zh: 'chinese', chi: 'chinese', chinese: 'chinese', mandarin: 'chinese', cantonese: 'chinese',
  hi: 'hindi', hin: 'hindi', hindi: 'hindi',
  ta: 'tamil', tam: 'tamil', tamil: 'tamil',
  te: 'telugu', tel: 'telugu', telugu: 'telugu',
  ml: 'malayalam', mal: 'malayalam', malayalam: 'malayalam',
  kn: 'kannada', kan: 'kannada', kannada: 'kannada',
  bn: 'bangla', ben: 'bangla', bangla: 'bangla', bengali: 'bangla',
  pa: 'punjabi', pan: 'punjabi', punjabi: 'punjabi',
  ur: 'urdu', urd: 'urdu', urdu: 'urdu',
  ar: 'arabic', ara: 'arabic', arabic: 'arabic',
  tr: 'turkish', tur: 'turkish', turkish: 'turkish',
  fa: 'persian', per: 'persian', fas: 'persian', persian: 'persian', farsi: 'persian',
  multi: 'multi', dual: 'multi',
};

// Match language tags only when bracketed or delimited by dots/underscores/
// brackets/spaces — NOT inside normal words. We scan over a copy of the
// title where separators have been normalized to ".".
const LANGUAGE_TAG_SCAN_RE = /(?:^|[\.\[\(\s])(en|eng|english|ru|rus|russian|es|spa|esp|spanish|latino|castellano|fr|fra|fre|french|vff|vostfr|truefrench|de|ger|deu|german|it|ita|italian|pt|por|portuguese|dublado|ja|jpn|japanese|jp|ko|kor|korean|zh|chi|chinese|mandarin|cantonese|hi|hin|hindi|ta|tam|tamil|te|tel|telugu|ml|mal|malayalam|kn|kan|kannada|bn|ben|bangla|bengali|pa|pan|punjabi|ur|urd|urdu|ar|ara|arabic|tr|tur|turkish|fa|per|fas|persian|farsi|multi|dual)(?=[\.\]\)\s]|$)/gi;

// Leading articles that get stripped during normalization
const LEADING_ARTICLES = new Set(['the', 'a', 'an', 'le', 'la', 'les', 'el', 'los', 'las', 'il', 'la', 'der', 'die', 'das']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildEpisodeRange(start, end) {
  if (end == null || end <= start) return [start];
  const out = [];
  for (let i = start; i <= end; i += 1) out.push(i);
  return out;
}

function foldUnicode(input) {
  return String(input || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Normalize a title for exact-match lookup.
 * Sonarr strategy: lowercase, remove leading articles, strip all non-alnum,
 * collapse to a single token. "The Pitt (2024)" -> "pitt".
 * This is strict — Le Bureau and The Bureau normalize to "bureau" only if we
 * accept that aliasing handles language variants.
 */
function normalizeTitle(input) {
  if (!input) return '';
  let t = foldUnicode(input).toLowerCase();
  // drop years, seasons, episodes, common noise before collapsing
  t = t.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ');
  t = t.replace(/&/g, ' and ');
  // strip leading article
  const m = t.match(/^\s*(the|a|an|le|la|les|el|los|las|il|der|die|das)\s+/);
  if (m) t = t.slice(m[0].length);
  // remove all non-alphanumeric (this is the Sonarr collapse)
  t = t.replace(/[^a-z0-9]+/g, '');
  return t;
}

/**
 * Softer normalization that keeps word boundaries. Useful for display.
 */
function normalizeTitleLoose(input) {
  if (!input) return '';
  let t = foldUnicode(input).toLowerCase();
  t = t.replace(/[^a-z0-9]+/g, ' ').trim();
  t = t.replace(/\s{2,}/g, ' ');
  return t;
}

function stripLeadingArticle(words) {
  if (words.length && LEADING_ARTICLES.has(words[0])) return words.slice(1);
  return words;
}

// ---------------------------------------------------------------------------
// Pipeline stages
// ---------------------------------------------------------------------------

function stripFileExtension(s) {
  return s.replace(FILE_EXTENSION_RE, '');
}

function stripWebsitePrefix(s) {
  return s.replace(WEBSITE_PREFIX_RE, '');
}

function stripRequestInfo(s) {
  return s.replace(REQUEST_INFO_RE, ' ');
}

function extractReleaseGroup(s) {
  let group = null;
  let rest = s;

  const lead = rest.match(LEADING_GROUP_RE);
  if (lead) {
    const candidate = lead[1];
    // Don't strip `[2021]` — that's a year, handled later.
    if (!/^(19|20)\d{2}$/.test(candidate)) {
      group = candidate;
      rest = rest.slice(lead[0].length);
    }
  }

  const trail = rest.match(TRAILING_GROUP_RE);
  if (trail) {
    const candidate = trail[1];
    // Reject if candidate looks like quality / year / season marker
    if (!/^(19|20)\d{2}$/.test(candidate)
      && !QUALITY_PATTERNS.resolution.test(candidate)
      && !QUALITY_PATTERNS.source.test(candidate)
      && !QUALITY_PATTERNS.codec.test(candidate)
      && candidate.length <= 40) {
      group = group || candidate;
      rest = rest.slice(0, rest.length - trail[0].length);
    }
  }
  return { rest, group };
}

function extractYear(s) {
  // Prefer year in parens/brackets
  const parened = s.match(/[\(\[]((?:19|20)\d{2})[\)\]]/);
  if (parened) {
    const y = +parened[1];
    if (y >= 1900 && y <= 2099) {
      return { year: y, stripped: s.replace(parened[0], ' ') };
    }
  }
  // Else last plausible bare year
  const bare = [...s.matchAll(YEAR_RE)].map((m) => ({ value: +m[1], index: m.index, raw: m[0] }));
  if (bare.length) {
    const pick = bare[bare.length - 1];
    if (pick.value >= 1900 && pick.value <= 2099) {
      const stripped = s.slice(0, pick.index) + ' ' + s.slice(pick.index + pick.raw.length);
      return { year: pick.value, stripped };
    }
  }
  return { year: null, stripped: s };
}

function extractSeasonEpisode(s) {
  // Try season/episode first
  for (const { re, pick } of SEASON_EPISODE_PATTERNS) {
    const m = s.match(re);
    if (m) {
      const picked = pick(m);
      const stripped = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length);
      return { ...picked, stripped, rawToken: m[0] };
    }
  }
  // Daily air date
  const daily = s.match(DAILY_DATE_RE);
  if (daily) {
    const airDate = `${daily[1]}${daily[2]}-${daily[3]}-${daily[4]}`;
    const stripped = s.slice(0, daily.index) + ' ' + s.slice(daily.index + daily[0].length);
    return { season: null, episodes: [], airDate, stripped, rawToken: daily[0] };
  }
  // Anime absolute — but reject 4-digit values that look like years.
  const anime = s.match(ANIME_ABSOLUTE_RE);
  if (anime && !/^(19|20)\d{2}$/.test(anime[1])) {
    const stripped = s.slice(0, anime.index) + ' ' + s.slice(anime.index + anime[0].length);
    return { season: null, episodes: [], absoluteEpisodes: [+anime[1]], stripped, rawToken: anime[0] };
  }
  return { season: null, episodes: [], stripped: s };
}

function extractQuality(s) {
  const out = {};
  let stripped = s;
  for (const [key, re] of Object.entries(QUALITY_PATTERNS)) {
    const m = stripped.match(re);
    if (m) {
      out[key] = m[1].toLowerCase().replace(/[\s._-]+/g, '-');
      stripped = stripped.slice(0, m.index) + ' ' + stripped.slice(m.index + m[0].length);
    }
  }
  return { ...out, stripped };
}

function extractLanguages(rawTitle) {
  // Scan raw (pre-cleaned) title with dot/bracket/space boundaries only.
  const found = new Set();
  const normalized = rawTitle.replace(/[_\-]/g, '.');
  let m;
  LANGUAGE_TAG_SCAN_RE.lastIndex = 0;
  while ((m = LANGUAGE_TAG_SCAN_RE.exec(normalized)) != null) {
    const code = m[1].toLowerCase();
    const lang = LANGUAGE_TAG_MAP[code];
    if (lang && lang !== 'multi') found.add(lang);
  }
  return [...found];
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function parseRelease(rawTitle) {
  const input = String(rawTitle || '').trim();
  if (!input) return emptyResult(input);

  let working = input;
  working = stripFileExtension(working);
  working = stripWebsitePrefix(working);
  working = stripRequestInfo(working);

  const languages = extractLanguages(input);

  const { rest: afterGroup, group: releaseGroup } = extractReleaseGroup(working);
  working = afterGroup;

  const se = extractSeasonEpisode(working);
  working = se.stripped;

  const { year, stripped: afterYear } = extractYear(working);
  working = afterYear;

  const quality = extractQuality(working);
  working = quality.stripped;

  // Remaining string = title. We've already extracted year / quality / episode
  // tokens, so anything left inside parens/brackets is noise — drop it.
  let title = working
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/[._]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // Also strip trailing language tokens that leaked into the title (e.g.
  // "Beverly Hills Cop: Axel F English" -> "Beverly Hills Cop: Axel F").
  if (languages.length) {
    const langTokens = new Set();
    for (const lang of languages) langTokens.add(lang.toLowerCase());
    const parts = title.split(/\s+/);
    while (parts.length > 1 && langTokens.has(parts[parts.length - 1].toLowerCase())) {
      parts.pop();
    }
    title = parts.join(' ').trim();
  }

  // Infer type
  let type = 'unknown';
  if (se.season != null || (se.episodes && se.episodes.length) || se.airDate || se.absoluteEpisodes) {
    type = 'series';
  } else if (year != null) {
    type = 'movie';
  }

  const normalizedTitle = normalizeTitle(title);
  const tokens = normalizeTitleLoose(title).split(' ').filter(Boolean);
  const normalizedTokens = stripLeadingArticle(tokens).join(' ');

  // Confidence: what fraction of the input did we recognize?
  const recognizedLen = input.length - working.length;
  const confidence = input.length ? Math.min(1, Math.max(0, recognizedLen / input.length)) : 0;

  return {
    input,
    title,
    normalizedTitle,
    normalizedTokens,
    type,
    year: year || null,
    season: se.season ?? null,
    episodes: se.episodes || [],
    absoluteEpisodes: se.absoluteEpisodes || [],
    airDate: se.airDate || null,
    releaseGroup: releaseGroup || null,
    resolution: quality.resolution || null,
    source: quality.source || null,
    codec: quality.codec || null,
    hdr: quality.hdr || null,
    edition: quality.edition || null,
    audio: quality.audio || null,
    languages,
    confidence,
  };
}

function emptyResult(input) {
  return {
    input: input || '',
    title: '',
    normalizedTitle: '',
    normalizedTokens: '',
    type: 'unknown',
    year: null,
    season: null,
    episodes: [],
    absoluteEpisodes: [],
    airDate: null,
    releaseGroup: null,
    resolution: null,
    source: null,
    codec: null,
    hdr: null,
    edition: null,
    audio: null,
    languages: [],
    confidence: 0,
  };
}

module.exports = {
  parseRelease,
  normalizeTitle,
  normalizeTitleLoose,
  extractLanguages,
  // exposed for tests
  _internal: {
    stripFileExtension,
    stripWebsitePrefix,
    stripRequestInfo,
    extractReleaseGroup,
    extractYear,
    extractSeasonEpisode,
    extractQuality,
  },
};
