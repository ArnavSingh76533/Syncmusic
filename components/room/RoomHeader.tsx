import { useState } from "react"
import Link from "next/link"
import { AudioLines, Check, Copy, Moon, Sun, ArrowLeft } from "lucide-react"
import { Button } from "../ui/button"
import { Input } from "../ui/input"

export default function RoomHeader({
  roomId,
  theme,
  toggleTheme,
}: {
  roomId: string
  theme: string
  toggleTheme: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [shareUrl, setShareUrl] = useState("")
  const invite = async () => {
    const url = `${window.location.origin}/room/${encodeURIComponent(roomId)}`
    setShareUrl(url)
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <header className='room-header'>
      <Link href='/' className='room-brand' aria-label='Syncmusic home'>
        <span className='brand-mark'>
          <AudioLines size={23} />
        </span>
        <span>
          sync<span className='brand-light'>music</span>
          <span className='brand-period'>.</span>
        </span>
      </Link>
      <div className='room-nav-context'>
        <span className='nav-divider' />
        Listening room <span className='room-code'>{roomId}</span>
      </div>
      <div className='room-header-actions'>
        <Button
          variant='ghost'
          size='icon'
          className='room-icon-button'
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? <Sun /> : <Moon />}
        </Button>
        <Button className='room-primary' onClick={invite}>
          {copied ? <Check /> : <Copy />}
          <span>{copied ? "Link copied" : "Invite friends"}</span>
        </Button>
      </div>
      {shareUrl && (
        <div className='room-share' role='status'>
          <span>
            {copied
              ? "Ready to share. Everyone with the link can join."
              : "Copy this link to invite your friends."}
          </span>
          <Input
            aria-label='Room invitation link'
            readOnly
            value={shareUrl}
            onFocus={(event) => event.target.select()}
          />
          <Button
            variant='ghost'
            className='room-icon-button'
            onClick={() => {
              setShareUrl("")
              setCopied(false)
            }}
            aria-label='Close invitation'
          >
            <ArrowLeft />
          </Button>
        </div>
      )}
    </header>
  )
}
