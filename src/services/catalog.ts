import bundledCatalog from '../data/catalog.json'
import { readImage, saveCatalogUpdate, saveImage } from './dbStorage'

export interface CatalogEntry {
  id: string
  name: string
  franchise: string
  series: string
  type: string
  image: string
}

export interface CatalogUpdate {
  records: CatalogEntry[]
  updatedAt: number
}

const ENDPOINT = 'https://amiiboapi.org/api/amiibo/'
const BUNDLED = new Map<string, CatalogEntry>(bundledCatalog.map((record) => [record.id, record]))
const LEGACY_SERIES = 'Legend Of Zelda'

export const FEATURED = ['0100000004180902', '0101000004190902', '01020100041a0902', '0100000003530902']

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

function parseRecord(value: unknown): CatalogEntry | undefined {
  if (typeof value !== 'object' || value === null) return
  const info = value as Record<string, unknown>
  const { head, tail, name, gameSeries, amiiboSeries, type } = info
  if (typeof head !== 'string' || typeof tail !== 'string' || !/^[0-9a-f]{8}$/i.test(head) || !/^[0-9a-f]{8}$/i.test(tail)) return
  if (typeof name !== 'string' || !name.trim() || typeof gameSeries !== 'string' || typeof amiiboSeries !== 'string') return
  const id = `${head}${tail}`.toLowerCase()
  return {
    id, name, franchise: gameSeries, series: amiiboSeries, type: typeof type === 'string' ? type : '',
    image: BUNDLED.get(id)?.image || `https://raw.githubusercontent.com/8bitDream/AmiiboAPI/master/webp/icon_${id.slice(0, 8)}-${id.slice(8)}.webp`,
  }
}

async function cacheImage(url: string) {
  if (!url.startsWith('https://') || await readImage(url)) return
  const response = await fetch(url, { signal: AbortSignal.timeout(12_000) })
  if (!response.ok || !response.headers.get('Content-Type')?.startsWith('image/')) {
    throw new Error('Imagen no disponible.')
  }
  const blob = await response.blob()
  if (blob.size > 2 * 1024 * 1024) throw new Error('La imagen supera el tamaño admitido.')
  await saveImage(url, blob)
}

export async function syncCatalog(onProgress: (done: number, total: number) => void) {
  const response = await fetch(ENDPOINT, { signal: AbortSignal.timeout(18_000) })
  if (!response.ok) throw new Error(`El catálogo no respondió correctamente (${response.status}).`)
  const payload: unknown = await response.json()
  if (typeof payload !== 'object' || payload === null || !('amiibo' in payload) || !Array.isArray(payload.amiibo)) {
    throw new Error('El catálogo recibido no tiene el formato esperado.')
  }
  const entries = payload.amiibo.map(parseRecord).filter((record): record is CatalogEntry => Boolean(record))
  if (!entries.length) throw new Error('El catálogo recibido está vacío.')

  const records = [...new Map(entries.map((record) => [record.id, record])).values()]
  const externalImages = records.filter((record) => record.image.startsWith('https://'))
  let missing = 0
  let done = 0
  onProgress(done, externalImages.length)
  for (let index = 0; index < externalImages.length; index += 8) {
    const results = await Promise.allSettled(externalImages.slice(index, index + 8).map(({ image }) => cacheImage(image)))
    missing += results.filter((result) => result.status === 'rejected').length
    done += results.length
    onProgress(done, externalImages.length)
  }

  const update = { records, updatedAt: Date.now() }
  await saveCatalogUpdate(update)
  return { update, missing }
}
