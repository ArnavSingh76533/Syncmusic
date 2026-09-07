import Image from "next/image"
import { FC, useEffect, useState } from "react"
import { Draggable as _Draggable, DraggableProps } from "react-beautiful-dnd"
import {
  ArrowUp,
  AudioLines,
  Check,
  ExternalLink,
  GripVertical,
  Pencil,
  Play,
  Trash2,
} from "lucide-react"
import { MediaElement } from "../../lib/types"
import { mediaArtwork, mediaProvider, mediaTitle } from "../../lib/media"
const Draggable = _Draggable as unknown as FC<DraggableProps>
interface Props {
  playing: boolean
  item: MediaElement
  index: number
  play: () => void
  deleteItem: (index: number) => void
  updateTitle: (title: string) => void
  moveUp?: () => void
}
export default function PlaylistItem({
  playing,
  item,
  index,
  play,
  deleteItem,
  updateTitle,
  moveUp,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(item.title || "")
  const [artFailed, setArtFailed] = useState(false)
  useEffect(() => {
    if (!editing) setTitle(item.title || "")
  }, [item.title, editing])
  const artwork = mediaArtwork(item)
  useEffect(() => setArtFailed(false), [artwork])
  return (
    <Draggable draggableId={`playlistMenu-item-${index}`} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          style={provided.draggableProps.style}
          className={`queue-item ${playing ? "is-playing" : ""} ${
            snapshot.isDragging ? "is-dragging" : ""
          }`}
        >
          <div
            {...provided.dragHandleProps}
            className='queue-drag'
            aria-label={`Reorder ${mediaTitle(item)}`}
          >
            <GripVertical size={14} />
          </div>
          <button
            className='queue-art'
            onClick={play}
            aria-label={`Play ${mediaTitle(item)}`}
            disabled={playing}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {artwork && !artFailed ? (
              <Image
                width={52}
                height={52}
                unoptimized
                src={artwork}
                alt=''
                loading='lazy'
                onError={() => setArtFailed(true)}
              />
            ) : (
              <AudioLines size={22} />
            )}
            <span className='queue-play-icon'>
              {playing ? (
                <AudioLines size={21} />
              ) : (
                <Play size={20} fill='currentColor' />
              )}
            </span>
          </button>
          <div className='queue-info'>
            {editing ? (
              <form
                className='queue-edit'
                onSubmit={(event) => {
                  event.preventDefault()
                  updateTitle(title.trim())
                  setEditing(false)
                }}
              >
                <input
                  aria-label='Track title'
                  autoFocus
                  value={title}
                  maxLength={200}
                  onChange={(event) => setTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setEditing(false)
                  }}
                />
                <button aria-label='Save title' type='submit'>
                  <Check size={16} />
                </button>
              </form>
            ) : (
              <button
                className='queue-title'
                title={mediaTitle(item)}
                onClick={play}
              >
                {mediaTitle(item)}
              </button>
            )}
            <p>
              {playing
                ? "Now playing"
                : mediaProvider(item.src?.[0]?.src || "")}
            </p>
          </div>
          <div className='queue-actions'>
            {moveUp && (
              <button
                className='queue-mobile-move'
                aria-label='Move track up'
                title='Move up'
                onClick={moveUp}
              >
                <ArrowUp />
              </button>
            )}
            <button
              aria-label={`Rename ${mediaTitle(item)}`}
              title='Rename track'
              onClick={() => setEditing(!editing)}
            >
              <Pencil />
            </button>
            <a
              className='queue-external'
              href={item.src?.[0]?.src || "#"}
              target='_blank'
              rel='noopener noreferrer'
              aria-label='Open original source'
              title='Open original'
            >
              <ExternalLink />
            </a>
            <button
              className='queue-remove'
              aria-label={`Remove ${mediaTitle(item)}`}
              title='Remove from queue'
              onClick={() => deleteItem(index)}
            >
              <Trash2 />
            </button>
          </div>
        </div>
      )}
    </Draggable>
  )
}
