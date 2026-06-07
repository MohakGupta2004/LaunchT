'use client'
import { useEffect } from 'react'

export default function Modal({
  isOpen,
  onClose,
  children,
  title,
}: {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  title?: string
}) {
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        {title && (
          <h2 className="mb-5 text-xl font-semibold text-white">{title}</h2>
        )}
        {children}
      </div>
    </div>
  )
}
