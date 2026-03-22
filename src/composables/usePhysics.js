import Matter from 'matter-js'

const BALL_COLORS = [
  '#CC0000','#B8860B','#8B0000','#DAA520','#A0522D',
  '#CD853F','#8B4513','#D2691E','#C0392B','#E74C3C',
]

function lightenColor(hex, amount) {
  const r = Math.min(255, parseInt(hex.slice(1,3),16) + amount)
  const g = Math.min(255, parseInt(hex.slice(3,5),16) + amount)
  const b = Math.min(255, parseInt(hex.slice(5,7),16) + amount)
  return `rgb(${r},${g},${b})`
}

function darkenColor(hex, amount) {
  const r = Math.max(0, parseInt(hex.slice(1,3),16) - amount)
  const g = Math.max(0, parseInt(hex.slice(3,5),16) - amount)
  const b = Math.max(0, parseInt(hex.slice(5,7),16) - amount)
  return `rgb(${r},${g},${b})`
}

export function usePhysics() {
  let engine = null
  let bodies = []
  let walls = []
  let animFrameId = null
  let swirlAngle = 0
  let swirlStrength = 0
  let isSpinningRef = null

  function init(canvasWrapEl, canvasEl, names, spinningRef) {
    isSpinningRef = spinningRef
    const W = canvasWrapEl.clientWidth
    const H = canvasWrapEl.clientHeight
    canvasEl.width = W
    canvasEl.height = H

    engine = Matter.Engine.create({ gravity: { x: 0, y: 0 } })

    const wallOpts = { isStatic: true, restitution: 0.7, friction: 0 }
    const thick = 30
    walls = [
      Matter.Bodies.rectangle(W/2, -thick/2, W+thick*2, thick, wallOpts),
      Matter.Bodies.rectangle(W/2, H+thick/2, W+thick*2, thick, wallOpts),
      Matter.Bodies.rectangle(-thick/2, H/2, thick, H+thick*2, wallOpts),
      Matter.Bodies.rectangle(W+thick/2, H/2, thick, H+thick*2, wallOpts),
    ]
    Matter.World.add(engine.world, walls)

    bodies = []
    names.forEach((name, i) => {
      const r = Math.max(18, Math.min(32, W / names.length / 1.5))
      const body = Matter.Bodies.circle(
        Math.random() * (W - r*2) + r,
        Math.random() * (H - r*2) + r,
        r,
        { restitution: 0.85, friction: 0, frictionAir: 0.005, label: name }
      )
      body._color = BALL_COLORS[i % BALL_COLORS.length]
      body._radius = r
      Matter.Body.setVelocity(body, {
        x: (Math.random() - 0.5) * 4,
        y: (Math.random() - 0.5) * 4,
      })
      bodies.push(body)
    })
    Matter.World.add(engine.world, bodies)

    drawLoop(canvasEl)
  }

  function drawLoop(canvasEl) {
    if (!canvasEl) return
    const ctx = canvasEl.getContext('2d')
    const W = canvasEl.width
    const H = canvasEl.height

    Matter.Engine.update(engine, 1000/60)

    if (swirlStrength > 0) {
      swirlAngle += 0.05
      bodies.forEach(b => {
        const dx = b.position.x - W/2
        const dy = b.position.y - H/2
        const dist = Math.sqrt(dx*dx + dy*dy) + 1
        const tangX = -dy / dist
        const tangY = dx / dist
        Matter.Body.applyForce(b, b.position, {
          x: tangX * swirlStrength * 0.002,
          y: tangY * swirlStrength * 0.002,
        })
        Matter.Body.applyForce(b, b.position, {
          x: -dx / dist * 0.0004,
          y: -dy / dist * 0.0004,
        })
      })
    } else {
      bodies.forEach(b => {
        if (Math.random() < 0.02) {
          Matter.Body.applyForce(b, b.position, {
            x: (Math.random() - 0.5) * 0.002,
            y: (Math.random() - 0.5) * 0.002,
          })
        }
      })
    }

    ctx.clearRect(0, 0, W, H)
    const spinning = isSpinningRef ? isSpinningRef.value : false

    bodies.forEach(b => {
      const r = b._radius
      const x = b.position.x
      const y = b.position.y

      ctx.save()
      ctx.shadowColor = b._color
      ctx.shadowBlur = spinning ? 18 : 8

      const grad = ctx.createRadialGradient(x - r*0.3, y - r*0.3, r*0.05, x, y, r)
      grad.addColorStop(0, lightenColor(b._color, 60))
      grad.addColorStop(0.5, b._color)
      grad.addColorStop(1, darkenColor(b._color, 40))

      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fillStyle = grad
      ctx.fill()
      ctx.restore()

      ctx.save()
      ctx.beginPath()
      ctx.arc(x - r*0.28, y - r*0.28, r*0.32, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.2)'
      ctx.fill()
      ctx.restore()

      const fontSize = Math.max(8, Math.min(r * 0.62, 14))
      ctx.font = `bold ${fontSize}px "Noto Serif TC", serif`
      ctx.fillStyle = '#fff'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.shadowColor = 'rgba(0,0,0,0.6)'
      ctx.shadowBlur = 3

      const label = b.label
      if (label.length <= 3 || r >= 24) {
        ctx.fillText(label, x, y)
      } else {
        ctx.fillText(label.slice(0, 3), x, y - fontSize*0.5)
        ctx.fillText(label.slice(3, 6), x, y + fontSize*0.5)
      }
      ctx.shadowBlur = 0
    })

    animFrameId = requestAnimationFrame(() => drawLoop(canvasEl))
  }

  function destroy() {
    if (animFrameId) cancelAnimationFrame(animFrameId)
    if (engine) Matter.World.clear(engine.world)
    engine = null
    bodies = []
    walls = []
    animFrameId = null
  }

  function setSwirl(strength) {
    swirlStrength = strength
  }

  function getBodies() {
    return bodies
  }

  return { init, destroy, setSwirl, getBodies }
}
