import Phaser from 'phaser'
import { audio } from './audio/Audio'
import { GameScene } from './rendering/GameScene'
import { clearSave, hasSave, loadGame, loadSettings, saveGame, saveSettings } from './persistence/Storage'
import { hashSeed } from './simulation/Random'
import { ENEMY, HUMAN, type GameState } from './simulation/types'
import { Hud } from './ui/Hud'
import { Screen } from './ui/Screens'
import { allMilitary } from './input/Selection'

const AUTOSAVE_MS = 60_000

const uiRoot = document.getElementById('ui') as HTMLElement
const rotatePrompt = document.getElementById('rotate-prompt') as HTMLElement

const settings = loadSettings()
audio.setMuted(settings.muted)

let scene: GameScene | null = null
let autosaveTimer = 0

const hud = new Hud(uiRoot, {
  onBuildPick: (type) => scene?.startPlacement(type),
  onTrain: (buildingId, unit) => {
    scene?.emitter.train(buildingId, unit)
    audio.play('command')
  },
  onResearch: (buildingId, tech) => scene?.emitter.research(buildingId, tech),
  onAdvanceAge: (buildingId) => scene?.emitter.advanceAge(buildingId),
  onCancelQueue: (buildingId, index) => scene?.emitter.cancelQueue(buildingId, index),
  onStop: () => scene?.emitter.stop(),
  onIdleVillager: () => {
    scene?.cycleIdleVillager()
    audio.play('select')
  },
  onSelectMilitary: () => scene?.selectAllMilitary(),
  onJumpTownCenter: () => scene?.jumpToTownCenter(),
  onMinimapJump: (tx, ty) => scene?.centerOn(tx, ty),
  onPause: () => openPause(),
})

const menu = new Screen(uiRoot)
const pause = new Screen(uiRoot)
const results = new Screen(uiRoot)

const phaser = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0d120d',
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.NO_CENTER },
  render: { pixelArt: false, antialias: true, powerPreference: 'high-performance' },
  scene: [GameScene],
  audio: { noAudio: true },
})

// --- game lifecycle -------------------------------------------------------

const startGame = (seed: number, state?: GameState): void => {
  menu.hide()
  results.hide()
  pause.hide()
  phaser.scene.stop('game')
  phaser.scene.start('game', { seed, hud, state })
  scene = phaser.scene.getScene('game') as GameScene
  scene.edgeScrollEnabled = settings.edgeScroll
  scene.events.off('gameover')
  scene.events.on('gameover', onGameOver)
  autosaveTimer = window.setInterval(() => {
    if (scene && !scene.paused && scene.state.status === 'playing') void saveGame(scene.state)
  }, AUTOSAVE_MS)
}

const onGameOver = (winner: number): void => {
  window.clearInterval(autosaveTimer)
  void clearSave()
  const won = winner === HUMAN
  audio.play(won ? 'victory' : 'defeat')
  results.set(
    won ? 'Victory' : 'Defeat',
    won
      ? 'The enemy Town Center has fallen.'
      : 'Your Town Center has fallen. The settlement is lost.',
    [
      { label: 'Play Again', primary: true, run: () => startGame(randomSeed()) },
      { label: 'Main Menu', run: () => openMenu() },
    ],
  )
  results.show()
}

const randomSeed = (): number => hashSeed(`${Date.now()}-${Math.floor(Math.random() * 1e9)}`)

const openPause = (): void => {
  if (!scene || results.visible) return
  scene.paused = true
  if (scene.state.status === 'playing') void saveGame(scene.state)
  pause.set('Paused', `Seed ${scene.state.seed}`, [
    { label: 'Resume', primary: true, run: resume },
    {
      label: settings.muted ? 'Sound: off' : 'Sound: on',
      run: () => {
        settings.muted = !settings.muted
        audio.setMuted(settings.muted)
        saveSettings(settings)
        openPause()
      },
    },
    {
      label: settings.edgeScroll ? 'Edge scroll: on' : 'Edge scroll: off',
      run: () => {
        settings.edgeScroll = !settings.edgeScroll
        if (scene) scene.edgeScrollEnabled = settings.edgeScroll
        saveSettings(settings)
        openPause()
      },
    },
    {
      label: 'Surrender',
      run: () => {
        scene?.emitter.surrender()
        resume()
      },
    },
    { label: 'Main Menu', run: () => openMenu() },
  ])
  pause.show()
}

const resume = (): void => {
  pause.hide()
  if (scene) scene.paused = false
}

const openMenu = async (): Promise<void> => {
  window.clearInterval(autosaveTimer)
  if (scene) scene.paused = true
  pause.hide()
  results.hide()
  const resumable = await hasSave()
  const actions = [
    { label: 'New Game', primary: true, run: () => startGame(randomSeed()) },
    {
      label: 'Custom seed',
      run: () => {
        const input = window.prompt('Map seed')
        if (input) startGame(hashSeed(input))
      },
    },
  ]
  if (resumable) {
    actions.splice(1, 0, {
      label: 'Continue',
      run: () => {
        void loadGame().then((save) => {
          if (save) startGame(save.seed, save.state)
        })
      },
    })
  }
  menu.set(
    'Pocket Empires',
    'Gather, build, raise an army, and destroy the enemy Town Center. Drag empty ground to pan, drag from your own unit to box-select, tap to command.',
    actions,
  )
  menu.show()
}

// --- mobile browser realities (§16.4) ------------------------------------

const checkOrientation = (): void => {
  const portrait = window.innerHeight > window.innerWidth && window.innerWidth < 820
  rotatePrompt.hidden = !portrait
  if (portrait && scene && !pause.visible) scene.paused = true
}

window.addEventListener('resize', checkOrientation)
window.addEventListener('orientationchange', checkOrientation)

// rAF is throttled in background tabs; an unpaused sim would desync from
// wall-clock and fast-forward on return.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && scene && scene.state.status === 'playing') openPause()
})

document.addEventListener('contextmenu', (event) => event.preventDefault())
document.addEventListener('gesturestart', (event) => event.preventDefault())
window.addEventListener('beforeunload', () => {
  if (scene && scene.state.status === 'playing') void saveGame(scene.state)
})
document.addEventListener('pointerdown', () => audio.unlock(), { once: true })

// Screen orientation lock is best-effort: unsupported outside installed PWAs.
void (async () => {
  const orientation = screen.orientation as ScreenOrientation & {
    lock?: (value: string) => Promise<void>
  }
  try {
    await orientation.lock?.('landscape')
  } catch {
    // Not permitted in a plain browser tab — the rotate prompt covers it.
  }
})()

checkOrientation()
void openMenu()

// Exposed for debugging in the console; not used by the game itself.
Object.assign(window, { pocket: { get scene() { return scene }, allMilitary, ENEMY } })
