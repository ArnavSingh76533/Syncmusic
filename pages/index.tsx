import { FormEvent, useEffect, useState } from "react"
import { useRouter } from "next/router"
import useSWR from "swr"
import {
  ArrowUpRight,
  AudioLines,
  Headphones,
  Loader2,
  LockKeyhole,
  Radio,
  Users,
} from "lucide-react"
import Layout from "../components/Layout"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import { Switch } from "../components/ui/switch"

interface PublicRoom {
  id: string
  ownerName: string
  memberCount: number
}
const fetcher = async (url: string) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error("Couldn’t load rooms")
  return response.json()
}

export default function Index() {
  const router = useRouter()
  const [mode, setMode] = useState<"create" | "join">("create")
  const [room, setRoom] = useState("")
  const [userName, setUserName] = useState("")
  const [isPublic, setIsPublic] = useState(false)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const { data: stats } = useSWR<{ rooms: number; users: number }>(
    "/api/stats",
    fetcher
  )
  const {
    data,
    error: roomsError,
    isLoading,
    mutate,
  } = useSWR<{ rooms: PublicRoom[] }>("/api/rooms", fetcher, {
    refreshInterval: 10000,
  })
  useEffect(() => {
    try {
      setUserName(localStorage.getItem("userName") || "")
    } catch {
      /* optional preference */
    }
  }, [])
  const join = async (roomId: string) => {
    try {
      if (userName.trim()) localStorage.setItem("userName", userName.trim())
    } catch {
      /* the room can ask again */
    }
    await router.push(`/room/${encodeURIComponent(roomId)}`)
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setError("")
    if (userName.trim().length < 2) {
      setError("Enter a name with at least 2 characters.")
      return
    }
    setBusy(true)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    try {
      if (mode === "join") {
        let code = room.trim().toLowerCase()
        if (/^https?:\/\//i.test(code))
          code = new URL(code).pathname.split("/room/")[1]?.split("/")[0] || ""
        if (!/^[a-z]{4,}$/.test(code))
          throw new Error("Enter a valid room code or invitation link.")
        await join(code)
      } else {
        const response = await fetch("/api/generate", {
          signal: controller.signal,
        })
        if (!response.ok)
          throw new Error("Couldn’t create a room. Please try again.")
        const { roomId } = await response.json()
        if (typeof roomId !== "string" || !/^[a-z]{4,}$/.test(roomId))
          throw new Error("Couldn’t create a room. Please try again.")
        try {
          sessionStorage.setItem(
            `room_${roomId}_meta`,
            JSON.stringify({ isPublic })
          )
        } catch {
          /* defaults to a private room */
        }
        await join(roomId)
      }
    } catch (cause) {
      setError(
        controller.signal.aborted
          ? "The server is taking a moment. Please try again."
          : cause instanceof Error
            ? cause.message
            : "Couldn’t open the room. Please try again."
      )
    } finally {
      clearTimeout(timeout)
      setBusy(false)
    }
  }
  return (
    <Layout
      home
      meta={{
        title: "Syncmusic · Better together",
        robots: "index, archive, follow",
      }}
    >
      <section className='home-hero' aria-labelledby='home-title'>
        <div className='home-intro'>
          <span className='room-eyebrow'>
            <Headphones size={16} /> A SPACE FOR YOUR SOUNDTRACK
          </span>
          <h1 id='home-title'>
            Your music. <br />
            Your people.
            <br />
            <span>One room.</span>
          </h1>
          <p>
            Press play on a little together time. Share music, watch videos, and
            catch up in your own listening room.
          </p>
          <div className='home-facts'>
            <span>
              <AudioLines />
              Shared playback
            </span>
            <span>
              <Users />
              Live chat
            </span>
            <span>
              <LockKeyhole />
              No account needed
            </span>
          </div>
          {stats && (
            <div className='home-live'>
              <span className='live-dot' />
              {stats.rooms} rooms · {stats.users} people online
            </div>
          )}
        </div>
        <div className='home-room-card'>
          <div className='home-card-heading'>
            <span className='brand-mark'>
              <AudioLines size={24} />
            </span>
            <div>
              <span className='room-eyebrow'>LET’S LISTEN</span>
              <h2>Make yourself at home.</h2>
            </div>
          </div>
          <div className='home-mode' aria-label='Room action'>
            {(["create", "join"] as const).map((value) => (
              <Button
                key={value}
                type='button'
                variant='ghost'
                aria-pressed={mode === value}
                className={mode === value ? "is-active" : ""}
                onClick={() => {
                  setMode(value)
                  setError("")
                }}
                disabled={busy}
              >
                {value === "create" ? "Create a room" : "Join a room"}
              </Button>
            ))}
          </div>
          <form onSubmit={submit} className='home-form' aria-busy={busy}>
            <div>
              <Label htmlFor='listener-name'>Your name</Label>
              <Input
                id='listener-name'
                autoComplete='nickname'
                value={userName}
                onChange={(event) => setUserName(event.target.value)}
                placeholder='What should we call you?'
                required
                minLength={2}
                maxLength={30}
                disabled={busy}
              />
            </div>
            {mode === "join" ? (
              <div>
                <Label htmlFor='room-code'>Room code or invite link</Label>
                <Input
                  id='room-code'
                  value={room}
                  onChange={(event) => setRoom(event.target.value)}
                  placeholder='Paste your invite here'
                  autoCapitalize='none'
                  spellCheck={false}
                  required
                  disabled={busy}
                />
              </div>
            ) : (
              <div className='home-privacy'>
                <div>
                  <Label htmlFor='public-room'>Open to everyone</Label>
                  <p>
                    {isPublic
                      ? "Your room will appear in Explore."
                      : "Only people with your link can join."}
                  </p>
                </div>
                <Switch
                  id='public-room'
                  checked={isPublic}
                  onCheckedChange={setIsPublic}
                  disabled={busy}
                />
              </div>
            )}
            {error && (
              <p className='home-error' role='alert'>
                {error}
              </p>
            )}
            <Button
              className='room-primary home-submit'
              type='submit'
              disabled={busy}
            >
              {busy ? (
                <>
                  <Loader2 className='spin' />
                  Opening your room…
                </>
              ) : (
                <>
                  {mode === "create" ? "Start listening" : "Join the session"}
                  <ArrowUpRight />
                </>
              )}
            </Button>
            <p className='home-form-note'>
              {mode === "create"
                ? "Pick a track. Share your link. Enjoy the company."
                : "The room host manages shared playback."}
            </p>
          </form>
        </div>
      </section>
      <section
        id='public-rooms'
        className='home-explore'
        aria-labelledby='explore-title'
      >
        <div className='home-explore-heading'>
          <div>
            <span className='room-eyebrow'>
              <Radio size={14} /> FIND YOUR COMPANY
            </span>
            <h2 id='explore-title'>A room for the moment.</h2>
          </div>
          <span className='home-live'>Public listening rooms</span>
        </div>
        {roomsError ? (
          <div className='home-empty' role='status'>
            <p>Rooms couldn’t load right now.</p>
            <Button className='room-secondary' onClick={() => mutate()}>
              Try again
            </Button>
          </div>
        ) : isLoading ? (
          <div className='home-empty' role='status'>
            <Loader2 className='spin' />
            <p>Finding open rooms…</p>
          </div>
        ) : data?.rooms?.length ? (
          <div className='home-room-list'>
            {data.rooms.map((entry) => (
              <button
                className='home-public-room'
                key={entry.id}
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  setError("")
                  try {
                    await join(entry.id)
                  } catch {
                    setError("Couldn’t join that room. Please try again.")
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                <span className='home-room-icon'>
                  <Headphones />
                </span>
                <span>
                  <strong>{entry.ownerName || "Someone"}’s room</strong>
                  <small>
                    <Users size={13} />
                    {entry.memberCount} listening · {entry.id}
                  </small>
                </span>
                <ArrowUpRight size={21} />
              </button>
            ))}
          </div>
        ) : (
          <div className='home-empty'>
            <AudioLines size={30} />
            <div>
              <h3>The next session could be yours.</h3>
              <p>
                Create an open room and let someone discover your soundtrack.
              </p>
            </div>
            <Button
              className='room-secondary'
              onClick={() => {
                setMode("create")
                setIsPublic(true)
                document.getElementById("listener-name")?.focus()
              }}
            >
              Start a room
              <ArrowUpRight size={17} />
            </Button>
          </div>
        )}
      </section>
    </Layout>
  )
}
