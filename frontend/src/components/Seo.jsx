import { useEffect } from 'react';

const DEFAULT_TITLE = 'StreamBridge | IPTV for Stremio With One Private Addon';
const DEFAULT_DESCRIPTION = 'StreamBridge brings IPTV into Stremio with one private addon link, provider checks, metadata repair, and a simpler setup flow for IPTV and Stremio users.';
const DEFAULT_IMAGE = '/og-image.svg';
const SITE_NAME = 'StreamBridge';
const SITE_URL = (import.meta.env.VITE_SITE_URL || 'https://streambridge.thekush.dev').replace(/\/$/, '');

function upsertMeta(selector, attributes) {
  let element = document.head.querySelector(selector);

  if (!element) {
    element = document.createElement('meta');
    document.head.appendChild(element);
  }

  Object.entries(attributes).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      element.setAttribute(key, value);
    }
  });
}

function upsertLink(selector, attributes) {
  let element = document.head.querySelector(selector);

  if (!element) {
    element = document.createElement('link');
    document.head.appendChild(element);
  }

  Object.entries(attributes).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      element.setAttribute(key, value);
    }
  });
}

function getAbsoluteUrl(pathOrUrl = '/') {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }

  const normalizedPath = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${SITE_URL}${normalizedPath}`;
}

export default function Seo({
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  path = '/',
  image = DEFAULT_IMAGE,
  robots = 'index, follow',
  type = 'website',
  jsonLd,
}) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;

    const canonicalUrl = getAbsoluteUrl(path);
    const imageUrl = getAbsoluteUrl(image);

    upsertMeta('meta[name="description"]', { name: 'description', content: description });
    upsertMeta('meta[name="robots"]', { name: 'robots', content: robots });
    upsertMeta('meta[property="og:type"]', { property: 'og:type', content: type });
    upsertMeta('meta[property="og:title"]', { property: 'og:title', content: title });
    upsertMeta('meta[property="og:description"]', { property: 'og:description', content: description });
    upsertMeta('meta[property="og:url"]', { property: 'og:url', content: canonicalUrl });
    upsertMeta('meta[property="og:site_name"]', { property: 'og:site_name', content: SITE_NAME });
    upsertMeta('meta[property="og:image"]', { property: 'og:image', content: imageUrl });
    upsertMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' });
    upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: title });
    upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: description });
    upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: imageUrl });
    upsertLink('link[rel="canonical"]', { rel: 'canonical', href: canonicalUrl });

    let schemaTag;
    if (jsonLd) {
      schemaTag = document.createElement('script');
      schemaTag.type = 'application/ld+json';
      schemaTag.setAttribute('data-seo-schema', 'true');
      schemaTag.textContent = JSON.stringify(jsonLd);
      document.head.appendChild(schemaTag);
    }

    return () => {
      document.title = previousTitle;

      if (schemaTag) {
        schemaTag.remove();
      }
    };
  }, [description, image, jsonLd, path, robots, title, type]);

  return null;
}

export { SITE_URL };
