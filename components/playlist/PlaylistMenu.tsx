import { FC, useEffect, useState } from "react"
import {
  DragDropContext as _DragDropContext,
  Droppable as _Droppable,
  DragDropContextProps,
  DroppableProps,
} from "react-beautiful-dnd"
import { ListMusic, GripVertical } from "lucide-react"
import { Playlist, RoomState } from "../../lib/types"
import { TypedSocket, playItemFromPlaylist } from "../../lib/socket"
import { reorderPlaylist } from "../../lib/media"
import PlaylistItem from "./PlaylistItem"
import InputUrl from "../input/InputUrl"

const DragDropContext = _DragDropContext as unknown as FC<DragDropContextProps>
const Droppable = _Droppable as unknown as FC<DroppableProps>
export default function PlaylistMenu({ socket }: { socket: TypedSocket }) {
  const [playlist, setPlaylist] = useState<Playlist>({
    items: [],
    currentIndex: -1,
  })
  const [url, setUrl] = useState("")
  useEffect(() => {
    const update = (room: RoomState) =>
      setPlaylist((previous) =>
        JSON.stringify(previous) === JSON.stringify(room.targetState.playlist)
          ? previous
          : room.targetState.playlist
      )
    socket.on("update", update)
    socket.emit("fetch")
    return () => {
      socket.off("update", update)
    }
  }, [socket])
  const move = (from: number, to: number) => {
    if (socket.connected)
      socket.emit("updatePlaylist", reorderPlaylist(playlist, from, to))
  }
  return (
    <section className='queue-panel'>
      <div className='panel-heading'>
        <div>
          <h2>On the playlist</h2>
          <p>A soundtrack everyone can add to.</p>
        </div>
        <span>{playlist.items.length} tracks</span>
      </div>
      <InputUrl
        url={url}
        placeholder='Add a media link…'
        tooltip='Add to the queue'
        onChange={setUrl}
        onSubmit={() => {
          if (socket.connected) {
            socket.emit("addToPlaylist", url.trim())
            setUrl("")
          }
        }}
      >
        Add
      </InputUrl>
      <DragDropContext
        onDragEnd={({ source, destination }) => {
          if (destination && source.index !== destination.index)
            move(source.index, destination.index)
        }}
      >
        <Droppable droppableId='playlistMenu'>
          {(provided, snapshot) => (
            <div
              {...provided.droppableProps}
              ref={provided.innerRef}
              className={`queue-list ${
                snapshot.isDraggingOver ? "is-dragging-over" : ""
              }`}
            >
              {playlist.items.length === 0 && (
                <div className='panel-empty'>
                  <ListMusic />
                  <strong>Make room for your favorites.</strong>
                  <p>Add a link above, or find your next track in Discover.</p>
                </div>
              )}
              {playlist.items.map((item, index) => (
                <PlaylistItem
                  key={`${item.src?.[0]?.src || "track"}-${index}`}
                  item={item}
                  index={index}
                  playing={playlist.currentIndex === index}
                  play={() => playItemFromPlaylist(socket, playlist, index)}
                  deleteItem={() => {
                    const items = playlist.items.filter(
                      (_, position) => position !== index
                    )
                    const currentIndex =
                      playlist.currentIndex === index
                        ? -1
                        : playlist.currentIndex > index
                          ? playlist.currentIndex - 1
                          : playlist.currentIndex
                    socket.emit("updatePlaylist", { items, currentIndex })
                  }}
                  updateTitle={(title) =>
                    socket.emit("updatePlaylist", {
                      ...playlist,
                      items: playlist.items.map((track, position) =>
                        position === index ? { ...track, title } : track
                      ),
                    })
                  }
                  moveUp={index > 0 ? () => move(index, index - 1) : undefined}
                />
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
      <div className='queue-footnote'>
        <GripVertical size={14} />
        Drag to reorder · Everyone can add tracks
      </div>
    </section>
  )
}
