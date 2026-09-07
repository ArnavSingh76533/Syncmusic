import { useEffect, useState } from "react"
import { createClientSocket, TypedSocket } from "../lib/socket"

// One socket per mounted room. Cleanup also covers navigation during initialization.
export function useRoomSocket(id: string, name: string | null) {
  const [socket, setSocket] = useState<TypedSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (name === null) return
    let cancelled = false
    let client: TypedSocket | null = null
    setSocket(null)
    setConnected(false)
    setError(false)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12000)
    const connect = async () => {
      try {
        const response = await fetch("/api/socketio", {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error("Connection failed")
        if (cancelled) return
        let isPublic: boolean | undefined
        try {
          isPublic = JSON.parse(
            sessionStorage.getItem(`room_${id}_meta`) || "{}"
          ).isPublic
        } catch {
          /* storage is optional */
        }
        client = createClientSocket(id, name || undefined, isPublic)
        client.on("connect", () => {
          setConnected(true)
          setError(false)
          client?.emit("fetch")
        })
        client.on("disconnect", () => setConnected(false))
        client.on("connect_error", () => {
          setConnected(false)
          setError(true)
        })
        setSocket(client)
      } catch {
        if (!cancelled) setError(true)
      } finally {
        clearTimeout(timeout)
      }
    }
    void connect()
    return () => {
      cancelled = true
      clearTimeout(timeout)
      controller.abort()
      client?.disconnect()
    }
  }, [id, name, attempt])

  return {
    socket,
    connected,
    error,
    retry: () => setAttempt((value) => value + 1),
  }
}
