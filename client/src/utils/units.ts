export type UnitItem = { id: number; code: string; name: string }

export function buildUnitNameMap(units: UnitItem[]): Record<string, string> {
  const map: Record<string, string> = {}
  units.forEach(u => { if (u.code) map[u.code] = u.name })
  return map
}

export function resolveUnitName(
  unitNameByCode: Record<string, string>,
  code?: string,
  fallback: string = '-'
): string {
  const key = code || ''
  return unitNameByCode[key] || code || fallback
}