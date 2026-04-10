export const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}

export const isIOS = () => {
  if (typeof window === 'undefined') return false
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export const isAndroid = () => {
  if (typeof window === 'undefined') return false
  return /Android/i.test(navigator.userAgent)
}

export const isBrowserUnfriendly = (url: string | null) => {
  if (!url) return false
  const lowerUrl = url.toLowerCase()
  // Browser doesn't support .ts (IPTV standard) or .mkv well
  return lowerUrl.endsWith('.ts') || lowerUrl.endsWith('.mkv') || lowerUrl.includes('/live/')
}
