export function shouldBlockForPause(settings: Record<string, unknown> | null | undefined): boolean {
  if (!settings) return false;
  return settings.is_paused === true;
}
