/* Run with: node tests/player-regressions.cjs
 * Uses local, disposable Socket.IO rooms. No provider or live Space is contacted.
 */
require("ts-node").register({ transpileOnly: true, compilerOptions: { module: "CommonJS" } })
const assert = require("node:assert/strict")
const http = require("node:http")
const { once } = require("node:events")
const { io } = require("socket.io-client")
const { reorderPlaylist, youtubeId, mediaTitle, isImageSource } = require("../lib/media.ts")
const { default: socketHandler } = require("../pages/api/socketio.ts")

const track = (id) => ({ title: `Track ${id}`, src: [{ src: `https://example.com/${id}.mp4`, resolution: "" }], sub: [] })

function unitTests() {
  const items = [0, 1, 2, 3].map(track)
  for (let current = -1; current < items.length; current++) {
    for (let from = 0; from < items.length; from++) {
      for (let to = 0; to < items.length; to++) {
        const original = { items, currentIndex: current }
        const result = reorderPlaylist(original, from, to)
        assert.deepEqual(original, { items, currentIndex: current }, "reordering must not mutate its input")
        assert.equal(result.items.length, items.length)
        assert.equal(new Set(result.items).size, items.length)
        if (current >= 0) assert.equal(result.items[result.currentIndex], items[current], "the same track must stay selected across every reorder")
        else assert.equal(result.currentIndex, -1)
      }
    }
  }
  assert.equal(youtubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ")
  assert.equal(youtubeId("https://youtu.be/dQw4w9WgXcQ?t=20"), "dQw4w9WgXcQ")
  assert.equal(youtubeId("https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ"), null)
  assert.equal(youtubeId("https://youtu.be/invalid"), null)
  assert.equal(isImageSource("https://example.com/welcome.webp?width=500"), true)
  assert.equal(mediaTitle({ src: [], sub: [] }), "Your next favorite starts here")
}

function update(socket, action, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { socket.off("update", listener); reject(new Error("Timed out waiting for room update")) }, 5000)
    const listener = (room) => { if (predicate(room)) { clearTimeout(timeout); socket.off("update", listener); resolve(room) } }
    socket.on("update", listener)
    action()
  })
}

async function integrationTests() {
  const server = http.createServer((request, response) => socketHandler(request, response))
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const base = `http://127.0.0.1:${server.address().port}`
  await fetch(`${base}/api/socketio`)
  const sockets = []
  const connect = async (name) => {
    const socket = io(base, { path: "/api/socketio", transports: ["websocket"], query: { roomId: "regression-room", userName: name }, forceNew: true })
    sockets.push(socket)
    await once(socket, "connect")
    await update(socket, () => socket.emit("fetch"))
    return socket
  }
  try {
    const host = await connect("Host")
    const guest = await connect("Guest")
    let room = await update(host, () => host.emit("fetch"))
    assert.equal(room.ownerId, host.id)
    assert.equal(room.users.length, 2)

    room = await update(host, () => host.emit("updatePlaylist", { items: [0, 1, 2, 3].map(track), currentIndex: 2 }))
    await update(host, () => host.emit("setPaused", true))
    room = await update(host, () => host.emit("playItemFromPlaylist", 2))
    assert.equal(room.targetState.paused, false, "selecting a queued track must start playback")
    assert.equal(room.targetState.playing.title, "Track 2")

    guest.emit("playEnded")
    room = await update(guest, () => guest.emit("fetch"))
    assert.equal(room.targetState.playlist.currentIndex, 2, "a listener's end event must not advance the queue")
    assert.equal(room.targetState.playlist.items.length, 4)
    room = await update(host, () => host.emit("playEnded"))
    assert.equal(room.targetState.playlist.currentIndex, 2, "mid-queue completion must select the shifted next track")
    assert.equal(room.targetState.playing.title, "Track 3")
    assert.deepEqual(room.targetState.playlist.items.map((item) => item.title), ["Track 0", "Track 1", "Track 3"])

    // Playing a source outside the queue must not splice away its final item.
    await update(host, () => host.emit("updatePlaylist", { items: [0, 1].map(track), currentIndex: -1 }))
    room = await update(host, () => host.emit("playEnded"))
    assert.equal(room.targetState.playlist.items.length, 2)
    assert.equal(room.targetState.playlist.currentIndex, 0)

    await update(host, () => host.emit("setLoop", true))
    room = await update(host, () => host.emit("playEnded"))
    assert.equal(room.targetState.progress, 0)
    assert.equal(room.targetState.paused, false)
    assert.equal(room.targetState.playlist.items.length, 2)
    await update(host, () => host.emit("setLoop", false))

    room = await update(host, () => host.emit("playUrl", "https://example.com/song.mp4", { title: "Search result title", thumbnail: "https://example.com/cover.jpg" }))
    assert.equal(room.targetState.playing.title, "Search result title")
    assert.equal(room.targetState.playing.thumbnail, "https://example.com/cover.jpg")
    room = await update(host, () => host.emit("addToPlaylist", "https://example.com/legacy.mp4"))
    assert.equal(room.targetState.playlist.items.at(-1).src[0].src, "https://example.com/legacy.mp4", "legacy one-argument events remain compatible")

    guest.emit("setMusicMode", true)
    room = await update(guest, () => guest.emit("fetch"))
    assert.equal(room.musicMode, false)
    room = await update(host, () => host.emit("setMusicMode", true))
    assert.equal(room.musicMode, true)

    const messageReceived = once(guest, "chatNew")
    host.emit("chatMessage", "Hello from the listening room")
    await messageReceived
    room = await update(guest, () => guest.emit("fetch"))
    assert.equal(room.chatLog.at(-1).text, "Hello from the listening room", "late-mounted chat panels must recover history from fetch")

    const newOwner = update(guest, () => host.disconnect(), (state) => state.ownerId === guest.id)
    room = await newOwner
    assert.equal(room.users.length, 1, "ownership must transfer after the host leaves")
  } finally {
    sockets.forEach((socket) => socket.disconnect())
    if (server.io) await new Promise((resolve) => server.io.close(resolve))
    if (server.listening) await new Promise((resolve) => server.close(resolve))
  }
}

async function main() {
  unitTests()
  const log = console.log
  console.log = () => {}
  try { await integrationTests() } finally { console.log = log }
  console.log("PASS: 80 queue reorder combinations, media parsing, and two-client playback/queue/chat/ownership regressions.")
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
