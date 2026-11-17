import { MAX_COVER_BYTES, readCover } from './coverImages'
import { saveMissingCovers, type DumpRecord } from './dbStorage'

const SOURCE = 'https://raw.githubusercontent.com/8bitDream/AmiiboAPI/master'
const CONCURRENCY = 6
const TIMEOUT_MS = 15_000

export interface CoverProgress {
  checked: number
  total: number
}

async function fetchCover(id: string, signal: AbortSignal) {
  if (signal.aborted || !/^[\da-f]{16}$/i.test(id)) return
  const controller = new AbortController()
  const cancel = () => controller.abort()
  signal.addEventListener('abort', cancel, { once: true })
  const timer = window.setTimeout(cancel, TIMEOUT_MS)
  const file = `icon_${id.slice(0, 8)}-${id.slice(8)}`.toLowerCase()
  try {
    for (const path of [`webp/${file}.webp`, `images/${file}.png`]) {
      const response = await fetch(`${SOURCE}/${path}`, {
        credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal,
      })
      if (response.status === 404) continue
      if (!response.ok) throw new Error(`AmiiboAPI respondió con HTTP ${response.status}.`)
      if (Number(response.headers.get('Content-Length')) > MAX_COVER_BYTES) {
        throw new Error('La portada supera los 8 MiB.')
      }
      return await readCover(await response.blob())
    }
  } finally {
    window.clearTimeout(timer)
    signal.removeEventListener('abort', cancel)
  }
}

export async function downloadMissingCovers(
  records: DumpRecord[], signal: AbortSignal, report: (progress: CoverProgress) => void,
) {
  const groups = new Map<string, string[]>()
  for (const { amiiboId, key, cover } of records) {
    if (cover) continue
    const keys = groups.get(amiiboId) ?? []
    keys.push(key)
    groups.set(amiiboId, keys)
  }

  const pending = [...groups]
  const result = { saved: 0, missing: 0, failed: 0 }
  let checked = 0
  report({ checked, total: pending.length })
  for (let offset = 0; offset < pending.length && !signal.aborted; offset += CONCURRENCY) {
    await Promise.all(pending.slice(offset, offset + CONCURRENCY).map(async ([id, keys]) => {
      try {
        const cover = await fetchCover(id, signal)
        if (signal.aborted) return
        if (cover) {
          const saved = await saveMissingCovers(keys, cover)
          result.saved += saved
        } else {
          result.missing += keys.length
        }
      } catch {
        if (!signal.aborted) result.failed += keys.length
      }
      if (!signal.aborted) report({ checked: ++checked, total: pending.length })
    }))
  }
  return result
}
