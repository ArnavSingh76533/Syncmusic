import { TargetState } from "./types"

// The host's real playhead is the room clock. Loading time must never be
// interpreted as time the host has already watched.
export function playbackCorrection({
  target,
  actual,
  duration,
  serverOffset,
  host,
  appliedRevision,
  hidden,
  buffering,
  now = Date.now() / 1000,
}: {
  target: TargetState
  actual: number
  duration: number
  serverOffset: number
  host: boolean
  appliedRevision: number | null
  hidden: boolean
  buffering: boolean
  now?: number
}): number | null {
  if (hidden || buffering || !Number.isFinite(actual)) return null
  if (host && appliedRevision === target.lastSync) return null
  const elapsed =
    host || target.paused
      ? 0
      : Math.max(0, now + serverOffset - target.lastSync)
  const expected = Math.max(0, target.progress + elapsed * target.playbackRate)
  const bounded = duration > 0 ? Math.min(expected, duration) : expected
  return Math.abs(actual - bounded) > (target.paused || host ? 0.2 : 3)
    ? bounded
    : null
}

export interface PlaybackProvider {
  playVideo?: () => void
  play?: () => Promise<void> | void
  getPlayerState?: () => number
  paused?: boolean
  ended?: boolean
}

// Use the provider's own playback command, as the original player did.
// YouTube's public API is playVideo; a generic play property is not its API.
export function resumeProvider(
  provider: PlaybackProvider | null | undefined,
  blocked: () => void
) {
  if (!provider || provider.ended) return
  try {
    if (typeof provider.playVideo === "function") provider.playVideo()
    else provider.play?.()?.catch(blocked)
  } catch {
    blocked()
  }
}

export function providerIsPlaying(
  provider: PlaybackProvider | null | undefined
) {
  if (!provider) return false
  if (typeof provider.getPlayerState === "function")
    return provider.getPlayerState() === 1
  return provider.paused === false && !provider.ended
}

// A hide event must not send another play command to an already playing iframe.
// Refresh room state on return without issuing provider playback commands.
export function bindPlaybackLifecycle(
  page: EventTarget & { visibilityState: string },
  windowEvents: EventTarget,
  callbacks: {
    refresh: () => void
  }
) {
  const recover = () => {
    if (page.visibilityState !== "visible") return
    callbacks.refresh()
  }
  page.addEventListener("visibilitychange", recover)
  windowEvents.addEventListener("pageshow", recover)
  windowEvents.addEventListener("online", recover)
  return () => {
    page.removeEventListener("visibilitychange", recover)
    windowEvents.removeEventListener("pageshow", recover)
    windowEvents.removeEventListener("online", recover)
  }
}
