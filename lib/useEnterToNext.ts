'use client'

import { RefObject, useCallback } from 'react'

type Focusable =
  | HTMLInputElement
  | HTMLSelectElement
  | HTMLTextAreaElement
  | HTMLButtonElement

export function useEnterToNext(
  refs: RefObject<Focusable | null>[],
  opts?: { disabled?: boolean }
) {
  return useCallback(
    (e: React.KeyboardEvent) => {
      if (opts?.disabled) return
      if (e.key !== 'Enter') return
      if (e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return

      const target = e.target as Element | null
      if (target instanceof HTMLTextAreaElement) return // allow newlines

      e.preventDefault()

      const idx = refs.findIndex((r) => r.current === target)
      if (idx === -1) return

      for (let i = idx + 1; i < refs.length; i++) {
        const next = refs[i].current
        if (!next) continue
        if ((next as any).disabled) continue

        next.focus()
        if (next instanceof HTMLInputElement) next.select?.()
        return
      }
    },
    [refs, opts?.disabled]
  )
}
