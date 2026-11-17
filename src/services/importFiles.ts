import type { JSZipObject, JSZipStreamHelper } from 'jszip'
import { saveDumps, type DumpRecord } from './dbStorage'
import { DUMP_SIZES, getAmiiboId, normalizeDump, toHex } from './ntag215Utils'

const MAX_DUMP = Math.max(...DUMP_SIZES)
const MAX_ZIP = 64 * 1024 * 1024
const MAX_ENTRIES = 10_000

function unpackDump(entry: JSZipObject) {
  return new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
    // JSZip documents the browser stream, but omits it from JSZipObject's declarations.
    const stream = (entry as JSZipObject & {
      internalStream(type: 'uint8array'): JSZipStreamHelper<Uint8Array>
    }).internalStream('uint8array')
    const bytes = new Uint8Array(MAX_DUMP)
    let length = 0
    stream.on('data', (chunk) => {
      if (length + chunk.length > MAX_DUMP) {
        stream.pause()
        reject(new Error('El archivo supera los 572 bytes.'))
        return
      }
      bytes.set(chunk, length)
      length += chunk.length
    }).on('error', reject).on('end', () => resolve(bytes.slice(0, length))).resume()
  })
}

function basename(name: string) {
  return name.split(/[\\/]/).at(-1) || 'amiibo.bin'
}

export async function createRecord(filename: string, bytes: Uint8Array<ArrayBuffer>): Promise<DumpRecord> {
  const normalized = normalizeDump(bytes)
  const key = toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
  return { key, amiiboId: getAmiiboId(normalized), filename: basename(filename), bytes, importedAt: Date.now() }
}

export async function importFiles(files: File[]) {
  const records: DumpRecord[] = []
  const errors: string[] = []
  const report = (name: string, error: unknown) => {
    errors.push(`${name} · ${error instanceof Error ? error.message : String(error)}`)
  }

  for (const file of files) {
    try {
      if (/\.bin$/i.test(file.name)) {
        if (file.size > MAX_DUMP) throw new Error('El archivo supera los 572 bytes.')
        records.push(await createRecord(file.name, new Uint8Array(await file.arrayBuffer())))
      } else if (/\.zip$/i.test(file.name)) {
        if (file.size > MAX_ZIP) throw new Error('El ZIP supera los 64 MiB.')
        const { default: JSZip } = await import('jszip')
        const archive = await JSZip.loadAsync(await file.arrayBuffer())
        const entries = Object.values(archive.files).filter((entry) => !entry.dir && /\.bin$/i.test(entry.name))
        if (entries.length === 0) throw new Error('El ZIP no contiene archivos .bin.')
        if (entries.length > MAX_ENTRIES) throw new Error('El ZIP contiene más de 10 000 archivos .bin.')
        for (const entry of entries) {
          try {
            records.push(await createRecord(entry.name, await unpackDump(entry)))
          } catch (error) {
            report(`${file.name} / ${entry.name}`, error)
          }
        }
      } else {
        throw new Error('Selecciona un archivo .bin o .zip.')
      }
    } catch (error) {
      report(file.name, error)
    }
  }

  return { ...await saveDumps(records), errors }
}
