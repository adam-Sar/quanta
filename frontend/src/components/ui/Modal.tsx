import type { ReactNode } from 'react'
import { useEffect } from 'react'

import { X } from 'lucide-react'

import { cn } from '../../lib/utils'

interface ModalProps {
  open: boolean
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
  className?: string
}

export function Modal({ open, title, description, children, footer, onClose, className }: ModalProps) {
  useEffect(() => {
    if (!open) return undefined

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6" role="presentation">
      <button aria-label="Close dialog" className="absolute inset-0 cursor-default" onClick={onClose} type="button" />
      <div
        aria-labelledby="modal-title"
        aria-modal="true"
        className={cn('relative z-10 w-full max-w-lg rounded-t-lg border border-line bg-surface shadow-panel sm:rounded-lg', className)}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-5 border-b border-line px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-base font-semibold text-ink" id="modal-title">{title}</h2>
            {description ? <p className="mt-1 text-sm leading-6 text-muted">{description}</p> : null}
          </div>
          <button
            aria-label="Close dialog"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-elevated hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={17} />
          </button>
        </div>
        <div className="max-h-[calc(100vh-13rem)] overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer ? <div className="flex flex-col-reverse gap-2 border-t border-line px-5 py-4 sm:flex-row sm:justify-end sm:px-6">{footer}</div> : null}
      </div>
    </div>
  )
}
