import dayjs from 'dayjs'

export const formatDate = (date: string | Date | number | undefined | null, format = 'DD/MM/YYYY') => {
  if (!date) return '-'
  return dayjs(date).format(format)
}

export const formatDateTime = (date: string | Date | number | undefined | null, format = 'DD/MM/YYYY HH:mm') => {
  if (!date) return '-'
  return dayjs(date).format(format)
}
