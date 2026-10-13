(function (window) {

    // ============================================================
    // CONSTANTS
    // ============================================================
    const POWERUP_TYPES   = ['rapidfire', 'shield', 'triple', 'bomb']
    const POWERUP_COLORS  = { rapidfire: '#FF8C00', shield: '#00BFFF', triple: '#9B30FF', bomb: '#FF2222' }
    const POWERUP_LABELS  = { rapidfire: '⚡ RAPIDFIRE', shield: '◈ ESCUDO', triple: '⊕ TRIPLE', bomb: '✸ BOMBA!' }
    const POWERUP_ICONS   = { rapidfire: '⚡', shield: '◈', triple: '⊕', bomb: '✸' }

    // ============================================================
    // GAME
    // ============================================================
    let Game = {
        init: function () {
            this.c   = document.getElementById("game")
            this.c.width  = this.c.width
            this.c.height = this.c.height
            this.ctx = this.c.getContext("2d")
            this.color = "rgba(20,20,20,.7)"

            // collections
            this.bullets      = {}
            this.enemyBullets = {}
            this.enemies      = {}
            this.particles    = {}
            this.powerUps     = {}
            this.floatingTexts = {}

            // indices
            this.bulletIndex       = 0
            this.enemyBulletIndex  = 0
            this.enemyIndex        = 0
            this.particleIndex     = 0
            this.powerUpIndex      = 0
            this.floatingTextIndex = 0

            // state
            this.frameCount    = 1
            this.maxParticles  = 10
            this.maxEnemies    = 6
            this.enemiesAlive  = 0
            this.currentFrame  = 0
            this.maxLives      = 5
            this.life          = 0
            this.score         = 0
            this.highScore     = parseInt(localStorage.getItem('warInSpaceHS') || '0')
            this.paused        = false
            this.shooting      = false
            this.oneShot       = false
            this.isGameOver    = false

            // difficulty
            this.difficulty       = 1
            this.levelUpTimer     = 0
            this.speedMultiplier  = 1.0
            this.levelFlash       = 0
            this.lastTimestamp    = 0
            this.elapsedTime      = 0
            this.nextDifficultyAt = 20

            // boss
            this.boss       = null
            this.bossActive = false
            this.bossCount  = 0
            this.nextBossAt = 5

            // combo
            this.combo           = 0
            this.comboTimer      = 0
            this.comboMultiplier = 1
            this.comboScale      = 1.0

            // effects
            this.shakeTimer    = 0
            this.blinkTimer    = 0
            this.blinkVisible  = true
            this.dt            = 1 / 60

            this.requestAnimationFrame = window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame

            // shared AudioContext — created once, reused for all synth sounds
            if (!this.audioCtx) {
                try { this.audioCtx = new (window.AudioContext || window.webkitAudioContext)() } catch (e) {}
            }

            this.binding()
            this.player = new Player()

            for (let i = 0; i < this.maxEnemies; i++) {
                new Enemy()
                this.enemiesAlive++
            }

            // cleanup previous video/audio on restart
            if (this.video) {
                this.video.pause()
                this.video.src = ""
                if (this.video.parentNode) this.video.parentNode.removeChild(this.video)
            }
            if (this.audio) {
                this.audio.pause()
                this.audio.src = ""
            }

            this.video            = document.createElement("video")
            this.video.id         = "gameVideo"
            this.video.width      = this.c.width
            this.video.height     = this.c.height
            this.video.style.position  = "absolute"
            this.video.style.top       = "45%"
            this.video.style.left      = "50%"
            this.video.style.transform = "translate(-50%, -50%)"
            this.video.style.zIndex    = "-1"
            this.video.loop      = true
            this.video.muted     = true
            this.video.playsInline = true
            this.video.src       = "video/espacio.mp4"

            this.video.addEventListener('loadeddata', () => {
                this.video.play().catch(() => {})
                this.audio.play().catch(() => {})
                this.loop()
            })

            document.body.appendChild(this.video)

            this.audio = new Audio('sounds/fondo.mp3')
            this.audio.loop   = true
            this.audio.volume = 0.3
            this.sfxLaser = new Audio('sounds/laser.mp3')
            this.sfxLaser.volume = 0.4
            this.sfxExplosion = new Audio('sounds/explosion.mp3')
            this.sfxExplosion.volume = 0.5
        },

        binding: function () {
            window.addEventListener("keydown",  this.buttonDown)
            window.addEventListener("keyup",    this.buttonUp)
            window.addEventListener("keypress", this.keyPressed)
            this.c.addEventListener("click",    this.clicked)
        },

        clicked: function () {
            if (!Game.paused) {
                Game.pause()
                Game.audio.pause()
                Game.video.pause()
            } else {
                if (Game.isGameOver) {
                    Game.init()
                } else {
                    Game.unPause()
                    Game.loop()
                    Game.invincibleMode(1000)
                    Game.audio.play()
                }
            }
        },

        keyPressed: function (e) {
            if (e.key === ' ') {
                if ((!Game.player.invincible || Game.player.shield > 0) && !Game.oneShot) {
                    Game.player.shoot()
                    Game.oneShot = true
                }
                e.preventDefault()
            }
        },

        buttonUp: function (e) {
            if (e.key === ' ') { Game.shooting = false; Game.oneShot = false; e.preventDefault() }
            if (e.key === 'ArrowLeft'  || e.key.toLowerCase() === 'a') Game.player.movingLeft  = false
            if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') Game.player.movingRight = false
        },

        buttonDown: function (e) {
            if (e.key === ' ')                                           Game.shooting           = true
            if (e.key === 'ArrowLeft'  || e.key.toLowerCase() === 'a') Game.player.movingLeft  = true
            if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') Game.player.movingRight = true
        },

        random: function (min, max) {
            return Math.floor(Math.random() * (max - min) + min)
        },

        invincibleMode: function (ms) {
            this.player.invincible      = true
            this.player.invincibleTimer = ms / 1000
        },

        collision: function (a, b) {
            return !(
                (a.y + a.height) < b.y  ||
                a.y > (b.y + b.height)  ||
                (a.x + a.width)  < b.x  ||
                a.x > (b.x + b.width)
            )
        },

        clear: function () {
            this.ctx.fillStyle = Game.color
            this.ctx.fillRect(0, 0, this.c.width, this.c.height)
        },

        pause:   function () { this.paused = true },
        unPause: function () { this.paused = false; this.lastTimestamp = 0 },

        increaseDifficulty: function () {
            this.difficulty++
            this.levelUpTimer    = 3
            this.levelFlash      = 0.8
            this.speedMultiplier = 1 + (this.difficulty - 1) * 0.1
            this.playLevelUpSound()

            // boss interval shrinks each wave: 5 → 4 → 3 → 2 → 2 → ...
            if (this.difficulty === this.nextBossAt) {
                this.bossCount++
                this.nextBossAt += Math.max(2, 5 - this.bossCount)
                new Boss()
                return
            }

            const newMax = Math.min(12, 6 + Math.floor((this.difficulty - 1) / 2))
            if (newMax > this.maxEnemies) {
                const toSpawn = newMax - this.maxEnemies
                this.maxEnemies = newMax
                for (let i = 0; i < toSpawn; i++) {
                    this.enemiesAlive++
                    setTimeout(() => { new Enemy() }, this.random(300, 1200) + i * 500)
                }
            } else {
                this.maxEnemies = newMax
            }
        },

        _ac: function () {
            const ac = Game.audioCtx
            if (!ac) return null
            if (ac.state === 'suspended') ac.resume()
            return ac
        },

        playLevelUpSound: function () {
            const ac = this._ac(); if (!ac) return
            const osc = ac.createOscillator(), gain = ac.createGain()
            osc.connect(gain); gain.connect(ac.destination)
            osc.type = 'square'
            osc.frequency.setValueAtTime(523, ac.currentTime)
            osc.frequency.setValueAtTime(659, ac.currentTime + 0.1)
            osc.frequency.setValueAtTime(784, ac.currentTime + 0.2)
            gain.gain.setValueAtTime(0.12, ac.currentTime)
            gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.5)
            osc.start(); osc.stop(ac.currentTime + 0.5)
        },

        playTripleShotSound: function () {
            const ac = this._ac(); if (!ac) return
            for (let i = 0; i < 3; i++) {
                const osc = ac.createOscillator(), gain = ac.createGain()
                osc.connect(gain); gain.connect(ac.destination)
                osc.type = 'sawtooth'
                const t = ac.currentTime + i * 0.035
                osc.frequency.setValueAtTime(1400 - i * 200, t)
                osc.frequency.exponentialRampToValueAtTime(300, t + 0.1)
                gain.gain.setValueAtTime(0.11, t)
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12)
                osc.start(t); osc.stop(t + 0.15)
            }
        },

        playBombSound: function () {
            const ac = this._ac(); if (!ac) return
            // noise burst — louder and longer
            const dur = 1.1, bufSize = Math.floor(ac.sampleRate * dur)
            const buf = ac.createBuffer(1, bufSize, ac.sampleRate)
            const data = buf.getChannelData(0)
            for (let i = 0; i < bufSize; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 0.3)
            }
            const src = ac.createBufferSource()
            src.buffer = buf
            const filter = ac.createBiquadFilter()
            filter.type = 'lowpass'
            filter.frequency.setValueAtTime(700, ac.currentTime)
            filter.frequency.exponentialRampToValueAtTime(30, ac.currentTime + dur)
            const gain = ac.createGain()
            gain.gain.setValueAtTime(5.0, ac.currentTime)
            gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur)
            src.connect(filter); filter.connect(gain); gain.connect(ac.destination)
            src.start()
            // sub-bass kick thump
            const kick = ac.createOscillator(), kickGain = ac.createGain()
            kick.connect(kickGain); kickGain.connect(ac.destination)
            kick.type = 'sine'
            kick.frequency.setValueAtTime(130, ac.currentTime)
            kick.frequency.exponentialRampToValueAtTime(18, ac.currentTime + 0.35)
            kickGain.gain.setValueAtTime(4.0, ac.currentTime)
            kickGain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.4)
            kick.start(); kick.stop(ac.currentTime + 0.4)
        },

        playHitSound: function () {
            const ac = this._ac(); if (!ac) return
            // tono descendente (impacto)
            const osc = ac.createOscillator(), gain = ac.createGain()
            osc.connect(gain); gain.connect(ac.destination)
            osc.type = 'sawtooth'
            osc.frequency.setValueAtTime(260, ac.currentTime)
            osc.frequency.exponentialRampToValueAtTime(38, ac.currentTime + 0.32)
            gain.gain.setValueAtTime(0.38, ac.currentTime)
            gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.36)
            osc.start(); osc.stop(ac.currentTime + 0.36)
            // burst de ruido corto (crujido)
            const bufSize = Math.floor(ac.sampleRate * 0.12)
            const buf = ac.createBuffer(1, bufSize, ac.sampleRate)
            const data = buf.getChannelData(0)
            for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 1.8)
            const src = ac.createBufferSource()
            src.buffer = buf
            const filter = ac.createBiquadFilter()
            filter.type = 'bandpass'
            filter.frequency.setValueAtTime(500, ac.currentTime)
            const ng = ac.createGain()
            ng.gain.setValueAtTime(1.2, ac.currentTime)
            ng.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.12)
            src.connect(filter); filter.connect(ng); ng.connect(ac.destination)
            src.start()
        },

        playPowerUpSound: function (type) {
            const ac = this._ac(); if (!ac) return
            switch (type) {
                case 'rapidfire': {
                    const o = ac.createOscillator(), g = ac.createGain()
                    o.connect(g); g.connect(ac.destination); o.type = 'square'
                    o.frequency.setValueAtTime(440, ac.currentTime)
                    o.frequency.setValueAtTime(880, ac.currentTime + 0.06)
                    o.frequency.setValueAtTime(1320, ac.currentTime + 0.12)
                    g.gain.setValueAtTime(0.14, ac.currentTime)
                    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.22)
                    o.start(); o.stop(ac.currentTime + 0.22); break
                }
                case 'shield': {
                    const o = ac.createOscillator(), g = ac.createGain()
                    o.connect(g); g.connect(ac.destination); o.type = 'sine'
                    o.frequency.setValueAtTime(220, ac.currentTime)
                    o.frequency.linearRampToValueAtTime(550, ac.currentTime + 0.35)
                    g.gain.setValueAtTime(0.18, ac.currentTime)
                    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.4)
                    o.start(); o.stop(ac.currentTime + 0.4); break
                }
                case 'triple': {
                    for (let i = 0; i < 3; i++) {
                        const o = ac.createOscillator(), g = ac.createGain()
                        o.connect(g); g.connect(ac.destination); o.type = 'triangle'
                        const t = ac.currentTime + i * 0.075
                        o.frequency.setValueAtTime(500 + i * 250, t)
                        g.gain.setValueAtTime(0.14, t)
                        g.gain.exponentialRampToValueAtTime(0.001, t + 0.1)
                        o.start(t); o.stop(t + 0.1)
                    }
                    break
                }
                case 'bomb': {
                    const o = ac.createOscillator(), g = ac.createGain()
                    o.connect(g); g.connect(ac.destination); o.type = 'sawtooth'
                    o.frequency.setValueAtTime(420, ac.currentTime)
                    o.frequency.exponentialRampToValueAtTime(35, ac.currentTime + 0.45)
                    g.gain.setValueAtTime(0.55, ac.currentTime)
                    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.5)
                    o.start(); o.stop(ac.currentTime + 0.5); break
                }
            }
        },

        drawVideo: function () {
            if (this.video.paused) this.video.play().catch(() => {})
            this.ctx.drawImage(this.video, 0, 0, this.c.width, this.c.height)
        },

        gameOver: function () {
            this.isGameOver = true
            this.pause()
            this.audio.pause()

            const isNewRecord = this.score > 0 && this.score >= this.highScore
            if (this.score > this.highScore) {
                this.highScore = this.score
                localStorage.setItem('warInSpaceHS', this.highScore)
            }

            const ctx = this.ctx
            const W   = this.c.width
            const H   = this.c.height
            const cx  = W / 2
            const cy  = H / 2

            // dark overlay
            ctx.fillStyle = 'rgba(0,0,0,0.75)'
            ctx.fillRect(0, 0, W, H)

            // vignette — dark space feel
            const vig = ctx.createRadialGradient(cx, cy, H * 0.1, cx, cy, H * 0.85)
            vig.addColorStop(0, 'rgba(0,10,20,0)')
            vig.addColorStop(1, 'rgba(0,0,0,0.62)')
            ctx.fillStyle = vig
            ctx.fillRect(0, 0, W, H)

            // panel — misma estética que el HUD
            const pw = Math.min(400, W - 60)
            const ph = 278
            const px = cx - pw / 2
            const py = cy - ph / 2 - 10

            this._roundRect(px, py, pw, ph, 14)
            ctx.fillStyle   = 'rgba(0,0,0,0.82)'
            ctx.fill()
            ctx.strokeStyle = isNewRecord ? 'rgba(255,215,0,0.45)' : 'rgba(0,225,255,0.35)'
            ctx.lineWidth   = 1.5
            ctx.stroke()

            // top accent line — cian como el panel PUNTAJE
            ctx.save()
            ctx.strokeStyle = isNewRecord ? '#FFD700' : 'rgba(0,225,255,0.85)'
            ctx.lineWidth   = 2
            ctx.shadowColor = ctx.strokeStyle
            ctx.shadowBlur  = 10
            ctx.beginPath()
            ctx.moveTo(px + 22, py + 1)
            ctx.lineTo(px + pw - 22, py + 1)
            ctx.stroke()
            ctx.restore()

            // "GAME OVER" title — blanco con glow cian
            ctx.save()
            ctx.textAlign   = 'center'
            ctx.font        = 'bold 58px Lato, sans-serif'
            ctx.fillStyle   = '#ffffff'
            ctx.shadowColor = 'rgba(0,225,255,0.75)'
            ctx.shadowBlur  = 32
            ctx.fillText('GAME OVER', cx, py + 73)
            ctx.restore()

            // divider — cian tenue
            ctx.save()
            ctx.strokeStyle = 'rgba(0,225,255,0.12)'
            ctx.lineWidth   = 1
            ctx.beginPath(); ctx.moveTo(px + 28, py + 92); ctx.lineTo(px + pw - 28, py + 92); ctx.stroke()
            ctx.restore()

            // score label — mismo estilo que etiqueta HUD
            ctx.save()
            ctx.textAlign = 'center'
            ctx.font      = 'bold 8px Lato, sans-serif'
            ctx.fillStyle = 'rgba(0,225,255,0.55)'
            ctx.fillText('S C O R E', cx, py + 117)
            ctx.restore()

            // score value — igual al HUD
            ctx.save()
            ctx.textAlign   = 'center'
            ctx.font        = 'bold 46px Lato, sans-serif'
            ctx.fillStyle   = '#ffffff'
            ctx.shadowColor = 'rgba(0,225,255,0.45)'
            ctx.shadowBlur  = 10
            ctx.fillText(this.score.toLocaleString(), cx, py + 163)
            ctx.restore()

            // record — igual al panel MEJOR PUNTAJE
            ctx.save()
            ctx.textAlign = 'center'
            if (isNewRecord) {
                ctx.font        = 'bold 20px Lato, sans-serif'
                ctx.fillStyle   = '#FFD700'
                ctx.shadowColor = '#FFD700'
                ctx.shadowBlur  = 22
                ctx.fillText('★   ¡NUEVO RÉCORD!   ★', cx, py + 199)
            } else {
                ctx.font        = 'bold 12px Lato, sans-serif'
                ctx.fillStyle   = 'rgba(255,215,0,0.55)'
                ctx.fillText('RÉCORD  ' + this.highScore.toLocaleString(), cx, py + 199)
            }
            ctx.restore()

            // divider
            ctx.save()
            ctx.strokeStyle = 'rgba(0,225,255,0.12)'
            ctx.lineWidth   = 1
            ctx.beginPath(); ctx.moveTo(px + 28, py + 217); ctx.lineTo(px + pw - 28, py + 217); ctx.stroke()
            ctx.restore()

            // botón de reinicio — cian igual al HUD
            const bw = pw - 64
            const bh = 38
            const bx = cx - bw / 2
            const by = py + ph - 52
            this._roundRect(bx, by, bw, bh, 8)
            ctx.fillStyle   = 'rgba(0,225,255,0.07)'
            ctx.fill()
            ctx.strokeStyle = 'rgba(0,225,255,0.35)'
            ctx.lineWidth   = 1
            ctx.stroke()
            ctx.save()
            ctx.textAlign    = 'center'
            ctx.textBaseline = 'middle'
            ctx.font         = 'bold 12px Lato, sans-serif'
            ctx.fillStyle    = 'rgba(255,255,255,0.75)'
            ctx.fillText('HAZ CLIC PARA VOLVER A JUGAR', cx, by + bh / 2)
            ctx.restore()
        },

        // ── HUD helpers ──────────────────────────────────────────

        _roundRect: function (x, y, w, h, r) {
            r = Math.min(r, w / 2, h / 2)
            const ctx = this.ctx
            ctx.beginPath()
            ctx.moveTo(x + r, y)
            ctx.lineTo(x + w - r, y)
            ctx.quadraticCurveTo(x + w, y,     x + w, y + r)
            ctx.lineTo(x + w, y + h - r)
            ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
            ctx.lineTo(x + r, y + h)
            ctx.quadraticCurveTo(x, y + h,     x, y + h - r)
            ctx.lineTo(x, y + r)
            ctx.quadraticCurveTo(x, y,         x + r, y)
            ctx.closePath()
        },

        hudPanel: function (x, y, w, h, borderColor) {
            const ctx = this.ctx
            ctx.save()
            this._roundRect(x, y, w, h, 8)
            ctx.fillStyle   = 'rgba(0,0,0,0.62)'
            ctx.fill()
            ctx.strokeStyle = borderColor || 'rgba(255,255,255,0.15)'
            ctx.lineWidth   = 1
            ctx.stroke()
            ctx.restore()
        },

        hudRoundRect: function (x, y, w, h, r, fillStyle) {
            if (w <= 0) return
            const ctx = this.ctx
            ctx.save()
            this._roundRect(x, y, w, h, r)
            ctx.fillStyle = fillStyle
            ctx.fill()
            ctx.restore()
        },

        drawPowerUpHUD: function (x, y, icon, label, time, maxTime, color) {
            const ctx = this.ctx
            const w   = 138
            const h   = 22
            this.hudPanel(x, y, w, h, 'rgba(255,255,255,0.1)')
            ctx.save()
            ctx.fillStyle = color
            ctx.fillRect(x, y + 4, 3, h - 8)
            ctx.font        = 'bold 11px Lato, sans-serif'
            ctx.fillStyle   = color
            ctx.shadowColor = color
            ctx.shadowBlur  = 6
            ctx.fillText(icon, x + 8, y + 15)
            ctx.shadowBlur  = 0
            ctx.font        = 'bold 7px Lato, sans-serif'
            ctx.fillStyle   = 'rgba(255,255,255,0.6)'
            ctx.fillText(label, x + 24, y + 11)
            const bx = x + 24, by = y + 14, bw = 78, bh = 3
            ctx.fillStyle = 'rgba(255,255,255,0.1)'
            ctx.fillRect(bx, by, bw, bh)
            ctx.fillStyle = color
            ctx.fillRect(bx, by, bw * Math.max(0, time / maxTime), bh)
            ctx.textAlign   = 'right'
            ctx.font        = 'bold 9px Lato, sans-serif'
            ctx.fillStyle   = color
            ctx.fillText(time.toFixed(1) + 's', x + w - 4, y + 15)
            ctx.restore()
            return y + h + 3
        },

        updateScore: function () {
            const ctx = this.ctx
            const W   = this.c.width
            const H   = this.c.height

            // ── Panel PUNTAJE (left: 10,10 → 158,68) ─────────────────
            this.hudPanel(10, 10, 148, 58, 'rgba(0,225,255,0.35)')
            ctx.save()
            ctx.font      = 'bold 8px Lato, sans-serif'
            ctx.fillStyle = 'rgba(0,225,255,0.55)'
            ctx.fillText('SCORE', 18, 22)
            ctx.font        = 'bold 20px Lato, sans-serif'
            ctx.fillStyle   = '#ffffff'
            ctx.shadowColor = 'rgba(0,225,255,0.5)'
            ctx.shadowBlur  = 8
            ctx.fillText(this.score.toLocaleString(), 18, 42)
            ctx.restore()

            // lives as small ship icons below score
            const lives = this.maxLives - this.life
            for (let i = 0; i < this.maxLives; i++) {
                ctx.save()
                ctx.globalAlpha = i < lives ? 1 : 0.18
                if (i < lives) { ctx.shadowColor = '#00E1FF'; ctx.shadowBlur = 8 }
                ctx.drawImage(this.player.image, 18 + i * 22, 46, 16, 16)
                ctx.restore()
            }

            // ── Panel MEJOR (right: W-158,10 → W-10,68) ──────────────
            this.hudPanel(W - 158, 10, 148, 58, 'rgba(255,215,0,0.25)')
            ctx.save()
            ctx.textAlign   = 'right'
            ctx.font        = 'bold 8px Lato, sans-serif'
            ctx.fillStyle   = 'rgba(255,215,0,0.55)'
            ctx.fillText('RÉCORD', W - 18, 24)
            ctx.font        = 'bold 18px Lato, sans-serif'
            ctx.fillStyle   = '#FFD700'
            ctx.shadowColor = 'rgba(255,215,0,0.45)'
            ctx.shadowBlur  = 8
            ctx.fillText(this.highScore.toLocaleString(), W - 18, 48)
            ctx.restore()

            // ── Power-ups (below left panel) ──────────────────────────
            let puY = 74
            const pl = this.player
            if (pl.rapidFire  > 0) puY = this.drawPowerUpHUD(10, puY, '⚡', 'RAPIDFIRE', pl.rapidFire,  6,   '#FF8C00')
            if (pl.tripleShot > 0) puY = this.drawPowerUpHUD(10, puY, '⊕', 'TRIPLE',    pl.tripleShot, 6,   '#9B30FF')
            if (pl.shield     > 0) puY = this.drawPowerUpHUD(10, puY, '◈', 'ESCUDO',    pl.shield,     5,   '#00BFFF')
            if (pl.bombFlash  > 0) puY = this.drawPowerUpHUD(10, puY, '✸', 'BOMBA',     pl.bombFlash,  1,   '#FF2222')

            // ── Combo (right, below panel MEJOR, pop animation) ──────────
            if (this.combo >= 2 && this.comboTimer > 0) {
                const baseSz  = Math.min(26, 14 + this.combo * 1.2)  // max 26px at combo 10+
                const color   = this.combo >= 8 ? '#FF4500' : this.combo >= 5 ? '#FF8C00' : '#FFD700'
                const anchorX = W - 14
                const anchorY = 82 + baseSz
                ctx.save()
                ctx.globalAlpha = Math.min(1, this.comboTimer)
                ctx.translate(anchorX, anchorY)
                ctx.scale(this.comboScale, this.comboScale)
                ctx.textAlign   = 'right'
                ctx.font        = 'bold ' + baseSz + 'px Lato, sans-serif'
                ctx.fillStyle   = color
                ctx.shadowColor = color
                ctx.shadowBlur  = 20
                ctx.fillText('x' + this.combo + ' COMBO', 0, 0)
                ctx.restore()
            }

            // ── Banner de nivel (centrado perfectamente) ──────────────
            if (this.levelUpTimer > 0) {
                const elapsed = 3 - this.levelUpTimer
                const alpha   = Math.min(elapsed, 1, this.levelUpTimer)
                const isBoss  = this.difficulty % 5 === 0
                ctx.save()
                ctx.globalAlpha = alpha
                ctx.fillStyle = isBoss ? 'rgba(255,50,0,0.06)' : 'rgba(0,225,255,0.05)'
                ctx.fillRect(0, H / 2 - 44, W, 88)
                ctx.strokeStyle = isBoss ? 'rgba(255,50,0,0.4)' : 'rgba(0,225,255,0.35)'
                ctx.lineWidth   = 1
                ctx.beginPath(); ctx.moveTo(100, H / 2 - 44); ctx.lineTo(W - 100, H / 2 - 44); ctx.stroke()
                ctx.beginPath(); ctx.moveTo(100, H / 2 + 44); ctx.lineTo(W - 100, H / 2 + 44); ctx.stroke()
                ctx.textAlign    = 'center'
                ctx.textBaseline = 'middle'
                ctx.font         = 'bold 52px Lato, sans-serif'
                ctx.fillStyle    = isBoss ? '#FF3300' : '#FFD700'
                ctx.shadowColor  = ctx.fillStyle
                ctx.shadowBlur   = 35
                ctx.fillText(isBoss ? '¡JEFE!' : '¡NIVEL ' + this.difficulty + '!', W / 2, H / 2)
                ctx.restore()
            }
        },

        loop: function (timestamp) {
            if (!Game.paused) {
                const dt = Game.lastTimestamp
                    ? Math.min((timestamp - Game.lastTimestamp) / 1000, 0.05)
                    : 1 / 60
                Game.lastTimestamp = timestamp || performance.now()
                Game.dt = dt

                Game.elapsedTime += dt
                if (Game.elapsedTime >= Game.nextDifficultyAt) {
                    Game.nextDifficultyAt += 20
                    Game.increaseDifficulty()
                }

                // combo timeout + scale decay (2.0 → 1.0 in ~0.18s)
                if (Game.comboTimer > 0) {
                    Game.comboTimer -= dt
                    if (Game.comboTimer <= 0) { Game.combo = 0; Game.comboMultiplier = 1; Game.comboScale = 1.0 }
                }
                if (Game.comboScale > 1.0) Game.comboScale = Math.max(1.0, Game.comboScale - dt * 6)

                // level-up banner timer
                if (Game.levelUpTimer > 0) Game.levelUpTimer -= dt

                Game.clear()
                Game.drawVideo()

                // screen shake (entities only, HUD stays fixed)
                let shaking = false
                if (Game.shakeTimer > 0) {
                    const intensity = 8 * (Game.shakeTimer / 0.3)
                    Game.ctx.save()
                    Game.ctx.translate(
                        (Math.random() - 0.5) * intensity * 2,
                        (Math.random() - 0.5) * intensity * 2
                    )
                    shaking = true
                    Game.shakeTimer = Math.max(0, Game.shakeTimer - dt)
                }

                for (let i in Game.enemies) {
                    Game.enemies[i].draw()
                    Game.enemies[i].update()
                }

                if (Game.boss) {
                    Game.boss.draw()
                    Game.boss.update()
                }

                for (let x in Game.enemyBullets) {
                    Game.enemyBullets[x].draw()
                    Game.enemyBullets[x].update()
                }

                for (let z in Game.bullets) {
                    Game.bullets[z].draw()
                    Game.bullets[z].update()
                }

                for (let p in Game.powerUps) {
                    Game.powerUps[p].draw()
                    Game.powerUps[p].update()
                }

                const pl = Game.player
                if (Game.player.invincible) {
                    if (pl.shield > 0) {
                        // shield power-up: cyan bubble, no blink
                        Game.ctx.save()
                        Game.ctx.strokeStyle = 'rgba(0, 200, 255, 0.85)'
                        Game.ctx.shadowColor = 'cyan'
                        Game.ctx.shadowBlur  = 22
                        Game.ctx.lineWidth   = 2.5
                        Game.ctx.beginPath()
                        Game.ctx.arc(pl.x + pl.width / 2, pl.y + pl.height / 2, pl.width / 2 + 13, 0, Math.PI * 2)
                        Game.ctx.stroke()
                        Game.ctx.restore()
                        Game.blinkVisible = true
                        Game.blinkTimer   = 0
                        Game.player.draw()
                    } else {
                        // damage invincibility: blink transparent
                        Game.blinkTimer += dt
                        if (Game.blinkTimer >= 0.1) { Game.blinkTimer = 0; Game.blinkVisible = !Game.blinkVisible }
                        if (Game.blinkVisible) {
                            Game.ctx.save()
                            Game.ctx.globalAlpha = 0.35
                            Game.player.draw()
                            Game.ctx.restore()
                        }
                    }
                } else {
                    Game.blinkVisible = true
                    Game.blinkTimer   = 0
                    Game.player.draw()
                }

                for (let i in Game.particles) {
                    Game.particles[i].draw()
                }

                if (shaking) Game.ctx.restore()

                // level flash (fullscreen — after shake restore so it covers cleanly)
                if (Game.levelFlash > 0) {
                    Game.ctx.save()
                    Game.ctx.globalAlpha = Game.levelFlash * 0.3
                    Game.ctx.fillStyle   = '#FFD700'
                    Game.ctx.fillRect(0, 0, Game.c.width, Game.c.height)
                    Game.ctx.restore()
                    Game.levelFlash = Math.max(0, Game.levelFlash - dt * 2)
                }

                // floating texts (on top, no shake)
                for (let t in Game.floatingTexts) {
                    Game.floatingTexts[t].draw()
                }

                Game.player.update()
                Game.updateScore()
                Game.currentFrame = Game.requestAnimationFrame.call(window, Game.loop)
            }
        }
    }

    // ============================================================
    // PLAYER
    // ============================================================
    let Player = function () {
        this.width        = 70
        this.height       = 70
        this.x            = Game.c.width / 2 - this.width / 2
        this.y            = Game.c.height - this.height
        this.movingLeft   = false
        this.movingRight  = false
        this.speed        = 5
        this.shootCooldown = 0
        this.invincible      = false
        this.invincibleTimer = 0
        this.rapidFire       = 0
        this.tripleShot      = 0
        this.shield          = 0
        this.bombFlash       = 0
        this.trail        = []
        this.image        = new Image()
        this.image.src    = 'img/nave.png'
    }

    Player.prototype.die = function () {
        if (Game.life < Game.maxLives) {
            Game.playHitSound()
            Game.invincibleMode(2000)
            Game.life++
            Game.shakeTimer = 0.3
        } else {
            Game.pause()
            Game.gameOver()
        }
    }

    Player.prototype.draw = function () {
        // engine trail
        for (let i = 0; i < this.trail.length; i++) {
            const alpha = (1 - i / this.trail.length) * 0.35
            Game.ctx.save()
            Game.ctx.globalAlpha  = alpha
            Game.ctx.fillStyle    = '#4af'
            Game.ctx.shadowColor  = '#4af'
            Game.ctx.shadowBlur   = 6
            Game.ctx.beginPath()
            Game.ctx.arc(this.trail[i].x, this.trail[i].y, Math.max(1, 5 - i * 0.6), 0, Math.PI * 2)
            Game.ctx.fill()
            Game.ctx.restore()
        }
        Game.ctx.drawImage(this.image, this.x, this.y, this.width, this.height)
    }

    Player.prototype.update = function () {
        const move   = this.speed * Game.speedMultiplier * Game.dt * 60
        const moving = this.movingLeft || this.movingRight

        if (this.movingLeft  && this.x > 0)                         this.x -= move
        if (this.movingRight && this.x + this.width < Game.c.width) this.x += move

        // trail
        if (moving) {
            this.trail.unshift({ x: this.x + this.width / 2, y: this.y + this.height * 0.75 })
            if (this.trail.length > 8) this.trail.pop()
        } else if (this.trail.length > 0) {
            this.trail.pop()
        }

        // power-up timers
        if (this.rapidFire  > 0) this.rapidFire  -= Game.dt
        if (this.tripleShot > 0) this.tripleShot -= Game.dt
        if (this.shield     > 0) this.shield     -= Game.dt
        if (this.bombFlash  > 0) this.bombFlash  -= Game.dt

        // invincibility: shield takes priority; damage/unpause use invincibleTimer
        if (this.shield > 0) {
            this.invincible      = true
            this.invincibleTimer = 0
        } else if (this.invincibleTimer > 0) {
            this.invincibleTimer -= Game.dt
            if (this.invincibleTimer <= 0) { this.invincibleTimer = 0; this.invincible = false }
        } else {
            this.invincible = false
        }

        this.shootCooldown -= Game.dt
        if (Game.shooting && this.shootCooldown <= 0 && (!this.invincible || this.shield > 0)) this.shoot()

        for (let i in Game.enemyBullets) {
            if (Game.collision(Game.enemyBullets[i], this) && !this.invincible) {
                this.die()
                delete Game.enemyBullets[i]
            }
        }
    }

    Player.prototype.shoot = function () {
        const cx       = this.x + this.width / 2
        const cooldown = (this.rapidFire > 0 ? 4 : 10) / 60
        if (this.tripleShot > 0) {
            Game.bullets[Game.bulletIndex++] = new Bullet(cx, -2.5)
            Game.bullets[Game.bulletIndex++] = new Bullet(cx,  0)
            Game.bullets[Game.bulletIndex++] = new Bullet(cx,  2.5)
        } else {
            Game.bullets[Game.bulletIndex++] = new Bullet(cx, 0)
        }
        this.shootCooldown = cooldown
        if (this.tripleShot > 0) {
            Game.playTripleShotSound()
        } else {
            Game.sfxLaser.currentTime = 0
            Game.sfxLaser.play().catch(() => {})
        }
    }

    // ============================================================
    // BULLET (player)
    // ============================================================
    let Bullet = function (x, vx) {
        this.width  = 6
        this.height = 24
        this.x      = x
        this.y      = Game.player.y
        this.vx     = vx || 0
        this.vy     = 7 * Game.speedMultiplier
        this.triple = Game.player.tripleShot > 0
        this.index  = Game.bulletIndex
        this.phase  = Math.random() * Math.PI * 2
    }

    Bullet.prototype.draw = function () {
        const ctx  = Game.ctx
        const cx   = this.x
        const y    = this.y
        const h    = this.height
        const w    = this.width

        // triple shot: slightly purple-white tint; single: orange-yellow
        const glowColor = this.triple ? '#CC88FF' : '#FFA020'
        const bodyColor = this.triple ? 'rgba(180,80,255,0.92)' : 'rgba(255,140,0,0.92)'
        const coreColor = this.triple ? '#F0E0FF' : '#FFF0A0'

        const pulse    = Math.sin(Game.elapsedTime * 16 + this.phase)
        const glowBlur = 12 + pulse * 2.5

        ctx.save()

        // rotate triple shot bullets to face their diagonal travel direction
        if (this.vx !== 0) {
            const angle = Math.atan2(-this.vy, this.vx) + Math.PI / 2
            ctx.translate(cx, y + h / 2)
            ctx.rotate(angle)
            ctx.translate(-cx, -(y + h / 2))
        }

        ctx.shadowColor = glowColor
        ctx.shadowBlur  = glowBlur

        // teardrop: tip at top (direction of travel = up), wide tail at bottom
        const tailW = w * 0.85
        const tipW  = w * 0.07
        ctx.beginPath()
        ctx.moveTo(cx,              y)
        ctx.lineTo(cx + tipW,       y + h * 0.12)
        ctx.lineTo(cx + tailW / 2,  y + h)
        ctx.lineTo(cx - tailW / 2,  y + h)
        ctx.lineTo(cx - tipW,       y + h * 0.12)
        ctx.closePath()
        ctx.fillStyle = bodyColor
        ctx.fill()

        // bright core streak
        ctx.shadowBlur  = glowBlur * 0.4
        ctx.strokeStyle = coreColor
        ctx.lineWidth   = Math.max(1, w * 0.18)
        ctx.lineCap     = 'round'
        ctx.beginPath()
        ctx.moveTo(cx, y + h * 0.07)
        ctx.lineTo(cx, y + h * 0.83)
        ctx.stroke()

        ctx.restore()
    }

    Bullet.prototype.update = function () {
        this.x += this.vx * Game.dt * 60
        this.y -= this.vy * Game.dt * 60
        if (this.y < 0 || this.x < -10 || this.x > Game.c.width + 10) {
            delete Game.bullets[this.index]
        }
    }

    // ============================================================
    // ENEMY
    // ============================================================
    let Enemy = function () {
        const d  = Game.difficulty
        const sm = Game.speedMultiplier
        this.width  = 100
        this.height = 60
        this.x      = Game.random(0, Game.c.width - this.width)
        this.y      = Game.random(10, 40)
        this.vy     = Game.random(5, 15) * 0.01
        this.dead   = false
        this.index  = Game.enemyIndex
        Game.enemies[Game.enemyIndex] = this
        Game.enemyIndex++
        this.movingLeft = Math.random() < 0.5
        this.image      = new Image()

        const aggressiveChance = Math.min(0.5, (d - 1) * 0.07)
        this.aggressive = d >= 2 && Math.random() < aggressiveChance

        if (this.aggressive) {
            this.speed         = (Game.random(22, 34) * 0.1) * sm
            this.bulletSpeed   = (Game.random(25, 35) * 0.1 + (d - 1) * 0.4) * sm
            this.shootInterval = Math.max(0.6, (Game.random(100, 160) - (d - 1) * 8) / 60) / sm
            this.maxY          = Game.c.height * (0.38 + Math.random() * 0.2)
            this.image.src     = 'img/ovni.png'
        } else {
            this.speed         = (Game.random(15, 25) * 0.1 + (d - 1) * 0.25) * sm
            this.bulletSpeed   = (Game.random(20, 30) * 0.1 + (d - 1) * 0.35) * sm
            this.shootInterval = Math.max(0.8, (Game.random(150, 220) - (d - 1) * 10) / 60) / sm
            this.maxY          = Game.c.height * 0.35
            this.image.src     = d >= 3 ? 'img/ovni.png' : 'img/ovni2.png'
        }

        this.shootTimer = Game.random(0, Math.floor(this.shootInterval * 60)) / 60
    }

    Enemy.prototype.draw = function () {
        Game.ctx.drawImage(this.image, this.x, this.y, this.width, this.height)
    }

    Enemy.prototype.update = function () {
        if (this.y > this.maxY) this.vy = -Math.abs(this.vy)
        else if (this.y < 10)   this.vy =  Math.abs(this.vy)

        const move  = this.speed * Game.dt * 60
        const vmove = this.vy    * Game.dt * 60
        if (this.movingLeft) {
            if (this.x > 0) { this.x -= move; this.y += vmove }
            else              this.movingLeft = false
        } else {
            if (this.x + this.width < Game.c.width) { this.x += move; this.y += vmove }
            else                                       this.movingLeft = true
        }

        this.shootTimer += Game.dt
        if (this.shootTimer >= this.shootInterval) { this.shootTimer = 0; this.shoot() }

        for (let i in Game.bullets) {
            if (Game.collision(Game.bullets[i], this)) {
                delete Game.bullets[i]
                this.die()
            }
        }
    }

    Enemy.prototype.die = function () {
        if (this.dead) return
        this.dead = true
        this.explode()
        delete Game.enemies[this.index]

        Game.combo++
        Game.comboTimer      = 2.5
        Game.comboScale      = 2.0
        Game.comboMultiplier = 1 + Math.floor(Game.combo / 3) * 0.5
        const points         = Math.floor((15 + (Game.difficulty - 1) * 5) * Game.comboMultiplier)
        Game.score          += points

        const ptColor = Game.combo >= 5 ? '#FF4500' : Game.combo >= 3 ? '#FFD700' : '#fff'
        new FloatingText(this.x + this.width / 2, this.y, '+' + points, ptColor)

        if (Math.random() < 0.2 && !Game.bossActive) new PowerUp(this.x + this.width / 2, this.y + this.height / 2)


        Game.sfxExplosion.currentTime = 0
        Game.sfxExplosion.play().catch(() => {})

        Game.enemiesAlive = Game.enemiesAlive > 1 ? Game.enemiesAlive - 1 : 0
        if (Game.enemiesAlive < Game.maxEnemies && !Game.bossActive) {
            Game.enemiesAlive++
            setTimeout(() => { new Enemy() }, 2000)
        }
    }

    Enemy.prototype.explode = function () {
        for (let i = 0; i < Game.maxParticles; i++) {
            new Particle(this.x + this.width / 2, this.y)
        }
    }

    Enemy.prototype.shoot = function () {
        const color = this.aggressive ? 'tomato' : 'lime'
        new EnemyBullet(this.x + this.width / 2, this.y + this.height, this.bulletSpeed, color, 0)
    }

    // ============================================================
    // BOSS
    // ============================================================
    let Boss = function () {
        const d  = Game.difficulty
        const sm = Game.speedMultiplier
        this.width    = 180
        this.height   = 110
        this.x        = Game.c.width / 2 - this.width / 2
        this.y        = -this.height
        this.entering = true
        this.dead     = false
        this.hp       = 8 + Math.floor(d / 5) * 4
        this.maxHp    = this.hp
        this.speed    = (1.8 + d * 0.12) * sm
        this.bulletSpeed   = (3 + d * 0.2) * sm
        this.shootInterval = Math.max(1.2, 3.5 - d * 0.1)
        this.shootTimer    = 2
        this.movingLeft    = Math.random() < 0.5
        this.image         = new Image()
        this.image.src     = 'img/ovni.png'
        Game.bossActive    = true
        Game.boss          = this
    }

    Boss.prototype.draw = function () {
        Game.ctx.save()
        Game.ctx.shadowColor = '#FF3300'
        Game.ctx.shadowBlur  = 35
        Game.ctx.drawImage(this.image, this.x, this.y, this.width, this.height)
        Game.ctx.restore()

        // health bar
        const barX = this.x
        const barY = this.y + this.height + 5
        const barW = this.width
        const barH = 10
        const hp   = this.hp / this.maxHp
        Game.ctx.fillStyle = 'rgba(0,0,0,0.6)'
        Game.ctx.fillRect(barX, barY, barW, barH)
        Game.ctx.fillStyle = hp > 0.5 ? '#4f4' : hp > 0.25 ? '#FF8C00' : '#f44'
        Game.ctx.fillRect(barX, barY, barW * hp, barH)
        Game.ctx.strokeStyle = 'rgba(255,255,255,0.35)'
        Game.ctx.lineWidth   = 1
        Game.ctx.strokeRect(barX, barY, barW, barH)

        // label
        Game.ctx.fillStyle = '#FF3300'
        Game.ctx.font      = 'bold 12px Lato, sans-serif'
        Game.ctx.fillText('BOSS', this.x + this.width / 2 - 17, this.y - 6)
    }

    Boss.prototype.update = function () {
        if (this.entering) {
            this.y += 2.5 * Game.speedMultiplier * Game.dt * 60
            if (this.y >= 15) { this.y = 15; this.entering = false }
            return
        }

        const move = this.speed * Game.dt * 60
        if (this.movingLeft) {
            this.x -= move
            if (this.x <= 0) this.movingLeft = false
        } else {
            this.x += move
            if (this.x + this.width >= Game.c.width) this.movingLeft = true
        }

        this.shootTimer += Game.dt
        if (this.shootTimer >= this.shootInterval) { this.shootTimer = 0; this.shoot() }

        for (let i in Game.bullets) {
            if (Game.collision(Game.bullets[i], this)) {
                delete Game.bullets[i]
                this.hp--
                if (this.hp <= 0) this.die()
            }
        }
    }

    Boss.prototype.shoot = function () {
        const cx  = this.x + this.width / 2
        const cy  = this.y + this.height
        const spd = this.bulletSpeed
        const angles = [-0.35, -0.15, 0, 0.15, 0.35]
        angles.forEach(a => {
            new EnemyBullet(cx, cy, spd, '#FF3300', Math.sin(a) * spd)
        })
    }

    Boss.prototype.die = function () {
        if (this.dead) return
        this.dead       = true
        Game.boss       = null
        Game.bossActive = false

        for (let i = 0; i < 20; i++) {
            new Particle(this.x + Game.random(0, this.width), this.y + Game.random(0, this.height))
        }

        const points  = 300 + (Game.difficulty - 1) * 25
        Game.score   += points
        Game.combo   += 3
        Game.comboTimer = 3

        new FloatingText(this.x + this.width / 2, this.y + this.height / 2, "BOSS +" + points, '#FFD700')

        Game.sfxExplosion.currentTime = 0
        Game.sfxExplosion.play().catch(() => {})

        // resume normal spawning after boss
        const toSpawn = Math.min(2, Game.maxEnemies - Game.enemiesAlive)
        for (let i = 0; i < toSpawn; i++) {
            setTimeout(() => { new Enemy(); Game.enemiesAlive++ }, 1000 + i * 800)
        }
    }

    // ============================================================
    // ENEMY BULLET
    // ============================================================
    let EnemyBullet = function (x, y, speed, color, vx) {
        const d      = Game.difficulty
        const isBoss = color === '#FF3300'
        const isAggr = color === 'tomato'
        this.diff    = d
        this.isBoss  = isBoss
        this.isAggr  = isAggr
        this.width   = Math.round(isBoss ? 10 + Math.min(7, d * 0.65) : isAggr ? 6 + Math.min(4, d * 0.38) : 4 + Math.min(3, d * 0.28))
        this.height  = Math.round(isBoss ? 28 + Math.min(18, d * 1.8) : 18 + Math.min(14, d * 1.3))
        this.x       = x - this.width / 2
        this.y       = y
        this.vx      = vx || 0
        this.vy      = speed || 3
        this.color   = color || 'lime'
        this.phase   = Math.random() * Math.PI * 2
        // normal bullets: subtle sinusoidal side drift
        this.wobbleAmp   = (!isBoss && !isAggr) ? 0.4 + Math.random() * 0.3 : 0
        this.wobbleFreq  = 4.5 + Math.random() * 2
        this.wobblePhase = Math.random() * Math.PI * 2
        // aggressive bullets at d>=3: gently home toward player
        this.homing = isAggr && d >= 3
        this.index  = Game.enemyBulletIndex
        Game.enemyBullets[Game.enemyBulletIndex] = this
        Game.enemyBulletIndex++
    }

    EnemyBullet.prototype.draw = function () {
        const ctx    = Game.ctx
        const d      = this.diff
        const isBoss = this.isBoss
        const isAggr = this.isAggr
        const cx     = this.x + this.width / 2
        const y      = this.y
        const h      = this.height
        const w      = this.width

        let glowColor, bodyColor, coreColor
        if (isBoss) {
            glowColor = '#FF2200'
            bodyColor = `rgba(255,${Math.min(255, 40 + d * 8)},0,0.95)`
            coreColor = '#FFFAE0'
        } else if (isAggr) {
            glowColor = '#FF7020'
            bodyColor = `rgba(255,${Math.min(255, 75 + d * 7)},15,0.9)`
            coreColor = d >= 4 ? '#FFF0D0' : '#FFCCA0'
        } else {
            const g   = Math.min(255, 155 + d * 11)
            glowColor = `rgb(0,${g},80)`
            bodyColor = `rgba(0,${g},55,0.9)`
            coreColor = d >= 5 ? '#DFFFDF' : '#A8FFB0'
        }

        const pulse    = Math.sin(Game.elapsedTime * 13 + this.phase)
        const glowBase = isBoss ? Math.min(42, 22 + d * 2.2) : isAggr ? Math.min(28, 10 + d * 1.8) : Math.min(22, 6 + d * 1.6)
        const glowBlur = glowBase + pulse * (isBoss ? 6 : 2.5)

        ctx.save()

        // rotate diagonal boss bullets to face travel direction
        if (this.vx !== 0) {
            const angle = Math.atan2(this.vy, this.vx) - Math.PI / 2
            ctx.translate(cx, y + h / 2)
            ctx.rotate(angle)
            ctx.translate(-cx, -(y + h / 2))
        }

        ctx.shadowColor = glowColor
        ctx.shadowBlur  = glowBlur

        // teardrop: wide tail at top, pointed tip at bottom (direction of travel)
        const tailW = w * 0.88
        const tipW  = w * 0.07
        ctx.beginPath()
        ctx.moveTo(cx - tailW / 2, y)
        ctx.lineTo(cx + tailW / 2, y)
        ctx.lineTo(cx + tipW,      y + h * 0.88)
        ctx.lineTo(cx,             y + h)
        ctx.lineTo(cx - tipW,      y + h * 0.88)
        ctx.closePath()
        ctx.fillStyle = bodyColor
        ctx.fill()

        // bright core streak
        ctx.shadowBlur  = glowBlur * 0.4
        ctx.strokeStyle = coreColor
        ctx.lineWidth   = Math.max(1, w * 0.18)
        ctx.lineCap     = 'round'
        ctx.beginPath()
        ctx.moveTo(cx, y + h * 0.07)
        ctx.lineTo(cx, y + h * 0.83)
        ctx.stroke()

        ctx.restore()
    }

    EnemyBullet.prototype.update = function () {
        // sinusoidal drift for normal bullets
        if (this.wobbleAmp > 0) {
            const prev = this.wobblePhase
            this.wobblePhase += this.wobbleFreq * Game.dt
            this.x += (Math.sin(this.wobblePhase) - Math.sin(prev)) * this.wobbleAmp * 8
        }

        // gentle homing for aggressive bullets at d>=3
        if (this.homing) {
            const px  = Game.player.x + Game.player.width / 2
            const bx  = this.x + this.width / 2
            const dir = px > bx ? 1 : -1
            this.vx  += dir * 1.5 * Game.dt
            this.vx   = Math.max(-3, Math.min(3, this.vx))
        }

        this.x += this.vx * Game.dt * 60
        this.y += this.vy * Game.dt * 60
        if (this.y > Game.c.height + 20 || this.x < -20 || this.x > Game.c.width + 20) {
            delete Game.enemyBullets[this.index]
        }
    }

    // ============================================================
    // PARTICLE
    // ============================================================
    const explosionImage   = new Image()
    explosionImage.src     = 'img/explosion.png'

    let Particle = function (x, y) {
        this.x       = x
        this.y       = y
        this.vx      = Game.random(-5, 5)
        this.vy      = Game.random(-5, 5)
        this.image   = explosionImage
        this.id      = Game.particleIndex
        Game.particles[Game.particleIndex] = this
        Game.particleIndex++
        this.life    = 0
        this.gravity = 0.05
        this.size    = 40
        this.maxlife = 1.67
    }

    Particle.prototype.draw = function () {
        const s   = Game.dt * 60
        this.x   += this.vx * s
        this.y   += this.vy * s
        this.vy  += this.gravity * s
        this.size *= Math.pow(0.89, s)
        Game.ctx.drawImage(this.image, this.x, this.y, this.size, this.size)
        this.life += Game.dt
        if (this.life >= this.maxlife) delete Game.particles[this.id]
    }

    // ============================================================
    // POWER-UP
    // ============================================================
    let PowerUp = function (x, y) {
        this.type   = POWERUP_TYPES[Game.random(0, POWERUP_TYPES.length)]
        this.x      = x
        this.y      = y
        this.width  = 28
        this.height = 28
        this.vy     = 1.5
        this.color  = POWERUP_COLORS[this.type]
        this.id     = Game.powerUpIndex
        Game.powerUps[Game.powerUpIndex] = this
        Game.powerUpIndex++
        this.pulse  = 0
    }

    PowerUp.prototype.draw = function () {
        this.pulse  += Game.dt * 4
        const r      = (this.width / 2) * (1 + Math.sin(this.pulse) * 0.12)
        Game.ctx.save()
        Game.ctx.shadowColor  = this.color
        Game.ctx.shadowBlur   = 18
        Game.ctx.globalAlpha  = 0.92
        Game.ctx.fillStyle    = this.color
        Game.ctx.beginPath()
        Game.ctx.arc(this.x, this.y, r, 0, Math.PI * 2)
        Game.ctx.fill()
        Game.ctx.globalAlpha  = 1
        Game.ctx.fillStyle    = 'white'
        Game.ctx.font         = 'bold 13px Lato, sans-serif'
        const icon = POWERUP_ICONS[this.type]
        Game.ctx.fillText(icon, this.x - Game.ctx.measureText(icon).width / 2, this.y + 4)
        Game.ctx.restore()
    }

    PowerUp.prototype.update = function () {
        this.y += this.vy * Game.speedMultiplier * Game.dt * 60
        if (this.y > Game.c.height + 20) { delete Game.powerUps[this.id]; return }
        const hitbox = { x: this.x - this.width / 2, y: this.y - this.height / 2, width: this.width, height: this.height }
        if (Game.collision(hitbox, Game.player)) {
            this.activate()
            delete Game.powerUps[this.id]
        }
    }

    PowerUp.prototype.activate = function () {
        const p = Game.player
        switch (this.type) {
            case 'rapidfire': p.rapidFire  = 6; break
            case 'shield':    p.shield = 5; p.invincible = true; break
            case 'triple':    p.tripleShot = 6; break
            case 'bomb':
                p.bombFlash = 1
                Game.playBombSound()
                for (let i in Game.enemies) Game.enemies[i].die()
                if (Game.boss) Game.boss.hp = Math.max(1, Math.ceil(Game.boss.hp / 2))
                break
        }
        Game.playPowerUpSound(this.type)
        new FloatingText(p.x + p.width / 2, p.y - 10, POWERUP_LABELS[this.type], this.color)
    }

    // ============================================================
    // FLOATING TEXT
    // ============================================================
    let FloatingText = function (x, y, text, color, fontSize) {
        this.x        = x
        this.y        = y
        this.text     = text
        this.color    = color || 'white'
        this.fontSize = fontSize || 16
        this.life     = 0
        this.maxLife  = 1.5
        this.vy       = -1.2
        this.id      = Game.floatingTextIndex
        Game.floatingTexts[Game.floatingTextIndex] = this
        Game.floatingTextIndex++
    }

    FloatingText.prototype.draw = function () {
        const progress = this.life / this.maxLife
        const fontSize = Math.max(10, this.fontSize - progress * 4)
        Game.ctx.save()
        Game.ctx.globalAlpha = 1 - progress
        Game.ctx.fillStyle   = this.color
        Game.ctx.font        = "bold " + fontSize + "px Lato, sans-serif"
        Game.ctx.shadowColor = this.color
        Game.ctx.shadowBlur  = 8
        Game.ctx.fillText(this.text, this.x - Game.ctx.measureText(this.text).width / 2, this.y)
        Game.ctx.restore()
        this.y    += this.vy * Game.dt * 60
        this.life += Game.dt
        if (this.life >= this.maxLife) delete Game.floatingTexts[this.id]
    }

    Game.init()

}(window))
