import agesJson from './ages.json'
import buildingsJson from './buildings.json'
import combatJson from './combat.json'
import configJson from './config.json'
import resourcesJson from './resources.json'
import technologiesJson from './technologies.json'
import unitsJson from './units.json'

export type ResourceKind = 'food' | 'wood' | 'gold' | 'stone'
export const RESOURCE_KINDS: ResourceKind[] = ['food', 'wood', 'gold', 'stone']

export type Cost = Partial<Record<ResourceKind, number>>
export type UnitClass = 'villager' | 'infantry' | 'archer' | 'cavalry'

export interface UnitDef {
  name: string
  class: UnitClass
  hp: number
  attack: number
  armor: number
  range: number
  speed: number
  cooldown: number
  vision: number
  trainTime: number
  pop: number
  cost: Cost
}

export interface BuildingDef {
  name: string
  hp: number
  size: number
  vision: number
  buildTime: number
  cost: Cost
  age: string
  popProvided?: number
  dropOff?: boolean
  produces?: string[]
  farmFood?: number
  attack?: number
  range?: number
  cooldown?: number
}

export interface AgeDef {
  id: string
  name: string
  numeral: string
  cost: Cost
  researchTime: number
  researchedAt?: string
}

export type TechEffect =
  | { type: 'gatherRate'; resource: ResourceKind; mult: number }
  | { type: 'carryCapacity'; add: number }
  | { type: 'unitStat'; unitClass: UnitClass; stat: 'attack' | 'armor' | 'hp'; add: number }

export interface TechDef {
  name: string
  age: string
  researchedAt: string
  researchTime: number
  cost: Cost
  effects: TechEffect[]
}

export const CONFIG = configJson
export const UNITS = unitsJson as unknown as Record<string, UnitDef>
export const BUILDINGS = buildingsJson as unknown as Record<string, BuildingDef>
export const AGES = agesJson as unknown as AgeDef[]
export const TECHS = technologiesJson as unknown as Record<string, TechDef>
export const COMBAT = combatJson as {
  minimumDamage: number
  bonus: Record<string, Record<string, number>>
  buildingArmor: number
}
export const RESOURCE_DATA = resourcesJson as {
  gatherRates: Record<ResourceKind, number>
  nodeAmounts: Record<ResourceKind, number>
  nodeYieldPerTile: Record<ResourceKind, number>
}

export const ageIndex = (id: string): number => AGES.findIndex((a) => a.id === id)
