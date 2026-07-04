import dayjs from 'dayjs'

export const formatDate = (date: string | Date | number | undefined | null, format = 'DD/MM/YYYY') => {
  if (!date) return '-'
  return dayjs(date).format(format)
}

export const formatDateTime = (date: string | Date | number | undefined | null, format = 'DD/MM/YYYY HH:mm') => {
  if (!date) return '-'
  return dayjs(date).format(format)
}

export const formatBatchDate = (date: string | Date | number | undefined | null, empty = 'N/A') => {
  if (!date) return empty
  const parsed = dayjs(date)
  if (!parsed.isValid()) return String(date)
  return parsed.format('DD/MM/YYYY')
}
