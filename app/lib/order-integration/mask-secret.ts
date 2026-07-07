export function maskIntegrationSecret(value: string | null | undefined, visibleTail = 4): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.length <= visibleTail) {
    return '*'.repeat(trimmed.length);
  }
  return `${'*'.repeat(Math.max(4, trimmed.length - visibleTail))}${trimmed.slice(-visibleTail)}`;
}
