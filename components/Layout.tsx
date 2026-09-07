import { FC, ReactNode, useEffect, useState } from "react"
import RoomHeader from "./room/RoomHeader"
import Navbar from "./Navbar"
import NoScriptAlert from "./alert/NoScriptAlert"
import Footer from "./Footer"
import Head, { MetaProps } from "./Head"

interface Props {
  meta: MetaProps
  showNavbar?: boolean
  error?: number
  roomId?: string
  home?: boolean
  children?: ReactNode
}

const Layout: FC<Props> = ({
  meta,
  showNavbar = true,
  error,
  roomId,
  home = false,
  children,
}) => {
  const [theme, setTheme] = useState("dark")
  useEffect(() => {
    if (!roomId && !home) return
    try {
      const saved = localStorage.getItem("syncmusic-theme")
      setTheme(
        saved === "light" || saved === "dark"
          ? saved
          : window.matchMedia("(prefers-color-scheme: light)").matches
            ? "light"
            : "dark"
      )
    } catch {
      /* Dark mode remains available when storage is blocked. */
    }
  }, [roomId, home])
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark"
    setTheme(next)
    try {
      localStorage.setItem("syncmusic-theme", next)
    } catch {
      /* optional preference */
    }
  }
  return (
    <div
      className={roomId || home ? "stream-room" : "flex flex-col min-h-screen"}
      data-theme={roomId || home ? theme : undefined}
    >
      <Head customMeta={meta} />
      {showNavbar &&
        (roomId || home ? (
          <RoomHeader roomId={roomId} theme={theme} toggleTheme={toggleTheme} />
        ) : (
          <header>
            <Navbar />
          </header>
        ))}

      <noscript>
        <NoScriptAlert />
      </noscript>

      <main
        className={
          roomId || home ? "room-main" : "relative flex flex-col grow p-2"
        }
      >
        {children}
      </main>

      {roomId || home ? (
        <footer className='room-footer'>
          <span>Made for listening. Better together.</span>
          <span>Syncmusic</span>
        </footer>
      ) : (
        <Footer error={error} />
      )}
    </div>
  )
}

export default Layout
