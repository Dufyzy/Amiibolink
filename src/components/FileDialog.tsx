import { useEffect, useRef, useState } from 'react'
import { COVER_ACCEPT } from '../services/coverImages'
import type { DumpRecord } from '../services/dbStorage'

export type FileAction = { type: 'delete' | 'reroll' | 'cover'; dump: DumpRecord }

export function FileDialog({ action, onClose, onConfirm }: {
  action: FileAction
  onClose: () => void
  onConfirm: (file?: File) => Promise<void>
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [selectedFile, setSelectedFile] = useState<File>()
  const reroll = action.type === 'reroll'
  const cover = action.type === 'cover'
  const deleting = action.type === 'delete'
  const title = reroll ? 'Generar nuevo UID' : cover ? 'Portada del Amiibo' : 'Eliminar archivo'
  const confirmLabel = reroll ? 'Guardar copia' : cover ? 'Guardar portada' : 'Eliminar archivo'

  useEffect(() => {
    dialog.current?.showModal()
    cancel.current?.focus()
  }, [])

  async function confirm(file?: File) {
    setWorking(true)
    setError('')
    try {
      await onConfirm(file)
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'La operación falló.')
      setWorking(false)
    }
  }

  return (
    <dialog ref={dialog} className="file-dialog" aria-labelledby="file-dialog-title" onCancel={(event) => {
      event.preventDefault()
      if (!working) onClose()
    }}>
      <h2 id="file-dialog-title">{title}</h2>
      <p className="dialog-filename">{action.dump.filename}</p>
      {reroll ? <>
        <p>Firma una copia con tu archivo <code>key_retail.bin</code> de 160 bytes. Las claves se usan en memoria.</p>
        <label className="file-label" htmlFor="uid-keys">Archivo de claves</label>
        <input id="uid-keys" type="file" accept=".bin,application/octet-stream" disabled={working}
          onChange={(event) => setSelectedFile(event.target.files?.[0])} />
      </> : cover ? <>
        <p>La portada se guarda en este dispositivo. Formatos JPG, PNG o WebP de hasta 8 MiB.</p>
        <label className="file-label" htmlFor="cover-file">Archivo de imagen</label>
        <input id="cover-file" type="file" accept={COVER_ACCEPT} disabled={working}
          onChange={(event) => setSelectedFile(event.target.files?.[0])} />
      </> : <p>Se borrará esta copia de la biblioteca local.</p>}
      {error && <p className="error-text" role="alert">{error}</p>}
      <div className="dialog-actions">
        <button ref={cancel} className="button button-outline" type="button" disabled={working} onClick={onClose}>Cancelar</button>
        {cover && action.dump.cover && <button className="button button-quiet" type="button" disabled={working}
          onClick={() => void confirm()}>Quitar portada</button>}
        <button className={`button ${deleting ? 'button-danger' : 'button-primary'}`} type="button"
          disabled={working || (!deleting && !selectedFile)} onClick={() => void confirm(selectedFile)}>
          {working ? 'Procesando…' : confirmLabel}
        </button>
      </div>
    </dialog>
  )
}
