import { createStore, del, get, promisifyRequest, update, values } from 'idb-keyval'
import type { CoverData } from './coverImages'

export interface DumpRecord {
  key: string
  amiiboId: string
  filename: string
  bytes: Uint8Array<ArrayBuffer>
  importedAt: number
  cover?: CoverData | Blob
}

const dumps = createStore('amiibolink-library', 'dumps')
const metadata = createStore('amiibolink-metadata', 'catalog')

export const readLibrary = () => values<DumpRecord>(dumps)
export const deleteDump = (key: string) => del(key, dumps)

export function setDumpCover(key: string, cover?: CoverData) {
  return update<DumpRecord>(key, (record) => {
    if (!record) throw new Error('El archivo ya no está en la biblioteca.')
    return { ...record, cover }
  }, dumps)
}

export async function saveDumps(records: DumpRecord[]) {
  const unique = new Map<string, DumpRecord>()
  for (const record of records) {
    const previous = unique.get(record.key)
    if (!previous) unique.set(record.key, record)
    else if (!previous.cover && record.cover) unique.set(record.key, { ...previous, cover: record.cover })
  }
  if (!unique.size) return { added: 0, duplicates: 0, covers: 0 }

  return dumps('readwrite', async (store) => {
    let added = 0
    let covers = 0
    for (const record of unique.values()) {
      const request = store.get(record.key)
      request.onsuccess = () => {
        const previous = request.result as DumpRecord | undefined
        if (!previous) {
          store.add(record, record.key)
          added++
          if (record.cover) covers++
        } else if (!previous.cover && record.cover) {
          store.put({ ...previous, cover: record.cover }, record.key)
          covers++
        }
      }
    }
    await promisifyRequest(store.transaction)
    return { added, duplicates: records.length - added, covers }
  })
}

export const readCatalogUpdate = <T>() => get<T>('update', metadata)

export async function deleteLegacyImageCache() {
  await promisifyRequest(indexedDB.deleteDatabase('amiibolink-images'))
}
