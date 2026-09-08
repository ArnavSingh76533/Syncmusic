"use client"
import React, { useCallback, useEffect, useRef, useState } from "react"
import ReactPlayer from "react-player"
import Image from "next/image"
import {
  FullScreen,
  FullScreenProps,
  useFullScreenHandle,
} from "react-full-screen"
import {
  AlertCircle,
  AudioLines,
  Headphones,
  Loader2,
  Radio,
  Volume2,
  VolumeX,
  Play,
  Pause,
  ChevronUp,
  X,
  Maximize2,
} from "lucide-react"
import { TypedSocket, playItemFromPlaylist } from "../../lib/socket"
import { MediaOption, RoomState, Subtitle, TargetState } from "../../lib/types"
import {
  bindPlaybackLifecycle,
  playbackCorrection,
  resumeProvider,
  providerIsPlaying,
} from "../../lib/playback"
import {
  mediaArtwork,
  mediaProvider,
  mediaTitle,
  isImageSource,
  youtubeId,
} from "../../lib/media"
import { getDefaultImg } from "../../lib/env"
import { Button } from "../ui/button"
import Controls from "./Controls"

const FullScreenContainer = FullScreen as React.FC<
  React.PropsWithChildren<FullScreenProps>
>
const emptyState: TargetState = {
  playing: { src: [], sub: [] },
  playlist: { items: [], currentIndex: -1 },
  paused: true,
  progress: 0,
  playbackRate: 1,
  loop: false,
  lastSync: 0,
}

export default function Player({
  roomId,
  socket,
  fullHeight = false,
}: {
  roomId: string
  socket: TypedSocket
  fullHeight?: boolean
}) {
  const [target, setTarget] = useState<TargetState>(emptyState)
  const targetRef = useRef(target)
  const [currentSrc, setCurrentSrc] = useState<MediaOption>({
    src: "",
    resolution: "",
  })
  const [currentSub, setCurrentSub] = useState<Subtitle>({
    src: "",
    lang: "Off",
  })
  const [owner, setOwner] = useState(false)
  const ownerRef = useRef(false)
  const [connected, setConnected] = useState(socket.connected)
  const [musicMode, setMusicMode] = useState(false)
  const [muted, setMuted] = useState(true)
  const [volume, setVolume] = useState(1)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [ready, setReady] = useState(false)
  const [buffering, setBuffering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState("")
  const [autoplayBlocked, setAutoplayBlocked] = useState(false)
  const [reload, setReload] = useState(0)
  const [pip, setPip] = useState(false)
  const [docked, setDocked] = useState(false)
  const [actuallyPlaying, setActuallyPlaying] = useState(false)
  const [theater, setTheater] = useState(false)
  const [showMini, setShowMini] = useState(false)
  const player = useRef<ReactPlayer>(null)
  const container = useRef<HTMLDivElement>(null)
  const seeking = useRef(false)
  const setSeeking = useCallback((value: boolean) => {
    seeking.current = value
  }, [])
  const delta = useRef<number | null>(null)
  const reportedAt = useRef(0)
  const anchoredAt = useRef(0)
  const appliedRevision = useRef<number | null>(null)
  const blockedCleanup = useRef<(() => void) | null>(null)
  const recovery = useRef<AbortController | null>(null)
  const triedFallback = useRef(false)
  const fullscreenHandle = useFullScreenHandle()
  const fullscreen = fullscreenHandle.active || theater
  const canonicalSrc = target.playing.src?.[0]?.src || ""
  const imageSource =
    isImageSource(currentSrc.src) ||
    (!!getDefaultImg() && currentSrc.src === getDefaultImg())
  const artwork = mediaArtwork(target.playing)
  const title = mediaTitle(target.playing)
  const canControl = owner && connected
  const youtubeSource = !!youtubeId(currentSrc.src)
  const ownsMediaSession = !!currentSrc.src && !imageSource && !youtubeSource
  const interrupted =
    !target.paused &&
    (autoplayBlocked || (!actuallyPlaying && !buffering && ready))

  useEffect(() => {
    const onConnect = () => {
      setConnected(true)
      delta.current = null
      socket.emit("fetch")
    }
    const onDisconnect = () => setConnected(false)
    const onUpdate = (room: RoomState) => {
      if (delta.current === null)
        delta.current = (room.serverTime - Date.now()) / 1000
      ownerRef.current = room.ownerId === socket.id
      setOwner(ownerRef.current)
      setMusicMode(!!room.musicMode)
      targetRef.current = room.targetState
      setTarget((previous) =>
        JSON.stringify(previous) === JSON.stringify(room.targetState)
          ? previous
          : room.targetState
      )
    }
    socket.on("connect", onConnect)
    socket.on("disconnect", onDisconnect)
    socket.on("update", onUpdate)
    socket.emit("fetch")
    return () => {
      socket.off("connect", onConnect)
      socket.off("disconnect", onDisconnect)
      socket.off("update", onUpdate)
    }
  }, [socket])

  // Room state must load before media is ready (including an empty or image welcome screen).
  useEffect(() => {
    recovery.current?.abort()
    recovery.current = null
    triedFallback.current = false
    appliedRevision.current = null
    setCurrentSrc({
      src: canonicalSrc,
      resolution: targetRef.current.playing.src[0]?.resolution || "",
    })
    setCurrentSub({ src: "", lang: "Off" })
    setDuration(0)
    setProgress(0)
    setError(null)
    setNotice("")
    setPip(false)
    return () => {
      recovery.current?.abort()
      recovery.current = null
    }
  }, [canonicalSrc])

  useEffect(() => {
    setReady(false)
    setActuallyPlaying(false)
    setBuffering(!!currentSrc.src && !imageSource)
    setError(null)
  }, [currentSrc.src, imageSource, reload])

  useEffect(() => {
    if (!ready || !player.current || seeking.current || imageSource) return
    const time = playbackCorrection({
      target,
      actual: player.current.getCurrentTime(),
      duration,
      serverOffset: delta.current || 0,
      host: owner,
      appliedRevision: appliedRevision.current,
      hidden: document.visibilityState === "hidden",
      buffering,
    })
    if (document.visibilityState === "hidden" || buffering) return
    appliedRevision.current = target.lastSync
    if (time !== null) player.current.seekTo(time, "seconds")
  }, [ready, progress, target, duration, imageSource, owner, buffering])

  const resumePlayback = useCallback(() => {
    if (targetRef.current.paused) return
    // A pointer gesture interrupted by an app switch must not disable recovery.
    if (seeking.current && document.visibilityState === "visible") return
    resumeProvider(player.current?.getInternalPlayer(), () =>
      setAutoplayBlocked(true)
    )
  }, [])

  useEffect(
    () =>
      bindPlaybackLifecycle(document, window, {
        shouldPlay: () => !targetRef.current.paused,
        resume: () => {
          if (!providerIsPlaying(player.current?.getInternalPlayer()))
            resumePlayback()
        },
        refresh: () => {
          if (socket.connected) socket.emit("fetch")
          else socket.connect()
        },
      }),
    [socket, resumePlayback]
  )

  useEffect(() => {
    if (!container.current || typeof IntersectionObserver === "undefined")
      return
    const observer = new IntersectionObserver(([entry]) =>
      setShowMini(!entry.isIntersecting)
    )
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => () => blockedCleanup.current?.(), [])

  // Native files belong to this document. YouTube owns its media session inside
  // its iframe; parent-page handlers must not replace that session.

  useEffect(() => {
    if (!("mediaSession" in navigator) || !ownsMediaSession || !ready) return
    if (!(player.current?.getInternalPlayer() instanceof HTMLMediaElement))
      return
    const session = navigator.mediaSession
    if (typeof MediaMetadata !== "undefined")
      session.metadata = new MediaMetadata({
        title,
        artist: "Syncmusic",
        album: `Room ${roomId}`,
        artwork: artwork ? [{ src: artwork }] : [],
      })
    const pause = (value: boolean) => {
      if (!ownerRef.current || !socket.connected) return
      targetRef.current = { ...targetRef.current, paused: value }
      socket.emit("setPaused", value)
      if (value) {
        const internal = player.current?.getInternalPlayer()
        internal?.pause?.()
        internal?.pauseVideo?.()
      } else resumePlayback()
    }
    const seek = (position: number) => {
      if (!ownerRef.current || !socket.connected) return
      const length = player.current?.getDuration() || 0
      if (!(length > 0)) return
      const time = Math.max(0, Math.min(length, position))
      socket.emit("seek", time)
      player.current?.seekTo(time, "seconds")
    }
    const actions: Partial<
      Record<MediaSessionAction, MediaSessionActionHandler>
    > = {
      play: () => pause(false),
      pause: () => pause(true),
      seekto: (details) => {
        if (details.seekTime !== undefined) seek(details.seekTime)
      },
      seekbackward: (details) =>
        seek(
          (player.current?.getCurrentTime() || 0) - (details.seekOffset || 10)
        ),
      seekforward: (details) =>
        seek(
          (player.current?.getCurrentTime() || 0) + (details.seekOffset || 10)
        ),
      previoustrack: () => {
        if (ownerRef.current && socket.connected)
          playItemFromPlaylist(
            socket,
            targetRef.current.playlist,
            targetRef.current.playlist.currentIndex - 1
          )
      },
      nexttrack: () => {
        if (ownerRef.current && socket.connected)
          playItemFromPlaylist(
            socket,
            targetRef.current.playlist,
            targetRef.current.playlist.currentIndex + 1
          )
      },
    }
    for (const [action, handler] of Object.entries(actions)) {
      try {
        session.setActionHandler(
          action as MediaSessionAction,
          owner ? handler : null
        )
      } catch {
        /* unsupported action */
      }
    }
    return () => {
      for (const action of Object.keys(actions)) {
        try {
          session.setActionHandler(action as MediaSessionAction, null)
        } catch {
          /* unsupported action */
        }
      }
      session.metadata = null
      session.playbackState = "none"
    }
  }, [
    canonicalSrc,
    title,
    artwork,
    roomId,
    ownsMediaSession,
    ready,
    socket,
    owner,
    resumePlayback,
  ])

  useEffect(() => {
    if (!("mediaSession" in navigator) || !ownsMediaSession || !ready) return
    if (!(player.current?.getInternalPlayer() instanceof HTMLMediaElement))
      return
    navigator.mediaSession.playbackState = actuallyPlaying
      ? "playing"
      : "paused"
    try {
      if (duration > 0)
        navigator.mediaSession.setPositionState?.({
          duration,
          playbackRate: target.playbackRate,
          position: Math.max(0, Math.min(duration, progress)),
        })
      else navigator.mediaSession.setPositionState?.()
    } catch {
      /* position reporting is optional */
    }
  }, [
    actuallyPlaying,
    target.playbackRate,
    progress,
    duration,
    canonicalSrc,
    ownsMediaSession,
    ready,
  ])

  const anchorPlayback = () => {
    const actual = player.current?.getCurrentTime()
    // A track update can arrive before ReactPlayer has loaded its new URL.
    if (
      !triedFallback.current &&
      !targetRef.current.playing.src.some(
        (source) => source.src === currentSrc.src
      )
    )
      return
    if (
      !ownerRef.current ||
      !socket.connected ||
      targetRef.current.paused ||
      seeking.current ||
      !Number.isFinite(actual)
    )
      return
    anchoredAt.current = Date.now()
    socket.emit(
      "syncPlayback",
      {
        src: canonicalSrc,
        lastSync: targetRef.current.lastSync,
        progress: actual!,
      },
      (revision) => {
        appliedRevision.current = revision
      }
    )
  }

  useEffect(() => {
    if (!theater) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTheater(false)
    }
    document.addEventListener("keydown", escape)
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener("keydown", escape)
    }
  }, [theater])

  // Restore the original landscape behavior, including Back/Escape cleanup.
  useEffect(() => {
    if (!fullscreenHandle.active) return
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (mode: string) => Promise<void>
    }
    let cancelled = false
    let locked = false
    if (orientation?.lock) {
      void orientation
        .lock("landscape")
        .then(() => {
          if (cancelled) orientation.unlock()
          else locked = true
        })
        .catch(() => {
          /* platform doesn't support orientation locking */
        })
    }
    return () => {
      cancelled = true
      if (locked) orientation.unlock()
    }
  }, [fullscreenHandle.active])

  const toggleFullscreen = async () => {
    setDocked(false)
    try {
      if (theater) setTheater(false)
      else if (fullscreenHandle.active) await fullscreenHandle.exit()
      else await fullscreenHandle.enter()
    } catch {
      setTheater(true)
    }
  }

  const togglePip = async () => {
    const internal = player.current?.getInternalPlayer()
    if (docked) {
      setDocked(false)
      return
    }
    if (document.pictureInPictureElement) {
      try {
        await document.exitPictureInPicture()
        setPip(false)
      } catch {
        setNotice("Couldn’t close the floating player. Use its close button.")
      }
      return
    }
    if (
      internal instanceof HTMLVideoElement &&
      document.pictureInPictureEnabled &&
      !internal.disablePictureInPicture
    ) {
      try {
        await internal.requestPictureInPicture()
        setPip(true)
        return
      } catch {
        /* Keep the same player in an in-page mini view instead. */
      }
    }
    if (fullscreenHandle.active) await fullscreenHandle.exit()
    setTheater(false)
    setDocked(true)
  }

  const resumeAudio = () => {
    setMuted(false)
    setAutoplayBlocked(false)
    // Apply audio within the gesture, before React's asynchronous render.
    const internal = player.current?.getInternalPlayer()
    if (internal instanceof HTMLMediaElement) internal.muted = false
    else internal?.unMute?.()
    resumePlayback()
  }

  const changePaused = (value: boolean) => {
    if (!canControl) return
    targetRef.current = { ...targetRef.current, paused: value }
    socket.emit("setPaused", value)
    if (!value) resumeAudio()
  }

  const onPlaybackError = async (event: unknown) => {
    setBuffering(false)
    // Providers also emit numbers and strings; never use `in` on those values.
    const canRecover =
      typeof event === "object" &&
      event !== null &&
      "type" in event &&
      event.type === "error"
    if (!canRecover || triedFallback.current) {
      setError("This source couldn’t be played. Retry or choose another link.")
      return
    }
    triedFallback.current = true
    const controller = new AbortController()
    recovery.current?.abort()
    recovery.current = controller
    const timeout = setTimeout(() => controller.abort(), 20000)
    setNotice("Trying an alternate stream…")
    try {
      const response = await fetch("/api/source", {
        method: "POST",
        body: canonicalSrc,
        signal: controller.signal,
      })
      if (!response.ok) throw new Error("Source unavailable")
      const data = await response.json()
      const source =
        typeof data.stdout === "string"
          ? data.stdout
              .split("\n")
              .find((value: string) => /^https?:\/\//.test(value))
          : undefined
      if (data.error || !source) throw new Error("No playable stream")
      if (recovery.current === controller && !controller.signal.aborted) {
        setCurrentSrc({ src: source, resolution: "" })
        setNotice("")
      }
    } catch {
      if (recovery.current === controller) {
        setError(
          "This source couldn’t be played. Retry or choose another link."
        )
        setNotice("")
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  return (
    <div
      className={`player-shell ${fullHeight ? "player-embed" : ""} ${
        docked ? "has-docked-player" : ""
      }`}
      ref={container}
    >
      {docked && <div className='player-dock-placeholder' aria-hidden='true' />}
      <FullScreenContainer
        handle={fullscreenHandle}
        className={`player-stage ${fullscreen ? "player-expanded" : ""} ${
          theater ? "player-theater" : ""
        } ${docked ? "player-docked" : ""} ${musicMode ? "player-music" : ""} ${
          imageSource || !currentSrc.src ? "player-welcome" : ""
        }`}
      >
        {docked && (
          <div className='player-dock-header'>
            <span>Mini player</span>
            <Button
              className='player-button'
              variant='ghost'
              size='icon'
              aria-label='Return to full player'
              onClick={() => {
                setDocked(false)
                container.current?.scrollIntoView({ block: "start" })
              }}
            >
              <Maximize2 />
            </Button>
            <Button
              className='player-button'
              variant='ghost'
              size='icon'
              aria-label='Close mini view and keep listening'
              onClick={() => setDocked(false)}
            >
              <X />
            </Button>
          </div>
        )}
        <div className='player-viewport'>
          <div className='player-media'>
            {!imageSource && currentSrc.src ? (
              <ReactPlayer
                key={reload}
                ref={player}
                width='100%'
                height='100%'
                style={{ visibility: musicMode ? "hidden" : "visible" }}
                url={currentSrc.src}
                playing={!target.paused}
                controls={false}
                playbackRate={target.playbackRate}
                volume={volume}
                muted={muted}
                // Preserve the original YouTube mobile playback mode.
                playsinline={!youtubeSource}
                config={{
                  youtube: {
                    playerVars: {
                      disablekb: 1,
                      origin:
                        typeof window !== "undefined"
                          ? window.location.origin
                          : undefined,
                      ...(target.playlist.currentIndex >=
                      target.playlist.items.length - 1
                        ? { rel: 1 }
                        : { rel: 0 }),
                    },
                  },
                  file: {
                    hlsVersion: "1.1.3",
                    dashVersion: "4.2.1",
                    flvVersion: "1.6.2",
                    attributes: {
                      crossOrigin: currentSub.src ? "anonymous" : undefined,
                    },
                    tracks: currentSub.src
                      ? [
                          {
                            kind: "subtitles",
                            src: currentSub.src,
                            srcLang: currentSub.lang,
                            label: currentSub.lang,
                            default: true,
                          },
                        ]
                      : [],
                  },
                }}
                onReady={() => {
                  setReady(true)
                  const length = player.current?.getDuration()
                  if (length && Number.isFinite(length)) setDuration(length)
                  setBuffering(false)
                  setError(null)
                  blockedCleanup.current?.()
                  const internal = player.current?.getInternalPlayer()
                  const blocked = () => {
                    setAutoplayBlocked(true)
                    setBuffering(false)
                  }
                  internal?.addEventListener?.("onAutoplayBlocked", blocked)
                  blockedCleanup.current = () =>
                    internal?.removeEventListener?.(
                      "onAutoplayBlocked",
                      blocked
                    )
                  socket.emit("fetch")
                }}
                onPlay={() => {
                  setActuallyPlaying(true)
                  setBuffering(false)
                  setAutoplayBlocked(false)
                  const internal = player.current?.getInternalPlayer()
                  if (targetRef.current.paused) {
                    internal?.pause?.()
                    internal?.pauseVideo?.()
                  } else anchorPlayback()
                }}
                onPause={() => {
                  setActuallyPlaying(false)
                  resumePlayback()
                }}
                onBuffer={() => setBuffering(true)}
                onBufferEnd={() => {
                  setBuffering(false)
                  anchorPlayback()
                }}
                onEnded={() => {
                  setActuallyPlaying(false)
                  if (ownerRef.current) socket.emit("playEnded")
                }}
                onError={onPlaybackError}
                onProgress={({ playedSeconds }) => {
                  if (!Number.isFinite(playedSeconds) || seeking.current) return
                  setReady(true)
                  setProgress(playedSeconds)
                  const length = player.current?.getDuration()
                  if (length && Number.isFinite(length) && length !== duration)
                    setDuration(length)
                  if (Date.now() - anchoredAt.current > 3000) anchorPlayback()
                  if (
                    socket.connected &&
                    Date.now() - reportedAt.current > 900
                  ) {
                    reportedAt.current = Date.now()
                    socket.emit("setProgress", playedSeconds)
                  }
                }}
                onDuration={(value) =>
                  setDuration(Number.isFinite(value) ? Math.max(0, value) : 0)
                }
                onEnablePIP={() => setPip(true)}
                onDisablePIP={() => setPip(false)}
              />
            ) : null}
          </div>
          {(musicMode || !currentSrc.src || imageSource) && (
            <div className='music-canvas'>
              <div className='music-artwork'>
                {artwork ? (
                  <Artwork src={artwork} />
                ) : (
                  <Headphones size={72} strokeWidth={1} />
                )}
                <span className='music-art-badge'>
                  <AudioLines size={18} />
                </span>
              </div>
              <div className='music-caption'>
                <span className='player-eyebrow'>
                  {currentSrc.src && !imageSource
                    ? "JUST YOU & THE MUSIC"
                    : "READY WHEN YOU ARE"}
                </span>
                <h2>
                  {currentSrc.src && !imageSource
                    ? title
                    : "A little closer, through music."}
                </h2>
                <p>
                  {currentSrc.src && !imageSource
                    ? mediaProvider(currentSrc.src)
                    : "Add a track. Invite your people. Press play."}
                </p>
              </div>
            </div>
          )}
        </div>
        <Controls
          roomId={roomId}
          playing={target.playing}
          playlist={target.playlist}
          currentSrc={currentSrc}
          setCurrentSrc={setCurrentSrc}
          currentSub={currentSub}
          setCurrentSub={setCurrentSub}
          paused={target.paused}
          interrupted={interrupted}
          resumePlayback={resumeAudio}
          setPaused={changePaused}
          volume={volume}
          setVolume={setVolume}
          muted={muted}
          setMuted={(value) => {
            if (value) setMuted(true)
            else resumeAudio()
          }}
          progress={progress}
          duration={duration}
          setProgress={(value) => {
            if (canControl && duration > 0) {
              const time = Math.max(0, Math.min(duration, value))
              player.current?.seekTo(time, "seconds")
              setProgress(time)
              socket.emit("seek", time)
            }
          }}
          playbackRate={target.playbackRate}
          setPlaybackRate={(value) => {
            if (canControl) socket.emit("setPlaybackRate", value)
          }}
          loop={target.loop}
          setLoop={(value) => {
            if (canControl) socket.emit("setLoop", value)
          }}
          fullscreen={fullscreen}
          toggleFullscreen={toggleFullscreen}
          playIndex={(index) => {
            if (canControl) playItemFromPlaylist(socket, target.playlist, index)
          }}
          setSeeking={setSeeking}
          playAgain={() => {
            if (canControl) socket.emit("playAgain")
          }}
          canControl={canControl}
          pipEnabled={pip || docked}
          togglePip={togglePip}
          musicMode={musicMode}
          setMusicMode={(value) => {
            if (canControl) socket.emit("setMusicMode", value)
          }}
          hasMedia={!!currentSrc.src && !imageSource}
        />
        <div className='player-status'>
          {!connected && (
            <span className='player-status-chip' role='status'>
              <Radio size={14} /> Reconnecting…
            </span>
          )}
          {buffering && !error && (
            <span className='player-status-chip' role='status'>
              <Loader2 size={14} className='spin' /> Buffering
            </span>
          )}
          {(muted || autoplayBlocked) && currentSrc.src && !imageSource && (
            <Button className='player-sound-prompt' onClick={resumeAudio}>
              <Volume2 />
              {autoplayBlocked ? "Tap to resume audio" : "Tap to enable sound"}
            </Button>
          )}
        </div>
        {error && (
          <div className='player-error' role='alert'>
            <AlertCircle size={25} />
            <strong>Let’s get the music back.</strong>
            <p>{error}</p>
            <Button
              className='player-retry'
              onClick={() => {
                recovery.current?.abort()
                recovery.current = null
                triedFallback.current = false
                setNotice("")
                setError(null)
                setCurrentSrc({ src: canonicalSrc, resolution: "" })
                setReload((value) => value + 1)
                socket.emit("fetch")
              }}
            >
              Retry playback
            </Button>
          </div>
        )}
        {notice && (
          <div className='player-notice' role='status'>
            {notice}
            <button aria-label='Dismiss message' onClick={() => setNotice("")}>
              ×
            </button>
          </div>
        )}
      </FullScreenContainer>
      {showMini &&
        !fullHeight &&
        !fullscreen &&
        !docked &&
        canonicalSrc &&
        !imageSource && (
          <div
            className='sticky-mini'
            role='region'
            aria-label='Quick playback controls'
          >
            <button
              className='mini-track'
              onClick={() =>
                container.current?.scrollIntoView({ block: "start" })
              }
              aria-label={`Back to player: ${title}`}
            >
              <span className='now-art'>
                {artwork ? <Artwork src={artwork} /> : <AudioLines />}
              </span>
              <span>
                <small>NOW PLAYING</small>
                <strong>{title}</strong>
              </span>
              <ChevronUp size={18} />
            </button>
            <Button
              className='player-button'
              variant='ghost'
              size='icon'
              aria-label={muted ? "Enable sound" : "Mute"}
              onClick={() => (muted ? resumeAudio() : setMuted(true))}
            >
              {muted ? <VolumeX /> : <Volume2 />}
            </Button>
            <Button
              className='player-button transport-play'
              size='icon'
              disabled={!canControl && !interrupted}
              aria-label={
                interrupted
                  ? "Resume playback"
                  : target.paused
                    ? "Play"
                    : "Pause"
              }
              onClick={() =>
                interrupted ? resumeAudio() : changePaused(!target.paused)
              }
            >
              {target.paused || interrupted ? (
                <Play fill='currentColor' />
              ) : (
                <Pause fill='currentColor' />
              )}
            </Button>
          </div>
        )}
      {!fullHeight && (
        <div className='now-playing'>
          <div className='now-art'>
            {artwork ? <Artwork src={artwork} /> : <AudioLines size={24} />}
          </div>
          <div className='now-copy'>
            <span className='room-eyebrow'>
              {imageSource ? "WELCOME TO YOUR ROOM" : "NOW PLAYING"}
            </span>
            <h2>{imageSource ? "Your soundtrack starts here" : title}</h2>
            <p>
              {imageSource
                ? "Paste a link below or discover something new."
                : mediaProvider(canonicalSrc)}
            </p>
          </div>
          <div className='now-role'>
            <Radio size={14} />
            <span>{owner ? "You’re the host" : "Host controls playback"}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function Artwork({ src }: { src: string }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])
  // eslint-disable-next-line @next/next/no-img-element
  return failed ? (
    <AudioLines size={30} />
  ) : (
    <Image
      src={src}
      alt=''
      width={320}
      height={320}
      unoptimized
      onError={() => setFailed(true)}
    />
  )
}
