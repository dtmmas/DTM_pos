const WORDS_TO_KEEP_LOWERCASE = new Set([
  'a',
  'al',
  'con',
  'de',
  'del',
  'e',
  'el',
  'en',
  'la',
  'las',
  'los',
  'o',
  'para',
  'por',
  'sin',
  'u',
  'un',
  'una',
  'y'
])

function capitalizeWord(word: string, forceCapitalize = false) {
  if (!word) return word
  if (/[A-Z].*[a-z]|[a-z].*[A-Z]|^[A-Z0-9]{2,}$/.test(word)) return word

  const normalized = word.toLocaleLowerCase()
  if (!forceCapitalize && WORDS_TO_KEEP_LOWERCASE.has(normalized)) {
    return normalized
  }

  return normalized.charAt(0).toLocaleUpperCase() + normalized.slice(1)
}

export function formatCompanyName(name?: string | null) {
  if (!name?.trim()) return 'DTMPos'

  return name
    .trim()
    .split(/\s+/)
    .map((word, index) => capitalizeWord(word, index === 0))
    .join(' ')
}
