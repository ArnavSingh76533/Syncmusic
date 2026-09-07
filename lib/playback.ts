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

// Keep the existing media element alive. Visibility changes are not pause
// commands, and foreground recovery must use the latest shared play intent.
export function bindPlaybackLifecycle(
  page: EventTarget & { visibilityState: string },
  windowEvents: EventTarget,
  callbacks: {
    refresh: () => void
    resume: () => void
    shouldPlay: () => boolean
  }
) {
  const recover = () => {
    if (page.visibilityState === "visible") callbacks.refresh()
    if (callbacks.shouldPlay()) callbacks.resume()
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
