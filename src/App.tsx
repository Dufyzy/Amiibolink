import { useEffect, useMemo, useRef, useState } from 'react'
import { Archive, ChevronDown, CircleAlert, CircleCheck, FolderOpen, ListFilter, Plus, RefreshCw, Search, X } from 'lucide-react'
import { AmiiboCard } from './components/AmiiboCard'
import { BleConsole } from './components/BleConsole'
import { FileDialog, type FileAction } from './components/FileDialog'
import { Header } from './components/Header'
import { useDevice } from './hooks/useDevice'
import { usePwa } from './hooks/usePwa'
import { buildCatalog, FEATURED, searchKey, seriesName, syncCatalog, type CatalogEntry, type CatalogUpdate } from './services/catalog'
import { deleteDump, readCatalogUpdate, readLibrary, saveDumps, type DumpRecord } from './services/dbStorage'
import { createRecord, importFiles } from './services/importFiles'
import { readUid, toHex } from './services/ntag215Utils'

type View = 'catalog' | 'library'
type Item = { key: string; entry?: CatalogEntry; dump?: DumpRecord }
type Notice = { text: string; error?: boolean; details?: string[] }

const PAGE_SIZE = 12
const collator = new Intl.Collator('es', { numeric: true })

function describeError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export default function App() {
  const [view, setView] = useState<View>('catalog')
  const [library, setLibrary] = useState<DumpRecord[]>([])
  const [update, setUpdate] = useState<CatalogUpdate>()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('')
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [importing, setImporting] = useState(false)
  const [syncStatus, setSyncStatus] = useState('')
  const [notice, setNotice] = useState<Notice>()
  const [action, setAction] = useState<FileAction>()
  const importer = useRef<HTMLInputElement>(null)
  const { offlineReady, canInstall, install } = usePwa()
  const device = useDevice((text, error) => setNotice({ text, error }))

  useEffect(() => {
    let active = true
    void readLibrary().then((records) => {
      if (!active) return
      setLibrary(records)
      if (records.length) setView('library')
    }).catch((error) => { if (active) setNotice({ error: true, text: `No se pudo abrir la biblioteca. ${describeError(error)}` }) })
    void readCatalogUpdate<CatalogUpdate>().then((stored) => {
      if (active) setUpdate(stored)
    }).catch((error) => { if (active) setNotice({ error: true, text: `No se pudo leer el catálogo guardado. ${describeError(error)}` }) })
    return () => { active = false }
  }, [])

  const catalog = useMemo(() => buildCatalog(update), [update])
  const catalogItems = useMemo(() => {
    const remaining = [...catalog.values()].filter(({ id }) => !FEATURED.includes(id))
    remaining.sort((left, right) => collator.compare(left.name, right.name))
    const featured = FEATURED.map((id) => catalog.get(id)).filter((entry): entry is CatalogEntry => Boolean(entry))
    return [...featured, ...remaining].map((entry): Item => ({ key: entry.id, entry }))
  }, [catalog])

  const items = useMemo(() => view === 'catalog' ? catalogItems : [...library]
    .sort((left, right) => right.importedAt - left.importedAt)
    .map((dump): Item => ({ key: dump.key, entry: catalog.get(dump.amiiboId), dump })), [view, library, catalog, catalogItems])

  const filterOptions = useMemo(() => ({
    franchise: [...new Set(items.flatMap(({ entry }) => entry ? [entry.franchise] : []))].sort(collator.compare),
    series: [...new Set(items.flatMap(({ entry }) => entry ? [seriesName(entry.series)] : []))].sort(collator.compare),
  }), [items])

  const filtered = useMemo(() => {
    const words = searchKey(query.trim()).split(/\s+/).filter(Boolean)
    return items.filter(({ entry, dump }) => {
      if (filter && filter !== `franchise:${entry?.franchise}` && filter !== `series:${seriesName(entry?.series ?? '')}`) return false
      const haystack = searchKey([entry?.name, entry?.franchise, entry?.series, entry?.id, dump?.filename, dump?.amiiboId].join(' '))
      return words.every((word) => haystack.includes(word))
    })
  }, [items, query, filter])

  function changeView(next: View) {
    setView(next)
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
      if (result.added || result.duplicates) changeView('library')
      if (result.added) void navigator.storage?.persist?.().catch(() => undefined)
      const summary = [`${result.added} importados`, `${result.duplicates} duplicados`, `${result.errors.length} con error`]
      setNotice({ text: summary.join(' · '), error: result.errors.length > 0, details: result.errors })
    } catch (error) {
      setNotice({ text: `No se pudo guardar la importación. ${describeError(error)}`, error: true })
    } finally {
      setImporting(false)
    }
  }

  async function refreshCatalog() {
    setSyncStatus('Consultando catálogo…')
    try {
      const result = await syncCatalog((done, total) => setSyncStatus(total ? `Miniaturas ${done}/${total}` : 'Guardando catálogo…'))
      setUpdate(result.update)
      setNotice({ text: result.missing
        ? `Catálogo actualizado. ${result.missing} miniaturas quedaron pendientes.`
        : 'Catálogo actualizado y disponible sin conexión.', error: result.missing > 0 })
    } catch (error) {
      setNotice({ text: `No se pudo actualizar el catálogo. ${describeError(error)}`, error: true })
    } finally {
      setSyncStatus('')
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

  async function confirmAction(keys?: File) {
    if (!action) return
    if (action.type === 'delete') {
      await deleteDump(action.dump.key)
      setLibrary(await readLibrary())
      setNotice({ text: 'Archivo eliminado de la biblioteca.' })
      return
    }
    if (keys?.size !== 160) throw new Error('El archivo de claves debe tener 160 bytes.')
    const { rerollSignedAmiibo } = await import('./services/amiiboCrypto')
    const privateBytes = new Uint8Array(await keys.arrayBuffer())
    try {
      const bytes = await rerollSignedAmiibo(action.dump.bytes, privateBytes)
      const filename = `${action.dump.filename.replace(/\.bin$/i, '')}.uid-${toHex(readUid(bytes))}.bin`
      await saveDumps([await createRecord(filename, bytes)])
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
              <h2 id="collection-title">{view === 'catalog' ? 'Explorar Amiibo' : 'Mis archivos'}</h2>
              <p>{view === 'catalog' ? 'Identifica figuras y tarjetas de tu colección.' : 'Archivos guardados en este dispositivo.'}</p>
            </div>
            {view === 'catalog' && <button className="button button-quiet sync-button" type="button" disabled={Boolean(syncStatus)}
              onClick={() => void refreshCatalog()}>
              <RefreshCw size={16} aria-hidden="true" className={syncStatus ? 'spin' : undefined} />
              <span>{syncStatus || 'Actualizar catálogo'}</span>
            </button>}
          </div>

          <div className="toolbar">
            <div className="view-tabs" role="group" aria-label="Vista de la biblioteca">
              <button type="button" className="view-tab" aria-pressed={view === 'catalog'} onClick={() => changeView('catalog')}>
                <Archive size={16} aria-hidden="true" /> Catálogo <span>{catalog.size}</span>
              </button>
              <button type="button" className="view-tab" aria-pressed={view === 'library'} onClick={() => changeView('library')}>
                <FolderOpen size={16} aria-hidden="true" /> Mi biblioteca <span>{library.length}</span>
              </button>
            </div>
            <div className="filters">
              <label className="search-field">
                <Search size={18} aria-hidden="true" />
                <span className="sr-only">Buscar Amiibo</span>
                <input type="search" placeholder="Buscar Amiibo…" value={query} onChange={(event) => {
                  setQuery(event.target.value)
                  setLimit(PAGE_SIZE)
                }} />
              </label>
              <div className="select-field">
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
              </div>
            </div>
          </div>

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
              {filtered.slice(0, limit).map(({ key, entry, dump }) => (
                <AmiiboCard key={key} entry={entry} dump={dump} sent={device.lastSuccess === key}
                  transfer={device.transfer?.key === key ? device.transfer : undefined}
                  canSend={device.connection === 'connected' && !device.busy}
                  onUpload={dump ? () => void device.upload(key, dump.bytes, entry?.name || dump.filename) : undefined}
                  onDownload={dump ? () => download(dump) : undefined}
                  onReroll={dump ? () => setAction({ type: 'reroll', dump }) : undefined}
                  onDelete={dump ? () => setAction({ type: 'delete', dump }) : undefined} />
              ))}
            </div>
            {filtered.length > limit && <button className="button button-outline more-button" type="button"
              onClick={() => setLimit((previous) => previous + PAGE_SIZE)}>Mostrar más <span>{limit} de {filtered.length}</span></button>}
          </> : <div className="empty-state">
            {items.length ? <Search size={36} strokeWidth={1.25} /> : <FolderOpen size={36} strokeWidth={1.25} />}
            <h3>{items.length ? 'Sin coincidencias' : 'Tu biblioteca está vacía'}</h3>
            <p>{items.length ? 'Prueba otro nombre, ID o filtro.' : 'Importa un archivo .bin o un .zip con varios Amiibo.'}</p>
            {items.length ? <button className="button button-outline" type="button" onClick={() => { setQuery(''); setFilter('') }}>Limpiar filtros</button>
              : <button className="button button-outline" type="button" disabled={importing} onClick={() => importer.current?.click()}>Importar archivos</button>}
          </div>}
        </section>

        <footer className="footer">
          <BleConsole logs={device.logs} onClear={device.clearLogs} />
        </footer>
      </main>

      <input ref={importer} className="hidden" type="file" multiple accept=".bin,.zip,application/zip,application/octet-stream"
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
