import type React from 'react'

type AnyRef = React.RefObject<HTMLElement | null> | null

function isDisabled(el: HTMLElement): boolean {
  if (el instanceof HTMLInputElement) return el.disabled
  if (el instanceof HTMLButtonElement) return el.disabled
  if (el instanceof HTMLSelectElement) return el.disabled
  if (el instanceof HTMLTextAreaElement) return el.disabled
  return el.getAttribute('aria-disabled') === 'true'
}

function isFocusable(el: HTMLElement): boolean {
  if (isDisabled(el)) return false
  if (el.getAttribute('aria-hidden') === 'true') return false
  // hidden or display:none elements won’t have client rects
  if (el.getClientRects().length === 0) return false
  return true
}

/**
 * Pressing Enter moves focus to the next ref in the list.
 * - Skips disabled/hidden elements automatically.
 * - Allows Enter to create a newline in textarea.
 */
export function useEnterToNext(refs: AnyRef[]) {
  return (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Enter') return

    const target = e.target as HTMLElement | null
    if (!target) return

    // Let Enter create newline in textarea
    if (target instanceof HTMLTextAreaElement) return

    e.preventDefault()

    const idx = refs.findIndex((r) => r?.current === target)
    if (idx === -1) return

    for (let i = idx + 1; i < refs.length; i++) {
      const el = refs[i]?.current
      if (!el) continue
      if (!isFocusable(el)) continue
      el.focus()
      return
    }
  }
}
