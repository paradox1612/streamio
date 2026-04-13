import { isAndroid } from './device'

export type MobilePlayer = 'vlc' | 'infuse' | 'nplayer' | 'mxplayer' | 'iina'

export const getMobilePlayerUrl = (player: MobilePlayer, videoUrl: string, title?: string) => {
  const encodedUrl = encodeURIComponent(videoUrl)

  switch (player) {
    case 'vlc':
      if (isAndroid()) {
        return `intent:${videoUrl}#Intent;package=org.videolan.vlc;type=video/*;end`
      }
      return `vlc://${videoUrl}`
    
    case 'infuse':
      return `infuse://x-callback-url/play?url=${encodedUrl}`
    
    case 'nplayer':
      return videoUrl.replace(/^http/, 'nplayer-http')
    
    case 'mxplayer':
      if (isAndroid()) {
        return `intent:${videoUrl}#Intent;package=com.mxtech.videoplayer.ad;S.title=${encodeURIComponent(title || 'Stream')};end`
      }
      return null // Not well supported on iOS via deep link
    
    case 'iina':
      return `iina://weblink?url=${encodedUrl}`
    
    default:
      return videoUrl
  }
}

export const getAvailablePlayers = (): { id: MobilePlayer; name: string; platform: 'ios' | 'android' | 'all' }[] => {
  return [
    { id: 'vlc', name: 'VLC', platform: 'all' },
    { id: 'infuse', name: 'Infuse', platform: 'ios' },
    { id: 'nplayer', name: 'nPlayer', platform: 'all' },
    { id: 'mxplayer', name: 'MX Player', platform: 'android' },
    { id: 'iina', name: 'IINA', platform: 'ios' }, // iOS/Mac
  ]
}
