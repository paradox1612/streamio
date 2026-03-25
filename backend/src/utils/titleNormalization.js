const TITLE_NOISE_PATTERNS = [
  /\b(arabic|hindi|dubbed|multi|english|french|german|spanish|italian|turkish|persian|urdu)\b/gi,
  /\b(hd|fhd|uhd|4k|1080p|720p|480p|bluray|blu-ray|webrip|web-dl|hdtv|dvdrip|xvid|x264|x265|hevc|avc)\b/gi,
  /\b(s\d{2}e\d{2}|season\s*\d+|episode\s*\d+)\b/gi,
  /[\[\](){}|_]/g,
];

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

module.exports = {
  cleanTitle,
  normalizeTitle,
};
