const MAP: Record<string, { code?: string; symbol: string }> = {
  USD: { code: 'USD', symbol: '$' },
  EUR: { code: 'EUR', symbol: '€' },
  MXN: { code: 'MXN', symbol: '$' },
  PEN: { code: 'PEN', symbol: 'S/' },
  CLP: { code: 'CLP', symbol: '$' },
  COP: { code: 'COP', symbol: '$' },
  ARS: { code: 'ARS', symbol: '$' },
  BOB: { code: 'BOB', symbol: 'Bs' },
  VES: { code: 'VES', symbol: 'Bs' },
  BRL: { code: 'BRL', symbol: 'R$' },
  GBP: { code: 'GBP', symbol: '£' },
  JPY: { code: 'JPY', symbol: '¥' },
}

function normalize(input?: string): { code?: string; symbol: string } {
  const val = (input || 'USD').toUpperCase()
  if (MAP[val]) return MAP[val]
  // Si el usuario pone un símbolo (p.ej. "Bs"), úsalo tal cual como símbolo
  return { symbol: input || '$' }
}

// Formateo de dinero con coma para millares y punto para decimales.
// Por defecto usa 'en-US' para lograr 1,234.56
export function formatMoney(amount: number, currency?: string, locale = 'en-US'): string {
  const info = normalize(currency)
  if (info.code) {
    try {
      return new Intl.NumberFormat(locale, { style: 'currency', currency: info.code }).format(amount)
    } catch {
      // Fallback a símbolo si Intl falla
      const num = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)
      return `${info.symbol} ${num}`
    }
  }
  const num = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)
  return `${info.symbol} ${num}`
}