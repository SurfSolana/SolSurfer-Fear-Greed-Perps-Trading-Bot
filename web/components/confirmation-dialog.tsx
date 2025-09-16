'use client'

import React from 'react'

interface ConfirmationDialogProps {
  isOpen: boolean
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning' | 'info'
}

export function ConfirmationDialog({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'warning'
}: ConfirmationDialogProps) {
  if (!isOpen) return null

  const variantStyles = {
    danger: {
      border: 'border-red-500/20',
      bg: 'bg-red-950/50',
      confirmBtn: 'bg-red-600 hover:bg-red-700',
      icon: '⚠️'
    },
    warning: {
      border: 'border-amber-500/20',
      bg: 'bg-amber-950/50',
      confirmBtn: 'bg-amber-600 hover:bg-amber-700',
      icon: '⚡'
    },
    info: {
      border: 'border-blue-500/20',
      bg: 'bg-blue-950/50',
      confirmBtn: 'bg-blue-600 hover:bg-blue-700',
      icon: 'ℹ️'
    }
  }

  const styles = variantStyles[variant]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className={`max-w-md w-full mx-4 p-6 rounded-2xl border ${styles.border} ${styles.bg} shadow-2xl`}>
        <div className="flex items-start gap-3 mb-4">
          <span className="text-2xl">{styles.icon}</span>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
            <p className="text-sm text-gray-300">{message}</p>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-2 rounded-lg text-white font-medium transition-colors ${styles.confirmBtn}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}