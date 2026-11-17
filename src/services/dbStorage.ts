import { createStore, del, get, promisifyRequest, set, values } from 'idb-keyval'

export interface DumpRecord {
  key: string
  amiiboId: string
  filename: string
  bytes: Uint8Array<ArrayBuffer>
  importedAt: number
}

const dumps = createStore('amiibolink-library', 'dumps')
const metadata = createStore('amiibolink-metadata', 'catalog')
const images = createStore('amiibolink-images', 'thumbs')

export const readLibrary = () => values<DumpRecord>(dumps)
export const deleteDump = (key: string) => del(key, dumps)

export async function saveDumps(records: DumpRecord[]) {
  const unique = [...new Map(records.map((record) => [record.key, record])).values()]
  if (!unique.length) return { added: 0, duplicates: 0 }

  return dumps('readwrite', async (store) => {
    let added = 0
    for (const record of unique) {
      const request = store.getKey(record.key)
      request.onsuccess = () => {
        if (request.result !== undefined) return
        store.add(record, record.key)
        added++
      }
    }
    await promisifyRequest(store.transaction)
    return { added, duplicates: records.length - added }
  })
}

export const readCatalogUpdate = <T>() => get<T>('update', metadata)
export const saveCatalogUpdate = <T>(update: T) => set('update', update, metadata)
export const readImage = (url: string) => get<Blob>(url, images)
export const saveImage = (url: string, image: Blob) => set(url, image, images)
