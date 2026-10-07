import { ref } from 'vue'
import Peer from 'peerjs'

const PEER_CONFIG = {
  host: '0.peerjs.com',
  port: 443,
  secure: true,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  },
}

export function useHostPeer(onDrawCommand, onSelectCommand) {
  const myPeerId      = ref('')
  const qrUrl         = ref('')
  const peerConnected = ref(false)
  let peer = null
  // 手機遙控器與後台可同時連線，狀態廣播給所有連線
  const conns = new Set()
  let lastState = null

  function sendState(conn, state) {
    try { conn.send({ type: 'STATE', ...state }) } catch {}
  }

  // 推送當前抽獎狀態到遙控器（含 spinning 狀態）
  function pushState(state) {
    lastState = state
    conns.forEach(conn => sendState(conn, state))
  }

  function init() {
    peer = new Peer(PEER_CONFIG)

    peer.on('open', id => {
      myPeerId.value = id
      const remoteUrl = `${window.location.href.split('?')[0]}?remote=${id}`
      qrUrl.value = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(remoteUrl)}`
    })

    peer.on('connection', conn => {
      conn.on('open', () => {
        conns.add(conn)
        peerConnected.value = true
        // 新連上的遙控器立即收到目前狀態
        if (lastState) sendState(conn, lastState)
      })
      conn.on('data', data => {
        if (data?.type === 'DRAW') onDrawCommand(data.count ?? 1)
        if (data?.type === 'SELECT' && onSelectCommand) onSelectCommand(data.idx)
      })
      conn.on('close', () => {
        conns.delete(conn)
        peerConnected.value = conns.size > 0
      })
    })

    peer.on('error', err => {
      console.warn('[PeerJS host error]', err.type, err.message)
      if (err.type === 'network' || err.type === 'server-error') {
        setTimeout(init, 3000)
      }
    })
  }

  function destroy() {
    if (peer) { peer.destroy(); peer = null }
    conns.clear()
    peerConnected.value = false
  }

  return { myPeerId, qrUrl, peerConnected, pushState, init, destroy }
}

// target：主畫面的 peer ID，或回傳最新 ID 的函式（主畫面重新整理後 ID 會變）
export function useRemotePeer(target) {
  const getTargetId = typeof target === 'function' ? target : () => target
  const remoteConnected    = ref(false)
  const remoteError        = ref('')
  const remoteState        = ref(null)    // { prize, remaining }
  const remoteIsSpinning   = ref(false)
  const reconnectCountdown = ref(0)
  let remotePeer = null
  let remoteConn = null
  let reconnectTick = null

  function scheduleReconnect() {
    if (reconnectTick) clearInterval(reconnectTick)
    reconnectCountdown.value = 5
    reconnectTick = setInterval(() => {
      reconnectCountdown.value--
      if (reconnectCountdown.value <= 0) {
        clearInterval(reconnectTick)
        reconnectTick = null
        if (remotePeer && !remotePeer.destroyed) openConn()
      }
    }, 1000)
  }

  function openConn() {
    const targetId = getTargetId()
    if (!targetId) { remoteError.value = '尚未取得主畫面 ID，請先開啟主畫面'; return }
    remoteConn = remotePeer.connect(targetId, { reliable: true })
    remoteConn.on('open', () => {
      remoteConnected.value = true
      remoteError.value = ''
      reconnectCountdown.value = 0
      if (reconnectTick) { clearInterval(reconnectTick); reconnectTick = null }
    })
    remoteConn.on('close', () => {
      remoteConnected.value = false
      remoteIsSpinning.value = false
      scheduleReconnect()
    })
    remoteConn.on('data', data => {
      if (data?.type === 'STATE') {
        remoteState.value = data
        remoteIsSpinning.value = data.spinning ?? false
      }
    })
    remoteConn.on('error', err => { remoteError.value = err.message })
  }

  function init() {
    remotePeer = new Peer(PEER_CONFIG)

    remotePeer.on('open', () => {
      remoteError.value = ''
      openConn()
    })

    remotePeer.on('error', err => {
      const msg = {
        'peer-unavailable': '找不到主機，請確認主畫面已開啟',
        'network':          '網路連線問題，請確認 Wi-Fi',
        'server-error':     '伺服器錯誤，請稍後重試',
      }
      remoteError.value = msg[err.type] || `連線錯誤：${err.type}`
      if (err.type === 'network' || err.type === 'server-error') scheduleReconnect()
    })
  }

  function sendDraw(count = 1) {
    if (remoteConn && remoteConnected.value) remoteConn.send({ type: 'DRAW', count })
  }

  // 切換主畫面目前的獎項（idx 為獎項清單的索引）
  function sendSelect(idx) {
    if (remoteConn && remoteConnected.value) remoteConn.send({ type: 'SELECT', idx })
  }

  function destroy() {
    if (reconnectTick) { clearInterval(reconnectTick); reconnectTick = null }
    if (remotePeer) { remotePeer.destroy(); remotePeer = null }
    remoteConn = null
    remoteConnected.value = false
    remoteIsSpinning.value = false
    reconnectCountdown.value = 0
  }

  return { remoteConnected, remoteError, remoteState, remoteIsSpinning, reconnectCountdown, init, sendDraw, sendSelect, destroy }
}
