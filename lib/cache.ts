import { RoomState } from "./types"

// Use global object to ensure cache is shared across all API routes in development
// In Next.js dev mode, modules can be loaded multiple times, so we need to use global
const globalForCache = global as typeof globalThis & {
  roomsCache?: Map<string, RoomState>
  userCount?: number
}

// In-memory stores - use global to persist across hot reloads
const rooms = globalForCache.roomsCache || new Map<string, RoomState>()
if (!globalForCache.roomsCache) {
  globalForCache.roomsCache = rooms
}

if (!globalForCache.userCount) {
  globalForCache.userCount = 0
}

const getUserCount = () => globalForCache.userCount || 0
const setUserCount = (count: number) => {
  globalForCache.userCount = count
}

export const getRoom = async (roomId: string): Promise<RoomState | null> => {
  return rooms.get(roomId) ?? null
}

export const roomExists = async (roomId: string): Promise<number> => {
  // Keep Redis-like return type (0/1) for compatibility
  return rooms.has(roomId) ? 1 : 0
}

export const setRoom = async (roomId: string, data: RoomState): Promise<"OK"> => {
  rooms.set(roomId, data)
  return "OK"
}

export const deleteRoom = async (roomId: string): Promise<number> => {
  return rooms.delete(roomId) ? 1 : 0
}

export const listRooms = async (): Promise<string[]> => {
  return Array.from(rooms.keys())
}

export const countRooms = async (): Promise<number> => {
  return rooms.size
}

export const countUsers = async (): Promise<number> => {
  return getUserCount()
}

export const incUsers = async (): Promise<number> => {
  const newCount = getUserCount() + 1
  setUserCount(newCount)
  return newCount
}

export const decUsers = async (): Promise<number> => {
  const newCount = Math.max(0, getUserCount() - 1)
  setUserCount(newCount)
  return newCount
}

export const wipeCache = async (): Promise<"OK"> => {
  rooms.clear()
  setUserCount(0)
  return "OK"
}

export const getPublicRooms = async (): Promise<RoomState[]> => {
  const publicRooms: RoomState[] = []
  for (const [_, room] of rooms) {
    if (room.isPublic && room.users.length > 0) {
      publicRooms.push(room)
    }
  }
  return publicRooms
}