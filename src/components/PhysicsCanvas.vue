<template>
  <div style="position:relative;">
    <div class="canvas-wrap" ref="canvasWrap">
      <canvas ref="physicsCanvas"></canvas>
      <div class="canvas-glow" :class="{ spinning: isSpinning }"></div>
    </div>
    <div class="countdown-overlay" v-if="countdown > 0">
      <div class="countdown-ring">
        <div class="countdown-prize">{{ currentPrize?.name }} · 抽出 {{ drawCount }} 位</div>
        <div class="countdown-num" :key="countdown">{{ countdown }}</div>
        <div class="countdown-label">屏息以待</div>
      </div>
      <div class="countdown-dots">
        <span v-for="i in 5" :key="i" :class="{ on: i <= 6 - countdown }"></span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { usePhysics } from '../composables/usePhysics'

const props = defineProps({
  participants: { type: Array, required: true },
  isSpinning: { type: Boolean, default: false },
  countdown: { type: Number, default: 0 },
  currentPrize: { type: Object, default: null },
  drawCount: { type: Number, default: 1 },
})

const emit = defineEmits(['ready'])

const canvasWrap = ref(null)
const physicsCanvas = ref(null)
const isSpinningRef = ref(props.isSpinning)

const { init, destroy, setSwirl, getBodies } = usePhysics()

watch(() => props.isSpinning, val => { isSpinningRef.value = val })

function rebuild() {
  destroy()
  setTimeout(() => {
    if (canvasWrap.value && physicsCanvas.value) {
      init(canvasWrap.value, physicsCanvas.value, props.participants, isSpinningRef)
      emit('ready', { getBodies })
    }
  }, 50)
}

// 參與者名單變動時自動重建（非抽獎中）
watch(() => props.participants, () => {
  if (!props.isSpinning) rebuild()
})

onMounted(() => {
  setTimeout(() => {
    init(canvasWrap.value, physicsCanvas.value, props.participants, isSpinningRef)
    emit('ready', { getBodies })
  }, 100)
})

onUnmounted(destroy)

defineExpose({ setSwirl, getBodies, rebuild })
</script>
