"use client"
import { useEffect, useState } from "react"
import Player from "./player/Player"
import { useRoomSocket } from "../hooks/useRoomSocket"

export default function Embed({ id }: { id: string }) {
  const [name, setName] = useState<string | null>(null)
  useEffect(() => {
    try {
      setName(localStorage.getItem("userName") || "")
    } catch {
      setName("")
    }
  }, [])
  const { socket, error, retry } = useRoomSocket(id, name)
  if (!socket)
    return (
      <div className='embed-loading' role='status'>
        {error ? (
          <button onClick={retry}>Connection failed. Try again</button>
        ) : (
          "Joining the stream…"
        )}
      </div>
    )
  return <Player roomId={id} socket={socket} fullHeight />
}
