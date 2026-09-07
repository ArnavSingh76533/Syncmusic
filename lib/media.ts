import { MediaElement, Playlist } from "./types"

export function youtubeId(source: string): string | null {
  try {
    const url = new URL(source)
    const host = url.hostname.toLowerCase()
    let id: string | null = null
    if (host === "youtu.be" || host === "www.youtu.be")
      id = url.pathname.split("/")[1]
    if (
      host === "youtube.com" ||
      host.endsWith(".youtube.com") ||
      host === "youtube-nocookie.com" ||
      host.endsWith(".youtube-nocookie.com")
    ) {
      id =
        url.searchParams.get("v") ||
        (/^\/(embed|shorts|live)\//.test(url.pathname)
          ? url.pathname.split("/")[2]
          : null)
    }
    return id && /^[\w-]{11}$/.test(id) ? id : null
  } catch {
    return null
  }
}

export function mediaArtwork(item: MediaElement): string | null {
  if (item.thumbnail) return item.thumbnail
  const id = youtubeId(item.src?.[0]?.src || "")
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null
}

export function mediaTitle(item: MediaElement): string {
  if (item.title?.trim()) return item.title
  const source = item.src?.[0]?.src
  if (!source) return "Your next favorite starts here"
  if (youtubeId(source)) return "YouTube stream"
  try {
    const url = new URL(source)
    const filename = decodeURIComponent(url.pathname.split("/").pop() || "")
    return filename && /\.[a-z0-9]{2,5}$/i.test(filename)
      ? filename.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ")
      : "Live stream"
  } catch {
    return "Untitled track"
  }
}

export function mediaProvider(source: string): string {
  if (youtubeId(source)) return "YouTube"
  try {
    return new URL(source).hostname.replace(/^www\./, "")
  } catch {
    return "Shared playback"
  }
}

export function isImageSource(source: string): boolean {
  return /\.(png|jpe?g|gif|webp|avif|svg)(?:[?#]|$)/i.test(source)
}

// Keep the playing item selected, including when another item crosses its index.
export function reorderPlaylist(
  playlist: Playlist,
  from: number,
  to: number
): Playlist {
  if (
    from < 0 ||
    to < 0 ||
    from >= playlist.items.length ||
    to >= playlist.items.length
  )
    return playlist
  const items = [...playlist.items]
  const [moved] = items.splice(from, 1)
  items.splice(to, 0, moved)
  let currentIndex = playlist.currentIndex
  if (currentIndex === from) currentIndex = to
  else if (from < currentIndex && to >= currentIndex) currentIndex--
  else if (from > currentIndex && to <= currentIndex) currentIndex++
  return { items, currentIndex }
}
