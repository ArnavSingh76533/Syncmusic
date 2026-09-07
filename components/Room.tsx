"use client"
import { useEffect, useState } from "react"
import {
  Headphones,
  ListMusic,
  MessageCircle,
  Search,
  Radio,
  RefreshCw,
} from "lucide-react"
import Player from "./player/Player"
import PlaylistMenu from "./playlist/PlaylistMenu"
import InputUrl from "./input/InputUrl"
import UserList from "./user/UserList"
import ChatPanel from "./chat/ChatPanel"
import YoutubeSearch from "./search/YoutubeSearch"
import NameModal from "./modal/NameModal"
import { Button } from "./ui/button"
import { useRoomSocket } from "../hooks/useRoomSocket"
import { RoomState } from "../lib/types"

export default function Room({ id }: { id: string }) {
  const [name, setName] = useState<string | null>(null)
  const [showNameModal, setShowNameModal] = useState(false)
  const [url, setUrl] = useState("")
  const [tab, setTab] = useState("queue")
  const [listeners, setListeners] = useState(0)
  const [count, setCount] = useState(0)
  const { socket, connected, error, retry } = useRoomSocket(id, name)

  useEffect(() => {
    let saved = ""
    try {
      saved = localStorage.getItem("userName")?.trim() || ""
    } catch {
      /* ask for a name */
    }
    if (saved) setName(saved)
    else setShowNameModal(true)
  }, [])
  useEffect(() => {
    if (!socket) return
    const update = (room: RoomState) => {
      setListeners(room.users.length)
      setCount(room.targetState.playlist.items.length)
    }
    socket.on("update", update)
    socket.emit("fetch")
    return () => {
      socket.off("update", update)
    }
  }, [socket])

  return (
    <>
      <div className='room-name-modal'>
        <NameModal
          show={showNameModal}
          onSubmit={(value) => {
            try {
              localStorage.setItem("userName", value)
            } catch {
              /* optional */
            }
            setShowNameModal(false)
            setName(value)
          }}
        />
      </div>
      <div className='room-heading'>
        <div>
          <div className='room-eyebrow'>
            <Headphones size={14} /> YOUR SHARED SOUNDTRACK
          </div>
          <h1>
            Good music. <span>Great company.</span>
          </h1>
        </div>
        <div
          className={`connection-pill ${connected ? "is-connected" : ""}`}
          role='status'
        >
          <Radio size={15} />
          {connected
            ? `${listeners} ${
                listeners === 1 ? "person" : "people"
              } in the room`
            : "Connecting…"}
        </div>
      </div>
      {!socket ? (
        <div className='room-connecting' role='status'>
          <AudioPlaceholder />
          <h2>{error ? "Let’s reconnect" : "Setting the mood…"}</h2>
          <p>
            {error
              ? "The room is taking a little longer to respond."
              : "Joining your listening room."}
          </p>
          {error && (
            <Button className='room-primary' onClick={retry}>
              Try again
            </Button>
          )}
        </div>
      ) : (
        <div className='room-grid'>
          <section className='room-stage' aria-label='Stream player'>
            <Player roomId={id} socket={socket} />
            <nav className='room-shortcuts' aria-label='Jump to room activity'>
              {[
                { id: "search", label: "Discover", icon: Search },
                { id: "queue", label: "Queue", icon: ListMusic },
                { id: "chat", label: "Chat", icon: MessageCircle },
              ].map(({ id: panel, label, icon: Icon }) => (
                <Button
                  key={panel}
                  variant='ghost'
                  className='room-secondary'
                  onClick={() => {
                    setTab(panel)
                    document
                      .getElementById(`tab-${panel}`)
                      ?.focus({ preventScroll: true })
                    document
                      .getElementById("room-activity")
                      ?.scrollIntoView({ block: "start" })
                  }}
                >
                  <Icon size={17} />
                  {label}
                  {panel === "queue" && count > 0 ? ` · ${count}` : ""}
                </Button>
              ))}
            </nav>
            <div className='room-source-bar'>
              <div className='source-label'>PLAY SOMETHING</div>
              <InputUrl
                className='room-source-input'
                url={url}
                placeholder='Paste a YouTube or media link…'
                tooltip='Play this link for the room'
                onChange={setUrl}
                onSubmit={() => {
                  if (socket.connected) {
                    socket.emit("playUrl", url.trim())
                    setUrl("")
                  }
                }}
              >
                Play now
              </InputUrl>
              <Button
                className='room-secondary sync-button'
                onClick={() => socket.emit("fetch")}
                disabled={!connected}
                title='Resync with the room'
              >
                <RefreshCw />
                <span>Resync</span>
              </Button>
            </div>
            <section className='room-people'>
              <div className='section-heading'>
                <h2>Listening together</h2>
                <span>{listeners} online</span>
              </div>
              <UserList socket={socket} />
            </section>
          </section>
          <aside
            id='room-activity'
            className='room-sidebar'
            aria-label='Room activity'
          >
            <div className='room-tabs' role='tablist' aria-label='Room panels'>
              {[
                { id: "queue", label: "Queue", icon: ListMusic },
                { id: "search", label: "Discover", icon: Search },
                { id: "chat", label: "Chat", icon: MessageCircle },
              ].map(({ id: panel, label, icon: Icon }) => (
                <Button
                  key={panel}
                  variant='ghost'
                  role='tab'
                  id={`tab-${panel}`}
                  aria-controls={`panel-${panel}`}
                  aria-selected={tab === panel}
                  tabIndex={tab === panel ? 0 : -1}
                  className={tab === panel ? "is-active" : ""}
                  onClick={() => setTab(panel)}
                  onKeyDown={(event) => {
                    const tabs = ["queue", "search", "chat"]
                    if (
                      ["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                        event.key
                      )
                    ) {
                      event.preventDefault()
                      const next =
                        event.key === "Home"
                          ? "queue"
                          : event.key === "End"
                            ? "chat"
                            : tabs[
                                (tabs.indexOf(panel) +
                                  (event.key === "ArrowRight" ? 1 : 2)) %
                                  3
                              ]
                      setTab(next)
                      document.getElementById(`tab-${next}`)?.focus()
                    }
                  }}
                >
                  <Icon />
                  <span>{label}</span>
                  {panel === "queue" && (
                    <span className='tab-count'>{count}</span>
                  )}
                </Button>
              ))}
            </div>
            <div
              role='tabpanel'
              id='panel-queue'
              aria-labelledby='tab-queue'
              hidden={tab !== "queue"}
            >
              <PlaylistMenu socket={socket} />
            </div>
            <div
              role='tabpanel'
              id='panel-search'
              aria-labelledby='tab-search'
              hidden={tab !== "search"}
            >
              <YoutubeSearch socket={socket} />
            </div>
            <div
              role='tabpanel'
              id='panel-chat'
              aria-labelledby='tab-chat'
              hidden={tab !== "chat"}
            >
              <ChatPanel socket={socket} />
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
function AudioPlaceholder() {
  return <Headphones size={40} className='room-accent' />
}
