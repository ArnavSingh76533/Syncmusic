"use client"
import Image from "next/image"
import { FC, useState, useRef, useEffect } from "react"
import { Search, Plus, Play, Check, Loader2, Headphones } from "lucide-react"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { secondsToTime } from "../../lib/utils"
import { Socket } from "socket.io-client"
import { ClientToServerEvents, ServerToClientEvents } from "../../lib/socket"

type Result = {
  id: string
  title: string
  url: string
  duration?: number
  thumbnails?: { url: string; width?: number; height?: number }[]
}

interface Props {
  socket: Socket<ServerToClientEvents, ClientToServerEvents> | null
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  ms = 5000
) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), ms)
  try {
    const res = await fetch(input, { ...init, signal: controller.signal })
    return res
  } finally {
    clearTimeout(t)
  }
}

async function searchViaServer(q: string, limit = 8): Promise<Result[] | null> {
  try {
    const r = await fetchWithTimeout(
      `/api/search?q=${encodeURIComponent(q)}&limit=${limit}`,
      {},
      5000
    )
    if (!r.ok) return null
    const data = await r.json()
    return Array.isArray(data?.results) ? data.results : null
  } catch {
    return null
  }
}

async function searchViaPipedClient(
  q: string,
  limit = 8
): Promise<Result[] | null> {
  const instances = [
    "https://pipedapi.kavin.rocks",
    "https://piped.video",
    "https://piped.mha.fi",
    "https://piped-api.garudalinux.org",
  ]
  for (const base of instances) {
    try {
      const url = new URL("/search", base)
      url.searchParams.set("q", q)
      const r = await fetchWithTimeout(
        url.toString(),
        { cache: "no-store" },
        6000
      )
      if (!r.ok) continue
      const data = await r.json()
      const items: any[] = Array.isArray(data?.items) ? data.items : []
      const results = items
        .filter(
          (it) =>
            ["video", "stream"].includes(it?.type?.toLowerCase()) &&
            (it?.id || it?.url) &&
            it?.title
        )
        .slice(0, limit)
        .map((it) => {
          const id =
            it.id ||
            new URL(it.url, "https://www.youtube.com").searchParams.get("v")
          if (!id) return null
          return {
            id,
            title: it.title,
            url: `https://www.youtube.com/watch?v=${id}`,
            duration: typeof it.duration === "number" ? it.duration : undefined,
            thumbnails: it.thumbnail ? [{ url: it.thumbnail }] : undefined,
          } as Result
        })
        .filter((item): item is Result => item !== null)
      if (results.length) return results
    } catch {
      // try next instance
    }
  }
  return null
}

const YoutubeSearch: FC<Props> = ({ socket }) => {
  const [q, setQ] = useState("")
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<Result[]>([])
  const [error, setError] = useState<string | null>(null)
  const [added, setAdded] = useState<string[]>([])
  const [searched, setSearched] = useState(false)
  const request = useRef(0)
  useEffect(
    () => () => {
      request.current++
    },
    []
  )
  const search = async () => {
    const query = q.trim()
    if (!query || loading) return
    const sequence = ++request.current
    setLoading(true)
    setError(null)
    setResults([])
    setAdded([])
    setSearched(true)
    let found = await searchViaServer(query, 8)
    if (request.current !== sequence) return
    if (!found?.length) found = await searchViaPipedClient(query, 8)
    if (request.current !== sequence) return
    if (!found?.length)
      setError(
        "No tracks found right now. Try another search, or paste a YouTube link in the queue."
      )
    else setResults(found)
    setLoading(false)
  }
  return (
    <section className='discover-panel'>
      <div className='panel-heading'>
        <div>
          <h2>Find your next favorite</h2>
          <p>Search YouTube. Set the mood.</p>
        </div>
      </div>
      <form
        className='search-form'
        onSubmit={(event) => {
          event.preventDefault()
          void search()
        }}
      >
        <Input
          type='search'
          aria-label='Search YouTube'
          placeholder='Song, artist, or a little inspiration…'
          value={q}
          onChange={(event) => setQ(event.target.value)}
        />
        <Button
          className='room-primary'
          disabled={loading || !q.trim()}
          type='submit'
          aria-label={loading ? "Searching" : "Search"}
        >
          {loading ? <Loader2 className='spin' /> : <Search />}
        </Button>
      </form>
      {loading && (
        <div className='panel-empty' role='status'>
          <Loader2 className='spin' />
          <strong>Finding your soundtrack…</strong>
          <p>Some sources take a moment to respond.</p>
        </div>
      )}
      {error && (
        <p className='search-error' role='alert'>
          {error}
        </p>
      )}
      {!searched && (
        <div className='panel-empty'>
          <Headphones />
          <strong>What are we listening to?</strong>
          <p>Find a favorite, add it to the queue, and share the moment.</p>
        </div>
      )}
      {results.length > 0 && (
        <>
          <div className='search-status'>
            <span>{results.length} results</span>
            <button
              onClick={() => {
                request.current++
                setResults([])
                setSearched(false)
                setError(null)
                setLoading(false)
              }}
            >
              Clear
            </button>
          </div>
          <div className='search-results'>
            {results.map((result) => (
              <div key={result.id} className='search-result'>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {result.thumbnails?.[0]?.url ? (
                  <Image
                    width={54}
                    height={54}
                    unoptimized
                    className='search-thumb'
                    src={result.thumbnails[0].url}
                    alt=''
                    loading='lazy'
                  />
                ) : (
                  <span className='search-thumb' />
                )}
                <div>
                  <h3>{result.title}</h3>
                  <p>
                    YouTube
                    {result.duration
                      ? ` · ${secondsToTime(result.duration)}`
                      : ""}
                  </p>
                </div>
                <div className='search-result-actions'>
                  <button
                    aria-label={
                      added.includes(result.id)
                        ? `${result.title} added`
                        : `Add ${result.title} to queue`
                    }
                    title={
                      added.includes(result.id)
                        ? "Added to queue"
                        : "Add to queue"
                    }
                    disabled={!socket?.connected || added.includes(result.id)}
                    onClick={() => {
                      socket?.emit("addToPlaylist", result.url, {
                        title: result.title,
                        thumbnail: result.thumbnails?.[0]?.url,
                      })
                      setAdded((previous) => [...previous, result.id])
                    }}
                  >
                    {added.includes(result.id) ? (
                      <Check size={17} />
                    ) : (
                      <Plus size={17} />
                    )}
                  </button>
                  <button
                    aria-label={`Play ${result.title}`}
                    title='Play now'
                    disabled={!socket?.connected}
                    onClick={() =>
                      socket?.emit("playUrl", result.url, {
                        title: result.title,
                        thumbnail: result.thumbnails?.[0]?.url,
                      })
                    }
                  >
                    <Play size={16} fill='currentColor' />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
export default YoutubeSearch
