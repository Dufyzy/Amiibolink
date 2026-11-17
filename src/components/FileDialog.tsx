import { useEffect, useRef, useState } from 'react'
import type { DumpRecord } from '../services/dbStorage'

export type FileAction = { type: 'delete' | 'reroll'; dump: DumpRecord }

export function FileDialog({ action, onClose, onConfirm }: {
  action: FileAction
  onClose: () => void
  onConfirm: (keys?: File) => Promise<void>
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [keys, setKeys] = useState<File>()
  const reroll = action.type === 'reroll'

  useEffect(() => {
    dialog.current?.showModal()
    cancel.current?.focus()
  }, [])

  async function confirm() {
    setWorking(true)
    setError('')
    try {
      await onConfirm(keys)
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
      <h2 id="file-dialog-title">{reroll ? 'Generar nuevo UID' : 'Eliminar archivo'}</h2>
      <p className="dialog-filename">{action.dump.filename}</p>
      {reroll ? <>
        <p>Firma una copia con tu archivo <code>key_retail.bin</code> de 160 bytes. Las claves se usan en memoria.</p>
        <label className="file-label" htmlFor="uid-keys">Archivo de claves</label>
        <input id="uid-keys" type="file" accept=".bin,application/octet-stream" disabled={working}
          onChange={(event) => setKeys(event.target.files?.[0])} />
      </> : <p>Se borrará esta copia de la biblioteca local.</p>}
      {error && <p className="error-text" role="alert">{error}</p>}
      <div className="dialog-actions">
        <button ref={cancel} className="button button-outline" type="button" disabled={working} onClick={onClose}>Cancelar</button>
        <button className={`button ${reroll ? 'button-primary' : 'button-danger'}`} type="button"
          disabled={working || (reroll && !keys)} onClick={() => void confirm()}>
          {working ? 'Procesando…' : reroll ? 'Guardar copia' : 'Eliminar archivo'}
        </button>
      </div>
    </dialog>
  )
}
