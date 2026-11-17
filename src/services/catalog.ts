import bundledCatalog from '../data/catalog.json'

export interface CatalogEntry {
  id: string
  name: string
  franchise: string
  series: string
  type: string
}

export interface CatalogUpdate {
  records: CatalogEntry[]
  updatedAt: number
}

const BUNDLED = new Map<string, CatalogEntry>(bundledCatalog.map((record) => [record.id, record]))
const LEGACY_SERIES = 'Legend Of Zelda'

export function buildCatalog(update?: CatalogUpdate) {
  const catalog = new Map(BUNDLED)
  for (const record of update?.records ?? []) catalog.set(record.id, record)
  return catalog
}

export function seriesName(series: string) {
  return series === LEGACY_SERIES ? 'The Legend of Zelda' : series
}

export function searchKey(value: string) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es')
}
