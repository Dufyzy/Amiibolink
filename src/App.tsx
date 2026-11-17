import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, CircleAlert, CircleCheck, FolderOpen, ImageDown, ListFilter, Plus, RefreshCw, Search, X } from 'lucide-react'
import { AmiiboCard } from './components/AmiiboCard'
import { BleConsole } from './components/BleConsole'
import { FileDialog, type FileAction } from './components/FileDialog'
import { Header } from './components/Header'
import { useDevice } from './hooks/useDevice'
import { usePwa } from './hooks/usePwa'
import { downloadMissingCovers, type CoverProgress } from './services/amiiboCovers'
import { buildCatalog, searchKey, seriesName, type CatalogUpdate } from './services/catalog'
import { COVER_ACCEPT, readCover } from './services/coverImages'
import { deleteDump, deleteLegacyImageCache, readCatalogUpdate, readLibrary, saveDumps, setDumpCover, type DumpRecord } from './services/dbStorage'
import { createRecord, importFiles } from './services/importFiles'
import { readUid, toHex } from './services/ntag215Utils'

type Notice = { text: string; error?: boolean; details?: string[] }

const PAGE_SIZE = 12
const collator = new Intl.Collator('es', { numeric: true })

function describeError(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? 'El navegador no pudo completar la operación.')
}

export default function App() {
  const [library, setLibrary] = useState<DumpRecord[]>([])
  const [update, setUpdate] = useState<CatalogUpdate>()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('')
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [importing, setImporting] = useState(false)
  const [coverProgress, setCoverProgress] = useState<CoverProgress>()
  const [notice, setNotice] = useState<Notice>()
  const [action, setAction] = useState<FileAction>()
  const importer = useRef<HTMLInputElement>(null)
  const coverSearch = useRef<AbortController>(null)
  const { offlineReady, canInstall, install } = usePwa()
  const device = useDevice((text, error) => setNotice({ text, error }))

  useEffect(() => {
    let active = true
    void deleteLegacyImageCache().catch(() => undefined)
    void readLibrary().then((records) => {
      if (!active) return
      setLibrary(records)
    }).catch((error) => { if (active) setNotice({ error: true, text: `No se pudo abrir la biblioteca. ${describeError(error)}` }) })
    void readCatalogUpdate<CatalogUpdate>().then((stored) => {
      if (active) setUpdate(stored)
    }).catch((error) => { if (active) setNotice({ error: true, text: `No se pudieron leer los datos de identificación. ${describeError(error)}` }) })
    return () => {
      active = false
      coverSearch.current?.abort()
    }
  }, [])

  const catalog = useMemo(() => buildCatalog(update), [update])
  const items = useMemo(() => [...library]
    .sort((left, right) => right.importedAt - left.importedAt)
    .map((dump) => ({ entry: catalog.get(dump.amiiboId), dump })), [library, catalog])

  const filterOptions = useMemo(() => ({
    franchise: [...new Set(items.flatMap(({ entry }) => entry ? [entry.franchise] : []))].sort(collator.compare),
    series: [...new Set(items.flatMap(({ entry }) => entry ? [seriesName(entry.series)] : []))].sort(collator.compare),
  }), [items])

  const filtered = useMemo(() => {
    const words = searchKey(query.trim()).split(/\s+/).filter(Boolean)
    return items.filter(({ entry, dump }) => {
      if (filter && filter !== `franchise:${entry?.franchise}` && filter !== `series:${seriesName(entry?.series ?? '')}`) return false
      const haystack = searchKey([entry?.name, entry?.franchise, entry?.series, dump.filename, dump.amiiboId].join(' '))
      return words.every((word) => haystack.includes(word))
    })
  }, [items, query, filter])

  function clearFilters() {
    setQuery('')
    setFilter('')
    setLimit(PAGE_SIZE)
  }

  async function handleImport(files: File[]) {
    if (!files.length || importing) return
    setImporting(true)
    setNotice(undefined)
    try {
      const result = await importFiles(files)
      setLibrary(await readLibrary())
      if (result.added || result.duplicates) clearFilters()
      if (result.added) void navigator.storage?.persist?.().catch(() => undefined)
      const summary = [`${result.added} importados`, `${result.duplicates} duplicados`, `${result.errors.length} con error`]
      if (result.covers) summary.push(result.covers === 1 ? '1 portada asociada' : `${result.covers} portadas asociadas`)
      if (result.skipped) summary.push(result.skipped === 1 ? '1 auxiliar omitido' : `${result.skipped} auxiliares omitidos`)
      setNotice({ text: summary.join(' · '), error: result.errors.length > 0, details: result.errors })
    } catch (error) {
      setNotice({ text: `No se pudo guardar la importación. ${describeError(error)}`, error: true })
    } finally {
      setImporting(false)
    }
  }

  async function findCovers() {
    if (coverSearch.current) return
    if (!navigator.onLine) {
      setNotice({ text: 'Conéctate a internet para buscar portadas en AmiiboAPI.', error: true })
      return
    }
    const controller = new AbortController()
    coverSearch.current = controller
    const stop = () => controller.abort()
    window.addEventListener('offline', stop, { once: true })
    setNotice(undefined)
    try {
      const result = await downloadMissingCovers(library, controller.signal, setCoverProgress)
      setLibrary(await readLibrary())
      const summary = [result.saved === 1 ? '1 portada guardada' : `${result.saved} portadas guardadas`]
      if (controller.signal.aborted) summary.unshift('Búsqueda detenida')
      if (result.missing) summary.push(`${result.missing} sin portada en AmiiboAPI`)
      if (result.failed) summary.push(`${result.failed} con error de descarga o guardado`)
      setNotice({ text: summary.join(' · '), error: result.failed > 0 })
    } catch (error) {
      setNotice({ text: `No se pudo completar la búsqueda. ${describeError(error)}`, error: true })
    } finally {
      window.removeEventListener('offline', stop)
      coverSearch.current = null
      setCoverProgress(undefined)
    }
  }

  function download(dump: DumpRecord) {
    const url = URL.createObjectURL(new Blob([dump.bytes], { type: 'application/octet-stream' }))
    const link = document.createElement('a')
    link.href = url
    link.download = dump.filename
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  async function confirmAction(file?: File) {
    if (!action) return
    if (action.type === 'delete') {
      await deleteDump(action.dump.key)
      setLibrary(await readLibrary())
      setNotice({ text: 'Archivo eliminado de la biblioteca.' })
      return
    }
    if (action.type === 'cover') {
      await setDumpCover(action.dump.key, file ? await readCover(file) : undefined)
      setLibrary(await readLibrary())
      setNotice({ text: file ? 'Portada guardada en este dispositivo.' : 'Portada eliminada.' })
      return
    }
    if (file?.size !== 160) throw new Error('El archivo de claves debe tener 160 bytes.')
    const { rerollSignedAmiibo } = await import('./services/amiiboCrypto')
    const privateBytes = new Uint8Array(await file.arrayBuffer())
    try {
      const bytes = await rerollSignedAmiibo(action.dump.bytes, privateBytes)
      const filename = `${action.dump.filename.replace(/\.bin$/i, '')}.uid-${toHex(readUid(bytes))}.bin`
      await saveDumps([{ ...await createRecord(filename, bytes), cover: action.dump.cover }])
      setLibrary(await readLibrary())
      setNotice({ text: 'Copia firmada con nuevo UID guardada en la biblioteca.' })
    } finally {
      privateBytes.fill(0)
    }
  }

  return (
    <>
      <a className="skip-link" href="#collection">Ir a la biblioteca</a>
      <Header device={device} offlineReady={offlineReady} canInstall={canInstall}
        onInstall={() => { void install().catch((error) => setNotice({ error: true, text: describeError(error) })) }} />

      <main className="frame" id="collection">
        <section className="collection" aria-labelledby="collection-title">
          <div className="collection-heading">
            <div>
              <h2 id="collection-title">Mi biblioteca</h2>
              {library.length > 0 && <p>{library.length} {library.length === 1 ? 'archivo guardado' : 'archivos guardados'} en este dispositivo.</p>}
            </div>
            {coverProgress ? (
              <div className="cover-search">
                <div>
                  <span>{coverProgress.checked} de {coverProgress.total} revisados</span>
                  <progress max={coverProgress.total || 1} value={coverProgress.checked} aria-label="Búsqueda de portadas" />
                </div>
                <button className="button button-outline" type="button" onClick={() => coverSearch.current?.abort()}>Detener búsqueda</button>
              </div>
            ) : library.some(({ cover }) => !cover) && (
              <button className="button button-outline" type="button" disabled={importing} onClick={() => void findCovers()}>
                <ImageDown size={17} aria-hidden="true" /> Buscar portadas en AmiiboAPI
              </button>
            )}
          </div>

          {items.length > 0 && <div className="toolbar">
            <div className="filters">
              <label className="search-field">
                <Search size={18} aria-hidden="true" />
                <span className="sr-only">Buscar Amiibo</span>
                <input type="search" placeholder="Buscar Amiibo…" value={query} onChange={(event) => {
                  setQuery(event.target.value)
                  setLimit(PAGE_SIZE)
                }} />
              </label>
              {(filterOptions.series.length > 0 || filterOptions.franchise.length > 0) && <div className="select-field">
                <ListFilter size={17} aria-hidden="true" />
                <select aria-label="Filtrar por juego o serie" value={filter} onChange={(event) => {
                  setFilter(event.target.value)
                  setLimit(PAGE_SIZE)
                }}>
                  <option value="">Juego o serie</option>
                  <optgroup label="Juegos y franquicias">
                    {filterOptions.franchise.map((value) => <option key={value} value={`franchise:${value}`}>{value}</option>)}
                  </optgroup>
                  <optgroup label="Series Amiibo">
                    {filterOptions.series.map((value) => <option key={value} value={`series:${value}`}>{value}</option>)}
                  </optgroup>
                </select>
                <ChevronDown size={15} aria-hidden="true" className="select-chevron" />
              </div>}
            </div>
          </div>}

          {notice && <div className={`notice ${notice.error ? 'notice-error' : ''}`}>
            {notice.error ? <CircleAlert size={18} aria-hidden="true" /> : <CircleCheck size={18} aria-hidden="true" />}
            <div role={notice.error ? 'alert' : 'status'}>
              <span>{notice.text}</span>
              {Boolean(notice.details?.length) && <details><summary>Ver archivos con error</summary>
                <ul>{notice.details?.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
              </details>}
            </div>
            <button title="Cerrar aviso" aria-label="Cerrar aviso" className="icon-button" type="button" onClick={() => setNotice(undefined)}>
              <X size={17} />
            </button>
          </div>}

          {filtered.length ? <>
            <div className="figure-grid">
              {filtered.slice(0, limit).map(({ entry, dump }) => (
                <AmiiboCard key={dump.key} entry={entry} dump={dump} sent={device.lastSuccess === dump.key}
                  transfer={device.transfer?.key === dump.key ? device.transfer : undefined}
                  canSend={device.connection === 'connected' && !device.busy}
                  onUpload={() => void device.upload(dump.key, dump.bytes, entry?.name || dump.filename)}
                  onDownload={() => download(dump)}
                  onCover={() => setAction({ type: 'cover', dump })}
                  onReroll={() => setAction({ type: 'reroll', dump })}
                  onDelete={() => setAction({ type: 'delete', dump })} />
              ))}
            </div>
            {filtered.length > limit && <button className="button button-outline more-button" type="button"
              onClick={() => setLimit((previous) => previous + PAGE_SIZE)}>Mostrar más <span>{limit} de {filtered.length}</span></button>}
          </> : <div className="empty-state">
            {items.length ? <Search size={36} strokeWidth={1.25} /> : <FolderOpen size={36} strokeWidth={1.25} />}
            <h3>{items.length ? 'Sin coincidencias' : 'Tu biblioteca está vacía'}</h3>
            <p>{items.length ? 'Prueba otro nombre, ID o filtro.' : 'Importa un .bin o un ZIP con varios. Puedes incluir una portada con el mismo nombre que cada .bin.'}</p>
            {items.length ? <button className="button button-outline" type="button" onClick={clearFilters}>Limpiar filtros</button>
              : <button className="button button-outline" type="button" disabled={importing} onClick={() => importer.current?.click()}>Importar archivos</button>}
          </div>}
        </section>

        <footer className="footer">
          <BleConsole logs={device.logs} onClear={device.clearLogs} />
        </footer>
      </main>

      <input ref={importer} className="hidden" type="file" multiple accept={`.bin,.zip,application/zip,application/octet-stream,${COVER_ACCEPT}`}
        aria-label="Seleccionar archivos Amiibo" onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          event.target.value = ''
          void handleImport(files)
        }} />
      <button className="button button-primary import-fab" type="button" disabled={importing}
        onClick={() => importer.current?.click()}>
        {importing ? <RefreshCw size={22} className="spin" aria-hidden="true" /> : <Plus size={23} aria-hidden="true" />}
        {importing ? 'Importando…' : 'Importar .bin / .zip'}
      </button>

      {action && <FileDialog action={action} onClose={() => setAction(undefined)} onConfirm={confirmAction} />}
    </>
  )
}
