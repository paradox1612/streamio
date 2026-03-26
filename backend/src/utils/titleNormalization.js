const CONTENT_LANGUAGES = [
  'arabic',
  'bangla',
  'bengali',
  'english',
  'french',
  'german',
  'hindi',
  'italian',
  'kannada',
  'malayalam',
  'persian',
  'punjabi',
  'spanish',
  'tamil',
  'telugu',
  'turkish',
  'urdu',
];

const QUALITY_TAG_PATTERNS = [
  /\b(4k|2160p|1080p|720p|480p|hd|fhd|uhd)\b/gi,
  /\b(bluray|blu[- ]ray|brrip|bdrip|webrip|web[- ]dl|webdl|hdtv|dvdrip|remux|cam|hdcam|telesync|ts)\b/gi,
  /\b(x264|x265|h264|h265|hevc|avc|hdr|hdr10|dv|dolby[ -]vision|imax)\b/gi,
];

const METADATA_SINGLE_TOKEN_SET = new Set([
  'arabic',
  'bangla',
  'bengali',
  'cam',
  'dc',
  'directors',
  'dubbed',
  'dual',
  'dv',
  'english',
  'eng',
  'extended',
  'fanedit',
  'fhd',
  'french',
  'german',
  'h264',
  'h265',
  'hdr',
  'hdr10',
  'hd',
  'hdcam',
  'hevc',
  'hindi',
  'imax',
  'italian',
  'kannada',
  'malayalam',
  'multi',
  'persian',
  'proper',
  'punjabi',
  'ray',
  'remastered',
  'remux',
  'spanish',
  'special',
  'tamil',
  'telugu',
  'theatrical',
  'telesync',
  'ts',
  'turkish',
  'uhd',
  'uncut',
  'unrated',
  'urdu',
  'vision',
  'web',
  'webdl',
  'webrip',
  'x264',
  'x265',
  '1080p',
  '2160p',
  '4k',
  '480p',
  '720p',
]);

const METADATA_PHRASE_SET = new Set([
  'blu ray',
  'dolby vision',
  'directors cut',
  'dual audio',
  'fan edit',
  'web dl',
]);

const MOVIE_TITLE_WITH_YEAR_REGEXES = [
  /^(?<title>.+?)[-_. ]+[\(\[]?(?<year>(?:18|19|20)\d{2})[\)\]](?:[-_. ].*)?$/i,
  /^(?<title>.+?)[-_. ]+(?<year>(?:18|19|20)\d{2})(?:[-_. ].*)?$/i,
];

const SERIES_SEASON_EPISODE_REGEXES = [
  /^(?<title>.+?)(?:[-_. ]+S(?<season>\d{1,4})(?:E(?<episode>\d{1,4}))(?:[-_. ]?E?\d{1,4})*)(?:[-_. ]|$)/i,
  /^(?<title>.+?)(?:[-_. ]+(?<season>\d{1,4})x(?<episode>\d{1,4})(?:x\d{1,4})*)(?:[-_. ]|$)/i,
  /^(?<title>.+?)(?:[-_. ]+(?:season|series|saison|stagione)[-_. ]?(?<season>\d{1,4}))(?:[-_. ]|$)/i,
];

const TITLE_NOISE_PATTERNS = [
  /\b(arabic|hindi|tamil|telugu|malayalam|kannada|bangla|bengali|punjabi|dubbed|multi|english|eng|french|german|spanish|italian|turkish|persian|urdu)\b/gi,
  /\b(hd|fhd|uhd|4k|1080p|720p|480p|bluray|blu-ray|webrip|web-dl|hdtv|dvdrip|xvid|x264|x265|hevc|avc)\b/gi,
  /\b(s\d{2}e\d{2}|season\s*\d+|episode\s*\d+)\b/gi,
  /[\[\](){}|_]/g,
];

function uniqueNormalized(values) {
  return Array.from(new Set(values.filter(Boolean).map((value) => String(value).trim().toLowerCase()))).sort();
}

function cleanTitle(rawTitle = '') {
  let title = String(rawTitle);
  for (const pattern of TITLE_NOISE_PATTERNS) {
    title = title.replace(pattern, ' ');
  }
  return title.replace(/\s{2,}/g, ' ').trim();
}

function normalizeTitle(rawTitle = '') {
  return cleanTitle(rawTitle)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function extractContentLanguages(rawTitle = '') {
  const title = String(rawTitle).toLowerCase();
  const found = new Set();

  const aliases = {
    bangla: /\b(bangla|bengali)\b/,
    english: /\b(english|eng)\b/,
  };

  for (const language of CONTENT_LANGUAGES) {
    const pattern = aliases[language] || new RegExp(`\\b${language}\\b`);
    if (pattern.test(title)) {
      found.add(language === 'bengali' ? 'bangla' : language);
    }
  }

  return Array.from(found);
}

function extractQualityTags(rawTitle = '') {
  const found = [];
  const title = String(rawTitle)
    .toLowerCase()
    .replace(/[\[\](){}|_.]+/g, ' ')
    .replace(/\s+/g, ' ');

  for (const pattern of QUALITY_TAG_PATTERNS) {
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
    for (const match of title.matchAll(new RegExp(pattern.source, flags))) {
      found.push(
        match[1]
          .replace(/blu[ -]?ray/g, 'blu-ray')
          .replace(/web[ -]?dl/g, 'web-dl')
          .replace(/dolby[ -]?vision/g, 'dolby vision')
      );
    }
  }

  return uniqueNormalized(found);
}

function isMetadataSegment(segment = '') {
  const text = String(segment).trim();
  if (!text) return false;

  if (extractContentLanguages(text).length > 0) return true;
  if (extractQualityTags(text).length > 0) return true;
  if (/\b(dubbed|multi|dual audio|proper|extended|uncut|directors cut|dc)\b/i.test(text)) return true;

  const normalized = normalizeTitle(text);
  if (!normalized) return false;
  if (/^(19\d{2}|20\d{2})$/.test(normalized)) return true;

  return false;
}

function splitTrailingMetadata(rawTitle = '') {
  let working = String(rawTitle || '').trim();
  const metadata = [];
  const trailingGroup = /\s*[\(\[\{]([^()[\]{}]+)[\)\]\}]\s*$/;

  while (true) {
    const match = trailingGroup.exec(working);
    if (!match) break;
    const segment = match[1].trim();
    if (!isMetadataSegment(segment)) break;
    metadata.unshift(segment);
    working = working.slice(0, working.length - match[0].length).trim();
  }

  return { title: working, metadata };
}

function tokenizeReleaseTitle(rawTitle = '') {
  return String(rawTitle || '')
    .replace(/[\[\](){}]/g, ' ')
    .replace(/[._|]+/g, ' ')
    .replace(/\s*-\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

function normalizeMetadataToken(token = '') {
  return String(token || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function isMetadataToken(token = '') {
  const normalized = normalizeMetadataToken(token);
  if (!normalized) return false;
  if (/^(19\d{2}|20\d{2})$/.test(normalized)) return true;
  return METADATA_SINGLE_TOKEN_SET.has(normalized);
}

function stripTokenizedMetadata(rawTitle = '') {
  const tokens = tokenizeReleaseTitle(rawTitle);
  if (tokens.length <= 1) return { title: String(rawTitle || '').trim(), metadata: [] };

  const metadata = [];
  let end = tokens.length;

  while (end > 1) {
    const single = tokens[end - 1];
    const pair = end >= 2 ? `${normalizeMetadataToken(tokens[end - 2])} ${normalizeMetadataToken(tokens[end - 1])}`.trim() : '';

    if (pair && METADATA_PHRASE_SET.has(pair)) {
      metadata.unshift(tokens[end - 2], tokens[end - 1]);
      end -= 2;
      continue;
    }

    if (isMetadataToken(single)) {
      metadata.unshift(single);
      end -= 1;
      continue;
    }

    break;
  }

  const title = tokens.slice(0, end).join(' ').trim();
  return {
    title: title || String(rawTitle || '').trim(),
    metadata,
  };
}

function extractYearHint(rawTitle = '') {
  const matches = String(rawTitle).match(/\b(19\d{2}|20\d{2})\b/g) || [];
  if (!matches.length) return null;

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const year = parseInt(matches[index], 10);
    if (year >= 1900 && year <= 2099) return year;
  }

  return null;
}

function parseReleaseTitle(rawTitle = '') {
  const sourceTitle = String(rawTitle || '').trim();
  const bracketParsed = splitTrailingMetadata(sourceTitle);
  const tokenParsed = stripTokenizedMetadata(sourceTitle);
  const { title, metadata } = tokenParsed.metadata.length > bracketParsed.metadata.length
    ? tokenParsed
    : bracketParsed;
  const canonicalTitle = title || sourceTitle;
  const metadataText = metadata.join(' ');

  return {
    canonicalTitle,
    canonicalNormalizedTitle: normalizeTitle(canonicalTitle),
    year: extractYearHint(metadataText || sourceTitle),
    languages: uniqueNormalized(extractContentLanguages(sourceTitle).map((language) => (
      language === 'bengali' ? 'bangla' : language
    ))),
    qualityTags: extractQualityTags(sourceTitle),
    metadataSegments: metadata,
  };
}

function parseMovieTitle(rawTitle = '') {
  const parsed = parseReleaseTitle(rawTitle);
  let canonicalTitle = parsed.canonicalTitle;
  let year = parsed.year;

  for (const regex of MOVIE_TITLE_WITH_YEAR_REGEXES) {
    const match = regex.exec(parsed.canonicalTitle);
    if (!match) continue;
    canonicalTitle = match.groups?.title?.trim() || canonicalTitle;
    year = year || parseInt(match.groups?.year, 10) || null;
    break;
  }

  return {
    ...parsed,
    canonicalTitle,
    canonicalNormalizedTitle: normalizeTitle(canonicalTitle),
    year,
    movieTitle: canonicalTitle,
  };
}

function parseSeriesTitle(rawTitle = '') {
  const parsed = parseReleaseTitle(rawTitle);
  let canonicalTitle = parsed.canonicalTitle;
  let seasonNumber = null;
  let episodeNumbers = [];

  for (const regex of SERIES_SEASON_EPISODE_REGEXES) {
    const match = regex.exec(parsed.canonicalTitle);
    if (!match) continue;
    canonicalTitle = match.groups?.title?.trim() || canonicalTitle;
    seasonNumber = match.groups?.season ? parseInt(match.groups.season, 10) : null;
    episodeNumbers = match.groups?.episode
      ? match.groups.episode.split(',').map((value) => parseInt(value, 10)).filter(Number.isFinite)
      : [];

    if (!episodeNumbers.length && match.indices?.groups?.episode) {
      episodeNumbers = [];
    }
    break;
  }

  return {
    ...parsed,
    canonicalTitle,
    canonicalNormalizedTitle: normalizeTitle(canonicalTitle),
    seriesTitle: canonicalTitle,
    seasonNumber,
    episodeNumbers,
  };
}

module.exports = {
  CONTENT_LANGUAGES,
  cleanTitle,
  extractContentLanguages,
  extractQualityTags,
  normalizeTitle,
  parseMovieTitle,
  parseReleaseTitle,
  parseSeriesTitle,
};
