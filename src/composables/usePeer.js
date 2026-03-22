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

export function useHostPeer(onDrawCommand) {
  const myPeerId      = ref('')
  const qrUrl         = ref('')
  const peerConnected = ref(false)
  let peer = null
  let activeConn = null

  // 推送當前抽獎狀態到遙控器
  function pushState(state) {
    if (activeConn && peerConnected.value) {
      try { activeConn.send({ type: 'STATE', ...state }) } catch {}
    }
  }

  function init() {
    peer = new Peer(PEER_CONFIG)

    peer.on('open', id => {
      myPeerId.value = id
      const remoteUrl = `${window.location.href.split('?')[0]}?remote=${id}`
      qrUrl.value = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(remoteUrl)}`
    })

    peer.on('connection', conn => {
      activeConn = conn
      peerConnected.value = true

      conn.on('data', data => {
        if (data?.type === 'DRAW') onDrawCommand(data.count ?? 1)
      })
      conn.on('close', () => {
        peerConnected.value = false
        activeConn = null
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
  }

  return { myPeerId, qrUrl, peerConnected, pushState, init, destroy }
}

export function useRemotePeer(targetId) {
  const remoteConnected = ref(false)
  const remoteError     = ref('')
  const remoteState     = ref(null) // { prize, remaining }
  let remotePeer = null
  let remoteConn = null

  function init() {
    remotePeer = new Peer(PEER_CONFIG)

    remotePeer.on('open', () => {
      remoteError.value = ''
      remoteConn = remotePeer.connect(targetId, { reliable: true })
      remoteConn.on('open',  () => { remoteConnected.value = true })
      remoteConn.on('close', () => { remoteConnected.value = false })
      remoteConn.on('data',  data => {
        if (data?.type === 'STATE') remoteState.value = data
      })
      remoteConn.on('error', err => { remoteError.value = err.message })
    })

    remotePeer.on('error', err => {
      const msg = {
        'peer-unavailable': '找不到主機，請確認主畫面已開啟',
        'network':          '網路連線問題，請確認 Wi-Fi',
        'server-error':     '伺服器錯誤，請稍後重試',
      }
      remoteError.value = msg[err.type] || `連線錯誤：${err.type}`
    })
  }

  function sendDraw(count = 1) {
    if (remoteConn && remoteConnected.value) remoteConn.send({ type: 'DRAW', count })
  }

  function destroy() {
    if (remotePeer) { remotePeer.destroy(); remotePeer = null }
  }

  return { remoteConnected, remoteError, remoteState, init, sendDraw, destroy }
}
