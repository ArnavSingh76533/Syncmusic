/* Run with: node tests/player-regressions.cjs
 * Uses local, disposable Socket.IO rooms. No provider or live Space is contacted.
 */
require("ts-node").register({ transpileOnly: true, compilerOptions: { module: "CommonJS" } })
const assert = require("node:assert/strict")
const http = require("node:http")
const { once } = require("node:events")
const { io } = require("socket.io-client")
const { reorderPlaylist, youtubeId, mediaTitle, isImageSource } = require("../lib/media.ts")
const { playbackCorrection, bindPlaybackLifecycle, resumeProvider, providerIsPlaying } = require("../lib/playback.ts")
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
  const state = { paused: false, progress: 0, lastSync: 100, playbackRate: 1 }
  const correction = { target: state, actual: 1, duration: 180, serverOffset: 0, host: true, appliedRevision: 100, hidden: false, buffering: false, now: 125 }
  assert.equal(playbackCorrection(correction), null, "a host must not skip 25 seconds because the provider took time to load")
  assert.equal(playbackCorrection({ ...correction, appliedRevision: null }), 0, "initial host playback starts at the requested time")
  assert.equal(playbackCorrection({ ...correction, host: false }), 25, "listeners still synchronize to the shared clock")
  assert.equal(playbackCorrection({ ...correction, host: false, hidden: true }), null, "background playback must not be interrupted by corrective seeks")
  assert.equal(playbackCorrection({ ...correction, host: false, buffering: true }), null, "buffering must not trigger repeated corrective seeks")
  assert.equal(playbackCorrection({ ...correction, target: { ...state, lastSync: 125, progress: 60 } }), 60, "explicit host seeks are still applied")
  assert.equal(playbackCorrection({ ...correction, host: false, target: { ...state, paused: true, progress: 15 } }), 15, "paused rooms do not extrapolate their clock")
  assert.equal(playbackCorrection({ ...correction, host: false, duration: 20 }), 20, "corrections cannot seek beyond the media duration")
  let youtubePlays = 0, nativePlays = 0, blocked = 0
  resumeProvider({ playVideo: () => youtubePlays++, play: () => { throw Error("wrong provider API") } }, () => blocked++)
  assert.equal(youtubePlays, 1, "YouTube recovery must use playVideo directly, as the legacy player did")
  assert.equal(blocked, 0)
  resumeProvider({ play: () => { nativePlays++ } }, () => blocked++)
  assert.equal(nativePlays, 1, "native media still uses play")
  resumeProvider({ ended: true, play: () => { nativePlays++ } }, () => blocked++)
  assert.equal(nativePlays, 1, "ended files must not be restarted by pause recovery")
  resumeProvider({ playVideo: () => { throw Error("not available") } }, () => blocked++)
  assert.equal(blocked, 1, "provider failures expose a user-action recovery state")
  assert.equal(providerIsPlaying({ getPlayerState: () => 1 }), true)
  assert.equal(providerIsPlaying({ getPlayerState: () => 2 }), false)
  assert.equal(providerIsPlaying({ paused: false, ended: false }), true)
  assert.equal(providerIsPlaying({ paused: false, ended: true }), false)
  const page = new EventTarget(), windowEvents = new EventTarget()
  page.visibilityState = "hidden"
  let resumes = 0, refreshes = 0, shouldPlay = true
  const unbind = bindPlaybackLifecycle(page, windowEvents, { resume: () => resumes++, refresh: () => refreshes++, shouldPlay: () => shouldPlay })
  page.dispatchEvent(new Event("visibilitychange"))
  assert.equal(resumes, 0, "a background transition leaves the playing provider untouched")
  assert.equal(refreshes, 0, "hiding the page must not reset or fetch the player")
  page.visibilityState = "visible"
  page.dispatchEvent(new Event("visibilitychange"))
  assert.equal(resumes, 0)
  assert.equal(refreshes, 1)
  shouldPlay = false
  windowEvents.dispatchEvent(new Event("pageshow"))
  assert.equal(resumes, 0, "returning to a paused room must not restart playback")
  assert.equal(refreshes, 2)
  unbind()
  windowEvents.dispatchEvent(new Event("online"))
  assert.equal(refreshes, 2, "unmounted players must release lifecycle handlers")

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
    const source = room.targetState.playing.src[0].src
    let revision = room.targetState.lastSync
    let acknowledged = null
    room = await update(host, () => host.emit("syncPlayback", { src: source, lastSync: revision, progress: 1 }, (value) => { acknowledged = value }))
    assert.equal(room.targetState.progress, 1, "the host's real playhead replaces elapsed loading time")
    assert.equal(acknowledged, room.targetState.lastSync, "clock acknowledgements arrive before room updates to prevent host seek-back")
    assert.ok(room.targetState.lastSync > revision)
    const stable = JSON.stringify(room.targetState)
    guest.emit("syncPlayback", { src: source, lastSync: room.targetState.lastSync, progress: 99 })
    room = await update(guest, () => guest.emit("fetch"))
    assert.equal(JSON.stringify(room.targetState), stable, "listeners cannot replace the host clock")
    for (const snapshot of [
      { src: source, lastSync: revision, progress: 80 },
      { src: "https://example.com/previous.mp4", lastSync: room.targetState.lastSync, progress: 80 },
      { src: source, lastSync: room.targetState.lastSync, progress: -1 },
    ]) {
      host.emit("syncPlayback", snapshot)
      room = await update(host, () => host.emit("fetch"))
      assert.equal(JSON.stringify(room.targetState), stable, "stale or invalid recovery events cannot change playback")
    }
    room = await update(host, () => host.emit("seek", 40))
    host.emit("syncPlayback", { src: source, lastSync: acknowledged, progress: 1 })
    room = await update(host, () => host.emit("fetch"))
    assert.equal(room.targetState.progress, 40, "a late play event cannot undo a newer seek")
    room = await update(host, () => host.emit("setPaused", true))
    const paused = JSON.stringify(room.targetState)
    host.emit("syncPlayback", { src: source, lastSync: room.targetState.lastSync, progress: 70 })
    room = await update(host, () => host.emit("fetch"))
    assert.equal(JSON.stringify(room.targetState), paused, "background recovery must respect an explicit pause")
    room = await update(host, () => host.emit("setPaused", false))


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
    const preserved = JSON.stringify(room.targetState)
    // Simulate an app switch dropping the transport, not an intentional Leave.
    const reconnected = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Reconnect timed out")), 5000)
      guest.once("connect", () => { clearTimeout(timeout); resolve() })
    })
    guest.io.engine.close()
    await reconnected
    room = await update(guest, () => guest.emit("fetch"))
    assert.equal(JSON.stringify(room.targetState), preserved, "a temporary background disconnect must preserve the track and queue")
    assert.equal(room.ownerId, guest.id, "the returning solo listener regains host controls")
    assert.equal(room.users.length, 1)
    assert.equal(room.chatLog.at(-1).text, "Hello from the listening room", "reconnection preserves chat as well as playback")

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
  console.log("PASS: 80 queue reorders; background lifecycle and seek timing; two-client clock, reconnect, playback, queue, chat and ownership regressions.")
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
