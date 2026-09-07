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
} from "lucide-react"
import { TypedSocket, playItemFromPlaylist } from "../../lib/socket"
import { MediaOption, RoomState, Subtitle, TargetState } from "../../lib/types"
import { getTargetTime, isSync } from "../../lib/utils"
import {
  mediaArtwork,
  mediaProvider,
  mediaTitle,
  isImageSource,
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
  const [theater, setTheater] = useState(false)
  const player = useRef<ReactPlayer>(null)
  const container = useRef<HTMLDivElement>(null)
  const seeking = useRef(false)
  const setSeeking = useCallback((value: boolean) => {
    seeking.current = value
  }, [])
  const delta = useRef<number | null>(null)
  const reportedAt = useRef(0)
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
    setBuffering(!!currentSrc.src && !imageSource)
    setError(null)
  }, [currentSrc.src, imageSource, reload])

  useEffect(() => {
    if (!ready || !player.current || seeking.current || imageSource) return
    const clock = target.lastSync - (delta.current || 0)
    const actual = player.current.getCurrentTime()
    if (
      Number.isFinite(actual) &&
      !isSync(
        actual,
        target.progress,
        clock,
        target.paused,
        target.playbackRate
      )
    ) {
      const time = Math.max(
        0,
        getTargetTime(
          target.progress,
          clock,
          target.paused,
          target.playbackRate
        )
      )
      player.current.seekTo(
        duration > 0 ? Math.min(time, duration) : time,
        "seconds"
      )
    }
  }, [
    ready,
    progress,
    target.lastSync,
    target.progress,
    target.paused,
    target.playbackRate,
    duration,
    imageSource,
  ])

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

  const toggleFullscreen = async () => {
    try {
      if (theater) setTheater(false)
      else if (fullscreenHandle.active) await fullscreenHandle.exit()
      else await fullscreenHandle.enter()
    } catch {
      setTheater(true)
    } // iOS without element fullscreen still gets a full-window player.
  }

  const togglePip = async () => {
    const internal = player.current?.getInternalPlayer()
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
      } catch {
        setNotice("Picture-in-picture isn’t available for this video yet.")
      }
      return
    }
    // YouTube embeds do not support ReactPlayer's native PiP prop.
    const popup = window.open(
      `/embed/${encodeURIComponent(roomId)}`,
      "syncmusic-mini",
      "width=640,height=400,resizable=yes"
    )
    if (popup) popup.focus()
    else setNotice("Allow pop-ups to open the mini player.")
  }

  const resumeAudio = () => {
    setMuted(false)
    setAutoplayBlocked(false)
    const internal = player.current?.getInternalPlayer()
    if (!targetRef.current.paused && internal) {
      if (typeof internal.play === "function")
        internal.play()?.catch?.(() => setAutoplayBlocked(true))
      else if (typeof internal.playVideo === "function") internal.playVideo()
    }
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
      className={`player-shell ${fullHeight ? "player-embed" : ""}`}
      ref={container}
    >
      <FullScreenContainer
        handle={fullscreenHandle}
        className={`player-stage ${fullscreen ? "player-expanded" : ""} ${
          theater ? "player-theater" : ""
        } ${musicMode ? "player-music" : ""}`}
      >
        <div className='player-media'>
          {imageSource ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className='welcome-image'
              src={currentSrc.src}
              alt='Room welcome screen'
              onError={() =>
                setError(
                  "The welcome image couldn’t load. Paste a media link below to start listening."
                )
              }
            />
          ) : currentSrc.src ? (
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
              playsinline
              config={{
                youtube: {
                  playerVars: {
                    disablekb: 1,
                    origin:
                      typeof window !== "undefined"
                        ? window.location.origin
                        : undefined,
                    rel: 0,
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
                setBuffering(false)
                setError(null)
                socket.emit("fetch")
              }}
              onPlay={() => {
                setBuffering(false)
                setAutoplayBlocked(false)
                const internal = player.current?.getInternalPlayer()
                if (targetRef.current.paused) {
                  internal?.pause?.()
                  internal?.pauseVideo?.()
                }
              }}
              onPause={() => {
                // Keep local provider pauses from silently drifting away from the room.
                if (targetRef.current.paused || seeking.current) return
                const internal = player.current?.getInternalPlayer()
                if (typeof internal?.play === "function")
                  internal.play()?.catch?.(() => setAutoplayBlocked(true))
                else internal?.playVideo?.()
              }}
              onBuffer={() => setBuffering(true)}
              onBufferEnd={() => setBuffering(false)}
              onEnded={() => {
                if (ownerRef.current) socket.emit("playEnded")
              }}
              onError={onPlaybackError}
              onProgress={({ playedSeconds }) => {
                if (!Number.isFinite(playedSeconds) || seeking.current) return
                setReady(true)
                setProgress(playedSeconds)
                if (socket.connected && Date.now() - reportedAt.current > 900) {
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
        {(musicMode || !currentSrc.src) && (
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
                {currentSrc.src ? "JUST YOU & THE MUSIC" : "READY WHEN YOU ARE"}
              </span>
              <h2>
                {currentSrc.src ? title : "A little closer, through music."}
              </h2>
              <p>
                {currentSrc.src
                  ? mediaProvider(currentSrc.src)
                  : "Add a track. Invite your people. Press play."}
              </p>
            </div>
          </div>
        )}
        <Controls
          roomId={roomId}
          playing={target.playing}
          playlist={target.playlist}
          currentSrc={currentSrc}
          setCurrentSrc={setCurrentSrc}
          currentSub={currentSub}
          setCurrentSub={setCurrentSub}
          paused={target.paused}
          setPaused={(value) => {
            if (canControl) {
              if (!value) resumeAudio()
              socket.emit("setPaused", value)
            }
          }}
          volume={volume}
          setVolume={setVolume}
          muted={muted}
          setMuted={setMuted}
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
          pipEnabled={pip}
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
