declare module 'leo-profanity' {
  export function loadDictionary(lang?: string): void
  export function add(words: string[]): void
  export function check(text: string): boolean
  export function clean(text: string, replacement?: string): string
  export function getDictionary(): string[]
}
