import { CSSProperties, useEffect, useRef, useState } from "react"
import {
  AudioLines,
  ChevronDown,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  Repeat2,
  RotateCcw,
  Settings2,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from "lucide-react"
import { Button } from "../ui/button"
import { Switch } from "../ui/switch"
import { MediaElement, MediaOption, Playlist, Subtitle } from "../../lib/types"
import { secondsToTime } from "../../lib/utils"

interface Props {
  roomId: string
  playing: MediaElement
  playlist: Playlist
  currentSrc: MediaOption
  setCurrentSrc: (value: MediaOption) => void
  currentSub: Subtitle
  setCurrentSub: (value: Subtitle) => void
  paused: boolean
  setPaused: (value: boolean) => void
  muted: boolean
  setMuted: (value: boolean) => void
  volume: number
  setVolume: (value: number) => void
  progress: number
  duration: number
  setProgress: (value: number) => void
  playbackRate: number
  setPlaybackRate: (value: number) => void
  loop: boolean
  setLoop: (value: boolean) => void
  fullscreen: boolean
  toggleFullscreen: () => void
  playIndex: (index: number) => void
  setSeeking: (value: boolean) => void
  playAgain: () => void
  canControl: boolean
  pipEnabled: boolean
  togglePip: () => void
  musicMode: boolean
  setMusicMode: (value: boolean) => void
  hasMedia: boolean
}

export default function Controls(props: Props) {
  const {
    playing,
    playlist,
    paused,
    setPaused,
    muted,
    setMuted,
    volume,
    setVolume,
    progress,
    duration,
    setProgress,
    loop,
    setLoop,
    fullscreen,
    toggleFullscreen,
    playIndex,
    setSeeking,
    playAgain,
    canControl,
    pipEnabled,
    togglePip,
    musicMode,
    setMusicMode,
    hasMedia,
  } = props
  const [settings, setSettings] = useState(false)
  const [draft, setDraft] = useState<number | null>(null)
  const seekValue = useRef<number | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  const settingsButton = useRef<HTMLButtonElement>(null)
  const ended = hasMedia && duration > 0 && paused && progress >= duration - 0.5
  const shownProgress = Math.max(0, Math.min(duration || 0, draft ?? progress))
  useEffect(() => {
    if (!settings) return
    const dismiss = (event: PointerEvent) => {
      if (
        !panel.current?.contains(event.target as Node) &&
        !settingsButton.current?.contains(event.target as Node)
      )
        setSettings(false)
    }
    document.addEventListener("pointerdown", dismiss)
    return () => document.removeEventListener("pointerdown", dismiss)
  }, [settings])
  useEffect(() => {
    setDraft(null)
    seekValue.current = null
    setSeeking(false)
  }, [props.currentSrc.src, canControl, setSeeking]) // release a seek if the host or source changes
  const togglePlay = () => {
    if (canControl && hasMedia) {
      if (ended) playAgain()
      else setPaused(!paused)
    }
  }
  const finishSeek = () => {
    if (seekValue.current !== null) setProgress(seekValue.current)
    seekValue.current = null
    setDraft(null)
    setSeeking(false)
  }
  const iconButton = (
    label: string,
    action: () => void,
    icon: React.ReactNode,
    disabled = false,
    active = false,
    className = ""
  ) => (
    <Button
      type='button'
      variant='ghost'
      size='icon'
      className={`player-button ${active ? "is-active" : ""} ${className}`}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => {
        action()
      }}
    >
      {icon}
    </Button>
  )

  return (
    <div
      className='player-controls controls-visible'
      tabIndex={0}
      role='group'
      aria-label='Media player. Space to play, arrow keys to seek, M to mute, F for fullscreen.'
      onKeyDown={(event) => {
        if (event.key === "Escape" && settings) {
          event.stopPropagation()
          setSettings(false)
          settingsButton.current?.focus()
          return
        }
        if (event.target !== event.currentTarget) return
        const key = event.key.toLowerCase()
        if ([" ", "k", "m", "f", "arrowleft", "arrowright"].includes(key)) {
          event.preventDefault()
          if (key === " " || key === "k") togglePlay()
          if (key === "m") setMuted(!muted)
          if (key === "f") toggleFullscreen()
          if (canControl && hasMedia && duration > 0 && key === "arrowleft")
            setProgress(Math.max(0, progress - 10))
          if (canControl && hasMedia && duration > 0 && key === "arrowright")
            setProgress(Math.min(duration, progress + 10))
        }
      }}
    >
      <div className='player-control-deck'>
        <div className='player-deck-heading'>
          <span className='player-mode'>
            <AudioLines size={15} />
            {musicMode ? "AUDIO SESSION" : "WATCH TOGETHER"}
          </span>
          <span className='player-time'>
            {secondsToTime(shownProgress)}
            <span> / {secondsToTime(duration)}</span>
          </span>
        </div>
        <div className='player-timeline'>
          <input
            type='range'
            aria-label='Playback position'
            aria-valuetext={`${secondsToTime(shownProgress)} of ${secondsToTime(
              duration
            )}`}
            min={0}
            max={duration || 1}
            step={0.1}
            value={shownProgress}
            disabled={!canControl || !hasMedia || duration <= 0}
            style={
              {
                "--range-progress": `${
                  duration > 0 ? (shownProgress / duration) * 100 : 0
                }%`,
              } as CSSProperties
            }
            onPointerDown={(event) => {
              if (canControl && duration > 0) {
                event.currentTarget.setPointerCapture(event.pointerId)
                seekValue.current = shownProgress
                setDraft(shownProgress)
                setSeeking(true)
              }
            }}
            onChange={(event) => {
              const value = Number(event.target.value)
              if (seekValue.current !== null) {
                seekValue.current = value
                setDraft(value)
              } else setProgress(value)
            }}
            onPointerUp={finishSeek}
            onPointerCancel={() => {
              seekValue.current = null
              setDraft(null)
              setSeeking(false)
            }}
            onLostPointerCapture={finishSeek}
            onBlur={finishSeek}
          />
        </div>
        <div className='player-transport'>
          <div className='transport-primary'>
            {iconButton(
              "Previous track",
              () => playIndex(playlist.currentIndex - 1),
              <SkipBack fill='currentColor' />,
              !canControl || playlist.currentIndex <= 0,
              false,
              "player-skip"
            )}
            {iconButton(
              ended ? "Replay" : paused ? "Play" : "Pause",
              togglePlay,
              ended ? (
                <RotateCcw />
              ) : paused ? (
                <Play fill='currentColor' />
              ) : (
                <Pause fill='currentColor' />
              ),
              !canControl || !hasMedia,
              false,
              "transport-play"
            )}
            {iconButton(
              "Next track",
              () => playIndex(playlist.currentIndex + 1),
              <SkipForward fill='currentColor' />,
              !canControl || playlist.currentIndex >= playlist.items.length - 1,
              false,
              "player-skip"
            )}
            <div className='player-volume'>
              {iconButton(
                muted || volume === 0 ? "Unmute" : "Mute",
                () => {
                  if (volume === 0) setVolume(0.5)
                  setMuted(!muted && volume > 0)
                },
                muted || volume === 0 ? <VolumeX /> : <Volume2 />
              )}
              <input
                aria-label='Volume'
                type='range'
                min={0}
                max={1}
                step={0.01}
                value={muted ? 0 : volume}
                style={
                  {
                    "--range-progress": `${muted ? 0 : volume * 100}%`,
                  } as CSSProperties
                }
                onChange={(event) => {
                  setVolume(Number(event.target.value))
                  setMuted(false)
                }}
              />
            </div>
          </div>
          <div className='transport-secondary'>
            {iconButton(
              loop ? "Turn repeat off" : "Repeat track",
              () => setLoop(!loop),
              <Repeat2 />,
              !canControl || !hasMedia,
              loop,
              "player-repeat"
            )}
            {iconButton(
              musicMode ? "Switch to video" : "Switch to audio mode",
              () => setMusicMode(!musicMode),
              <AudioLines />,
              !canControl || !hasMedia,
              musicMode,
              "player-audio"
            )}
            {iconButton(
              pipEnabled ? "Close picture-in-picture" : "Open mini player",
              togglePip,
              <PictureInPicture2 />,
              !hasMedia,
              pipEnabled,
              "player-pip"
            )}
            <div className='player-settings-anchor'>
              <Button
                ref={settingsButton}
                variant='ghost'
                size='icon'
                className={`player-button ${settings ? "is-active" : ""}`}
                aria-label='Playback settings'
                aria-expanded={settings}
                aria-controls='playback-settings'
                onClick={() => {
                  setSettings(!settings)
                }}
              >
                <Settings2 />
              </Button>
              {settings && (
                <div
                  id='playback-settings'
                  className='player-settings'
                  ref={panel}
                  role='region'
                  aria-label='Playback settings'
                >
                  <div className='settings-heading'>
                    <strong>Playback settings</strong>
                    {iconButton(
                      "Close settings",
                      () => {
                        setSettings(false)
                        settingsButton.current?.focus()
                      },
                      <X />
                    )}
                  </div>
                  <label className='settings-row'>
                    <span>Speed</span>
                    <span className='settings-select'>
                      <select
                        aria-label='Playback speed'
                        value={props.playbackRate}
                        disabled={!canControl}
                        onChange={(event) =>
                          props.setPlaybackRate(Number(event.target.value))
                        }
                      >
                        {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3].map(
                          (rate) => (
                            <option value={rate} key={rate}>
                              {rate === 1 ? "Normal" : `${rate}×`}
                            </option>
                          )
                        )}
                      </select>
                      <ChevronDown size={14} />
                    </span>
                  </label>
                  <label className='settings-row'>
                    <span>Repeat track</span>
                    <Switch
                      aria-label='Repeat track'
                      checked={loop}
                      onCheckedChange={setLoop}
                      disabled={!canControl || !hasMedia}
                    />
                  </label>
                  <label className='settings-row'>
                    <span>Audio mode</span>
                    <Switch
                      aria-label='Audio mode'
                      checked={musicMode}
                      onCheckedChange={setMusicMode}
                      disabled={!canControl || !hasMedia}
                    />
                  </label>
                  {playing.src.length > 1 && (
                    <label className='settings-row'>
                      <span>Quality</span>
                      <select
                        aria-label='Video quality'
                        value={props.currentSrc.src}
                        onChange={(event) => {
                          const source = playing.src.find(
                            (source) => source.src === event.target.value
                          )
                          if (source) props.setCurrentSrc(source)
                        }}
                      >
                        {playing.src.map((source, index) => (
                          <option key={source.src} value={source.src}>
                            {source.resolution || `Source ${index + 1}`}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {playing.sub.length > 0 && (
                    <label className='settings-row'>
                      <span>Subtitles</span>
                      <select
                        aria-label='Subtitles'
                        value={props.currentSub.src}
                        onChange={(event) =>
                          props.setCurrentSub(
                            playing.sub.find(
                              (sub) => sub.src === event.target.value
                            ) || { src: "", lang: "Off" }
                          )
                        }
                      >
                        <option value=''>Off</option>
                        {playing.sub.map((sub) => (
                          <option key={sub.src} value={sub.src}>
                            {sub.lang}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <button
                    className='settings-mini-link'
                    onClick={togglePip}
                    disabled={!hasMedia}
                  >
                    <PictureInPicture2 size={15} />
                    {pipEnabled
                      ? "Close picture-in-picture"
                      : "Picture-in-picture"}
                  </button>
                  <a
                    className='settings-mini-link'
                    href={`/embed/${encodeURIComponent(props.roomId)}`}
                    target='_blank'
                    rel='noopener noreferrer'
                  >
                    <PictureInPicture2 size={15} /> Open dedicated player
                  </a>
                  <p className='settings-note'>
                    {canControl
                      ? "Playback changes sync with everyone."
                      : "The host manages shared playback."}
                  </p>
                </div>
              )}
            </div>
            {iconButton(
              fullscreen ? "Exit fullscreen" : "Enter fullscreen",
              toggleFullscreen,
              fullscreen ? <Minimize /> : <Maximize />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
