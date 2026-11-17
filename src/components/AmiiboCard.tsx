import { useEffect, useState } from 'react'
import { Check, Download, Fingerprint, Nfc, Trash2, Upload } from 'lucide-react'
import type { ActiveTransfer } from '../hooks/useDevice'
import { seriesName, type CatalogEntry } from '../services/catalog'
import { readImage, type DumpRecord } from '../services/dbStorage'

const STAGE_LABELS = {
  preparing: 'Preparando transferencia',
  sending: 'Enviando datos',
  committing: 'Confirmando grabación',
}

function FigureImage({ image, type }: { image?: string; type?: string }) {
  const [src, setSrc] = useState<string>()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let objectUrl: string | undefined
    let active = true
    setSrc(undefined)
    setFailed(false)
    if (image?.startsWith('https://')) {
      void readImage(image).then((blob) => {
        if (!active || !blob) return
        objectUrl = URL.createObjectURL(blob)
        setSrc(objectUrl)
      }).catch(() => setFailed(true))
    } else if (image) {
      setSrc(`${import.meta.env.BASE_URL}${image}`)
    }
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [image])

  return (
    <div className={`figure-media ${type === 'Card' ? 'figure-media-card' : ''}`}>
      {src && !failed
        ? <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
        : <Nfc className="figure-placeholder" size={54} strokeWidth={1.1} aria-hidden="true" />}
    </div>
  )
}

interface AmiiboCardProps {
  entry?: CatalogEntry
  dump?: DumpRecord
  transfer?: ActiveTransfer
  sent?: boolean
  canSend?: boolean
  onUpload?: () => void
  onDownload?: () => void
  onReroll?: () => void
  onDelete?: () => void
}

export function AmiiboCard({ entry, dump, transfer, sent, canSend, onUpload, onDownload, onReroll, onDelete }: AmiiboCardProps) {
  const name = entry?.name || dump?.filename || 'Amiibo sin identificar'
  const id = entry?.id ?? dump?.amiiboId
  const detail = entry ? seriesName(entry.series) : 'Sin coincidencia en el catálogo'

  return (
    <article className="amiibo-card" aria-label={name}>
      <FigureImage image={entry?.image} type={entry?.type} />
      <div className="figure-info">
        <p className="figure-series">{detail}</p>
        <h3>{name}</h3>
        <p className="figure-id">{id?.toUpperCase()}</p>
        {dump && (
          <>
            <p className="figure-filename" title={dump.filename}>{dump.filename}</p>
            {transfer && (
              <div className="transfer" role="status">
                <span>{STAGE_LABELS[transfer.stage]}</span><span>{transfer.percent}%</span>
                <progress max={100} value={transfer.percent} aria-label={STAGE_LABELS[transfer.stage]} />
              </div>
            )}
            {sent && !transfer && <p className="transfer-complete"><Check size={15} aria-hidden="true" /> Grabación confirmada <span>100%</span></p>}
            <button className="button button-outline upload-button" type="button" disabled={!canSend}
              title={canSend ? undefined : 'Conecta el emulador y espera a que termine cualquier operación BLE.'}
              onClick={onUpload}>
              {sent ? <Check size={16} aria-hidden="true" /> : <Upload size={16} aria-hidden="true" />}
              {transfer ? 'Cargando…' : 'Cargar al Emulador'}
            </button>
            <div className="card-actions">
              <button className="icon-button" type="button" onClick={onDownload} title="Descargar .bin" aria-label={`Descargar ${name}`}>
                <Download size={17} />
              </button>
              <button className="icon-button" type="button" onClick={onReroll} title="Generar nuevo UID" aria-label={`Generar nuevo UID para ${name}`}>
                <Fingerprint size={17} />
              </button>
              <button className="icon-button" type="button" onClick={onDelete} title="Eliminar de la biblioteca" aria-label={`Eliminar ${name}`}>
                <Trash2 size={17} />
              </button>
            </div>
          </>
        )}
      </div>
    </article>
  )
}
