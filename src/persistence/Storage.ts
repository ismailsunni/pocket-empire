import type { GameState } from '../simulation/types'

const SETTINGS_KEY = 'pocket-empires.settings'
const DB_NAME = 'pocket-empires'
const STORE = 'saves'
const SLOT = 'slot-1'

export interface Settings {
  muted: boolean
  edgeScroll: boolean
}

const DEFAULTS: Settings = { muted: true, edgeScroll: true }

export const loadSettings = (): Settings => {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') }
  } catch {
    return { ...DEFAULTS }
  }
}

export const saveSettings = (settings: Settings): void => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // Private browsing or a full quota — settings are not worth failing over.
  }
}

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const transact = <T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> =>
  openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = run(db.transaction(STORE, mode).objectStore(STORE))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      }),
  )

export interface SaveGame {
  seed: number
  tick: number
  state: GameState
}

/**
 * A save is the seed, the tick, and the state itself — possible only because
 * GameState is plain serializable data (§19.2 Rule 5, §21).
 */
export const saveGame = (state: GameState): Promise<unknown> =>
  transact('readwrite', (store) =>
    store.put({ seed: state.seed, tick: state.tick, state: structuredClone(state) }, SLOT),
  )

export const loadGame = (): Promise<SaveGame | undefined> =>
  transact<SaveGame | undefined>('readonly', (store) => store.get(SLOT))

export const hasSave = (): Promise<boolean> =>
  loadGame()
    .then((save) => save !== undefined)
    .catch(() => false)

export const clearSave = (): Promise<unknown> =>
  transact('readwrite', (store) => store.delete(SLOT))
