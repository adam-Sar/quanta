import { FileUp, UploadCloud } from 'lucide-react'
import { useEffect, useState } from 'react'

import { ApiError } from '../../api/client'
import { Button } from '../ui/Button'
import { ErrorState } from '../ui/ErrorState'
import { Modal } from '../ui/Modal'

interface UploadDatasetModalProps {
  open: boolean
  isSubmitting: boolean
  error: unknown
  onClose: () => void
  onSubmit: (input: { file: File; name: string; description: string }) => void
}

const inputClasses = 'mt-2 block h-10 w-full rounded-md border border-line bg-canvas/50 px-3 text-sm text-ink outline-none placeholder:text-muted focus:border-accent focus:ring-1 focus:ring-accent'

export function UploadDatasetModal({ open, isSubmitting, error, onClose, onSubmit }: UploadDatasetModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [validationMessage, setValidationMessage] = useState<string | null>(null)

  useEffect(() => {
    if (open) return
    setFile(null)
    setName('')
    setDescription('')
    setValidationMessage(null)
  }, [open])

  const handleFileChange = (nextFile: File | undefined) => {
    setFile(nextFile ?? null)
    if (nextFile && !name) {
      setName(nextFile.name.replace(/\.(csv|parquet)$/i, ''))
    }
    setValidationMessage(null)
  }

  const handleSubmit = () => {
    if (!file) {
      setValidationMessage('Select a CSV or Parquet file to continue.')
      return
    }
    if (!name.trim()) {
      setValidationMessage('Enter a dataset name to continue.')
      return
    }
    setValidationMessage(null)
    onSubmit({ file, name: name.trim(), description: description.trim() })
  }

  const apiError = error instanceof ApiError ? error : null

  return (
    <Modal
      description="The backend will validate the file, extract metadata, and create an immutable first version."
      footer={(
        <>
          <Button disabled={isSubmitting} onClick={onClose} variant="ghost">Cancel</Button>
          <Button disabled={isSubmitting} onClick={handleSubmit} variant="primary">
            <FileUp aria-hidden="true" size={15} />
            {isSubmitting ? 'Uploading…' : 'Upload dataset'}
          </Button>
        </>
      )}
      onClose={onClose}
      open={open}
      title="Add dataset"
    >
      <div className="space-y-5">
        {validationMessage ? <ErrorState className="px-4 py-3" message={validationMessage} title="Check the upload details" /> : null}
        {apiError ? <ErrorState className="px-4 py-3" message={apiError.message} requestId={apiError.requestId} title="Upload failed" /> : null}

        <div>
          <label className="text-xs font-medium text-ink" htmlFor="dataset-file">Source file</label>
          <label className="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-line bg-surface-2 px-4 py-7 text-center transition-colors hover:border-accent/70 hover:bg-accent/5" htmlFor="dataset-file">
            <UploadCloud aria-hidden="true" className="text-accent" size={22} strokeWidth={1.7} />
            <span className="mt-3 text-sm font-medium text-ink">{file ? file.name : 'Choose a CSV or Parquet file'}</span>
            <span className="mt-1 text-xs text-muted">The API enforces its configured upload size limit.</span>
            <input accept=".csv,.parquet,text/csv,application/octet-stream" className="sr-only" id="dataset-file" onChange={(event) => handleFileChange(event.target.files?.[0])} type="file" />
          </label>
          {file ? <p className="mt-2 text-xs text-muted">{file.type || 'File type detected from extension'} · {(file.size / 1024 ** 2).toFixed(2)} MB</p> : null}
        </div>

        <div>
          <label className="text-xs font-medium text-ink" htmlFor="dataset-name">Dataset name</label>
          <input className={inputClasses} id="dataset-name" maxLength={255} onChange={(event) => setName(event.target.value)} placeholder="e.g. customer_events" value={name} />
          <p className="mt-1.5 text-[11px] text-muted">A logical name for the dataset, not the source filename.</p>
        </div>

        <div>
          <label className="text-xs font-medium text-ink" htmlFor="dataset-description">Description <span className="font-normal text-muted">(optional)</span></label>
          <textarea className="mt-2 block min-h-20 w-full resize-y rounded-md border border-line bg-canvas/50 px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-accent focus:ring-1 focus:ring-accent" id="dataset-description" maxLength={2000} onChange={(event) => setDescription(event.target.value)} placeholder="What does this source represent?" value={description} />
        </div>
      </div>
    </Modal>
  )
}
