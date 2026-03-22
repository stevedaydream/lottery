<template>
  <div class="card">
    <div class="card-title">📱 手機遙控</div>
    <div class="qr-wrap">
      <img v-if="qrUrl" :src="qrUrl" alt="QR Code">
      <div class="conn-status">
        <div class="status-dot" :class="peerConnected ? 'connected' : 'waiting'"></div>
        <span>{{ peerConnected ? '手機已連線' : '等待手機掃描' }}</span>
      </div>
      <div class="peer-id-box">ID: {{ myPeerId || '初始化中...' }}</div>
    </div>

  </div>
</template>

<script setup>
defineProps({
  qrUrl: { type: String, default: '' },
  peerConnected: { type: Boolean, default: false },
  myPeerId: { type: String, default: '' },
  vipGuarantee: { type: String, default: '' },
  vipExclude: { type: String, default: '' },
})
defineEmits(['update:vipGuarantee', 'update:vipExclude'])
</script>
