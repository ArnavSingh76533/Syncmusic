import {
  MediaElement,
  PlayerState,
  Playlist,
  RoomState,
  UserState,
  ChatMessage,
} from "./types"
import io, { Socket } from "socket.io-client"

// Events the server emits to the client
export interface ServerToClientEvents {
  // Optional legacy granular updates (your server mainly emits `update`)
  playlistUpdate: (playlist: Playlist) => void
  userUpdates: (users: UserState[]) => void

  // Primary room update payload
  update: (room: RoomState) => void

  // Chat events
  chatNew: (msg: ChatMessage) => void
  chatHistory: (msgs: ChatMessage[]) => void
}

// Events the client emits to the server
export interface ClientToServerEvents {
  // Playlist and user updates
  playItemFromPlaylist: (index: number) => void
  updatePlaylist: (playlist: Playlist) => void
  updatePlayer: (player: PlayerState) => void
  updatePlaying: (playing: MediaElement) => void
  updateUser: (user: UserState) => void

  // Player controls
  setPaused: (paused: boolean) => void
  setLoop: (loop: boolean) => void
  setProgress: (progress: number) => void
  setPlaybackRate: (playbackRate: number) => void
  setMusicMode: (musicMode: boolean) => void
  seek: (progress: number) => void

  // Playback and fetching
  playUrl: (src: string, metadata?: Pick<MediaElement, "title" | "thumbnail">) => void
  addToPlaylist: (url: string, metadata?: Pick<MediaElement, "title" | "thumbnail">) => void // NEW: add without playing
  playAgain: () => void
  playEnded: () => void
  fetch: () => void
  error: () => void

  // Chat
  chatMessage: (text: string) => void
}

export type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>

export function playItemFromPlaylist(
  socket: TypedSocket,
  playlist: Playlist,
  index: number
) {
  if (!playlist || !Array.isArray(playlist.items) || !playlist.items[index]) {
    console.error("Impossible to play", index, "from", playlist)
    return
  }
  socket.emit("playItemFromPlaylist", index)
}

export function createClientSocket(
  roomId: string,
  userName?: string,
  isPublic?: boolean
): TypedSocket {
  console.log("Trying to join room", roomId)
  const query: any = { roomId }
  if (userName) {
    query.userName = userName
  }
  if (isPublic !== undefined) {
    query.isPublic = isPublic.toString()
  }
  
  const socket: TypedSocket = io({
    query,
    transports: ["websocket"],
    path: "/api/socketio",
  })

  socket.on("connect", () => {
    console.log("Established ws connection to io server", socket.id)
  })

  socket.on("disconnect", (reason) => {
    if (!["io client disconnect", "io server disconnect"].includes(reason)) {
      console.error(
        "Socket connection closed due to:",
        reason,
        "socket:",
        socket
      )
    }
  })

  return socket
}

// Convenience helpers
export function playNow(socket: TypedSocket, url: string) {
  socket.emit("playUrl", url)
}

export function queueUrl(socket: TypedSocket, url: string) {
  socket.emit("addToPlaylist", url)
}