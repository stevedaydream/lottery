import Matter from 'matter-js'

// 球色：朱紅、香檳、深栗、空心（以 null 表示只畫外框）
const BALL_COLORS = ['#E8452C', '#F3E3C3', null, '#F3E3C3', '#5A2A26']

// 依底色亮度決定文字顏色
function textColorFor(hex) {
  if (!hex) return '#F3E3C3'
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#170B0C' : '#FFF6EA'
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
      const r = Math.max(18, Math.min(38, W / names.length / 1.5))
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

      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      if (b._color) {
        ctx.fillStyle = b._color
        ctx.fill()
      } else {
        ctx.lineWidth = 2
        ctx.strokeStyle = spinning ? 'rgba(243,227,195,0.7)' : 'rgba(243,227,195,0.5)'
        ctx.stroke()
      }

      const fontSize = Math.max(8, Math.min(r * 0.5, 17))
      ctx.font = `700 ${fontSize}px "Noto Sans TC", sans-serif`
      ctx.fillStyle = textColorFor(b._color)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      const label = b.label
      if (label.length <= 3 || r >= 24) {
        ctx.fillText(label, x, y)
      } else {
        ctx.fillText(label.slice(0, 3), x, y - fontSize*0.5)
        ctx.fillText(label.slice(3, 6), x, y + fontSize*0.5)
      }
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
