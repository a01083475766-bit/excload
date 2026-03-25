export function formatPhoneDisplay(phone?: string) {
  if (!phone) return ''

  const digits = phone.replace(/[^0-9]/g, '')

  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3')
  }

  if (digits.length === 10) {
    return digits.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3')
  }

  return digits
}
