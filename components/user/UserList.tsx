import { useEffect, useState } from "react"
import { Check, Crown, Pencil } from "lucide-react"
import { TypedSocket } from "../../lib/socket"
import { RoomState, UserState } from "../../lib/types"
export default function UserList({ socket }: { socket: TypedSocket }) {
  const [users, setUsers] = useState<UserState[]>([])
  const [owner, setOwner] = useState("")
  useEffect(() => {
    const update = (room: RoomState) => {
      setUsers(room.users)
      setOwner(room.ownerId)
    }
    socket.on("update", update)
    socket.emit("fetch")
    return () => {
      socket.off("update", update)
    }
  }, [socket])
  return (
    <div className='room-user-list'>
      {users.map((user) => (
        <Person
          key={user.uid}
          user={user}
          isSelf={user.uid === socket.id}
          isOwner={user.uid === owner}
          onRename={(name) => {
            socket.emit("updateUser", { ...user, name })
            try {
              localStorage.setItem("userName", name)
            } catch {
              /* optional */
            }
          }}
        />
      ))}
    </div>
  )
}
function Person({
  user,
  isSelf,
  isOwner,
  onRename,
}: {
  user: UserState
  isSelf: boolean
  isOwner: boolean
  onRename: (name: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(user.name)
  return (
    <div className='room-user'>
      <span className='room-user-avatar' aria-hidden='true'>
        {user.name.slice(0, 2).toUpperCase()}
      </span>
      <div className='room-user-info'>
        {editing ? (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (name.trim().length >= 2) {
                onRename(name.trim())
                setEditing(false)
              }
            }}
          >
            <input
              autoFocus
              aria-label='Your display name'
              value={name}
              minLength={2}
              maxLength={30}
              required
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setEditing(false)
              }}
            />
            <button type='submit' aria-label='Save display name'>
              <Check size={16} />
            </button>
          </form>
        ) : (
          <div className='room-user-name'>
            <span>
              {user.name}
              {isSelf ? " (you)" : ""}
            </span>
            {isOwner && <Crown size={13} aria-label='Host' />}
          </div>
        )}
        <p>{isOwner ? "Room host" : "Here for the music"}</p>
      </div>
      {isSelf && !editing && (
        <button
          aria-label='Edit your name'
          title='Edit your name'
          onClick={() => {
            setName(user.name)
            setEditing(true)
          }}
        >
          <Pencil size={13} />
        </button>
      )}
    </div>
  )
}
