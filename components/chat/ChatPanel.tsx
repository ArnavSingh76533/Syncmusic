"use client"
import { useEffect, useRef, useState } from "react"
import { MessageCircle, Send } from "lucide-react"
import { TypedSocket } from "../../lib/socket"
import { ChatMessage, RoomState } from "../../lib/types"
import { Button } from "../ui/button"

export default function ChatPanel({ socket }: { socket: TypedSocket }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [text, setText] = useState("")
  const [coolingDown, setCoolingDown] = useState(false)
  const audioContext = useRef<AudioContext | null>(null)
  const cooldown = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const onHistory = (history: ChatMessage[]) => setMessages(history)
    const onNew = (message: ChatMessage) => {
      if (message.userId !== socket.id) {
        try {
          const Audio =
            window.AudioContext || (window as any).webkitAudioContext
          if (!audioContext.current && Audio) audioContext.current = new Audio()
          const context = audioContext.current
          if (context?.state === "running") {
            const tone = context.createOscillator()
            const gain = context.createGain()
            tone.connect(gain)
            gain.connect(context.destination)
            tone.frequency.value = 800
            gain.gain.setValueAtTime(0.15, context.currentTime)
            gain.gain.exponentialRampToValueAtTime(
              0.001,
              context.currentTime + 0.1
            )
            tone.onended = () => {
              tone.disconnect()
              gain.disconnect()
            }
            tone.start()
            tone.stop(context.currentTime + 0.1)
          }
        } catch {
          /* Audio notifications are optional on muted or restricted browsers. */
        }
      }
      setMessages((previous) =>
        previous.some((item) => item.id === message.id)
          ? previous
          : [...previous, message].slice(-200)
      )
    }
    // The initial history event may arrive before this panel mounts; fetch also carries it.
    const onUpdate = (room: RoomState) => {
      if (room.chatLog)
        setMessages((previous) => {
          const merged = new Map(
            previous.map((message) => [message.id, message])
          )
          room.chatLog?.forEach((message) => merged.set(message.id, message))
          return Array.from(merged.values())
            .sort((a, b) => a.ts - b.ts)
            .slice(-200)
        })
    }
    socket.on("chatHistory", onHistory)
    socket.on("chatNew", onNew)
    socket.on("update", onUpdate)
    socket.emit("fetch")
    return () => {
      socket.off("chatHistory", onHistory)
      socket.off("chatNew", onNew)
      socket.off("update", onUpdate)
      if (cooldown.current) clearTimeout(cooldown.current)
      void audioContext.current?.close().catch(() => {})
      audioContext.current = null
    }
  }, [socket])
  const send = () => {
    if (!text.trim() || !socket.connected || coolingDown) return
    socket.emit("chatMessage", text.trim())
    setText("")
    setCoolingDown(true)
    cooldown.current = setTimeout(() => setCoolingDown(false), 800)
  }
  return (
    <section className='chat-panel'>
      <div className='chat-header'>
        <h2>The conversation</h2>
        <p>Same track. Same moment.</p>
      </div>
      <div
        className='chat-messages'
        role='log'
        aria-label='Room messages'
        aria-live='polite'
        aria-relevant='additions'
      >
        {messages.length === 0 ? (
          <div className='panel-empty'>
            <MessageCircle />
            <strong>Music is better with company.</strong>
            <p>Say hello, share a thought, or ask for the next track.</p>
          </div>
        ) : (
          [...messages].reverse().map((message) => (
            <div
              className={`chat-message ${
                message.userId === socket.id ? "is-self" : ""
              }`}
              key={message.id}
            >
              <div className='chat-message-meta'>
                <strong>
                  {message.userId === socket.id ? "You" : message.name}
                </strong>
                <time dateTime={new Date(message.ts).toISOString()}>
                  {new Date(message.ts).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </div>
              <div className='chat-bubble'>{message.text}</div>
            </div>
          ))
        )}
      </div>
      <form
        className='chat-composer'
        onSubmit={(event) => {
          event.preventDefault()
          send()
        }}
      >
        <input
          aria-label='Message the room'
          placeholder='Say something nice…'
          maxLength={500}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <Button
          className='room-primary'
          type='submit'
          aria-label='Send message'
          disabled={!text.trim() || !socket.connected || coolingDown}
        >
          <Send />
        </Button>
      </form>
    </section>
  )
}
