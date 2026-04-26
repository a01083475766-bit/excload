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

/** 입력용: 01x 휴대전화(3-4-4) 또는 그 외 10자리(3-3-4)로 붙이며 타이핑 중에도 하이픈 표시 */
export function formatPhoneForInput(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '').slice(0, 11)
  if (!digits) return ''

  const isKoreanMobile = /^01[016789]/.test(digits)
  if (isKoreanMobile) {
    if (digits.length <= 3) return digits
    if (digits.length <= 7) {
      return `${digits.slice(0, 3)}-${digits.slice(3)}`
    }
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`
  }

  const ten = digits.slice(0, 10)
  if (ten.length <= 3) return ten
  if (ten.length <= 6) {
    return `${ten.slice(0, 3)}-${ten.slice(3)}`
  }
  return `${ten.slice(0, 3)}-${ten.slice(3, 6)}-${ten.slice(6, 10)}`
}
