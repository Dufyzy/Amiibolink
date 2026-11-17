import type { JSZipObject, JSZipStreamHelper } from 'jszip'
import { coverKey, isCoverFilename, MAX_COVER_BYTES, readCover } from './coverImages'
import { saveDumps, type DumpRecord } from './dbStorage'
import { DUMP_SIZES, getAmiiboId, normalizeDump, toHex } from './ntag215Utils'

const MAX_DUMP = Math.max(...DUMP_SIZES)
const MAX_ZIP = 64 * 1024 * 1024
const MAX_ENTRIES = 10_000

function unpack(entry: JSZipObject, maxBytes: number, sizeError: string) {
  return new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
    // JSZip documents the browser stream, but omits it from JSZipObject's declarations.
    const stream = (entry as JSZipObject & {
      internalStream(type: 'uint8array'): JSZipStreamHelper<Uint8Array>
    }).internalStream('uint8array')
    const chunks: Uint8Array[] = []
    let length = 0
    stream.on('data', (chunk) => {
      if (length + chunk.length > maxBytes) {
        stream.pause()
        reject(new Error(sizeError))
        return
      }
      chunks.push(chunk)
      length += chunk.length
    }).on('error', reject).on('end', () => {
      const bytes = new Uint8Array(length)
      let offset = 0
      for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.length
      }
      resolve(bytes)
    }).resume()
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
  const covers = files.filter((file) => isCoverFilename(file.name))
  const looseCovers = new Map(covers.map((file) => [coverKey(file.name), file]))
  const pairedCovers = new Set<string>()
  let coverBudget = MAX_ZIP
  const report = (name: string, error: unknown) => {
    errors.push(`${name} · ${error instanceof Error ? error.message : String(error)}`)
  }

  async function addDump(filename: string, bytes: Uint8Array<ArrayBuffer>, loadCover?: () => Promise<Blob>) {
    const record = await createRecord(filename, bytes)
    if (loadCover) {
      try {
        const image = await loadCover()
        if (image.size > coverBudget) throw new Error('Las portadas de este lote superan los 64 MiB.')
        record.cover = await readCover(image)
        coverBudget -= image.size
      } catch (error) {
        report(`${filename} (portada)`, error)
      }
    }
    records.push(record)
  }

  for (const file of files) {
    try {
      if (/\.bin$/i.test(file.name)) {
        const key = coverKey(file.name)
        const cover = looseCovers.get(key)
        if (cover) pairedCovers.add(key)
        if (file.size > MAX_DUMP) throw new Error('El archivo supera los 572 bytes.')
        await addDump(file.name, new Uint8Array(await file.arrayBuffer()), cover && (async () => cover))
      } else if (/\.zip$/i.test(file.name)) {
        if (file.size > MAX_ZIP) throw new Error('El ZIP supera los 64 MiB.')
        const { default: JSZip } = await import('jszip')
        const archive = await JSZip.loadAsync(await file.arrayBuffer())
        const entries = Object.values(archive.files).filter((entry) => !entry.dir)
        const bins = entries.filter((entry) => /\.bin$/i.test(entry.name))
        if (!bins.length) throw new Error('El ZIP no contiene archivos .bin.')
        if (bins.length > MAX_ENTRIES) throw new Error('El ZIP contiene más de 10 000 archivos .bin.')
        const images = new Map(entries.filter((entry) => isCoverFilename(entry.name)).map((entry) => [coverKey(entry.name), entry]))
        for (const entry of bins) {
          try {
            const bytes = await unpack(entry, MAX_DUMP, 'El archivo supera los 572 bytes.')
            const image = images.get(coverKey(entry.name))
            await addDump(entry.name, bytes, image && (async () => new Blob([await unpack(
              image, Math.min(MAX_COVER_BYTES, coverBudget), coverBudget < MAX_COVER_BYTES
                ? 'Las portadas de este lote superan los 64 MiB.' : 'La portada supera los 8 MiB.',
            )])))
          } catch (error) {
            report(`${file.name} / ${entry.name}`, error)
          }
        }
      } else if (!isCoverFilename(file.name)) {
        throw new Error('Selecciona un archivo .bin, .zip o una portada JPG, PNG o WebP.')
      }
    } catch (error) {
      report(file.name, error)
    }
  }

  for (const [key, cover] of looseCovers) {
    if (!pairedCovers.has(key)) errors.push(`${cover.name} · Importa el .bin del mismo nombre o elige la portada desde su ficha.`)
  }

  return { ...await saveDumps(records), errors }
}
