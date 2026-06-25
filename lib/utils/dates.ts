/**
 * Convierte una fecha YYYY-MM-DD (hora México) a los límites UTC correctos.
 * Maneja automáticamente CST (UTC-6, nov-mar) y CDT (UTC-5, mar-nov).
 */
export function mxDayBounds(dateStr: string): { start: string; end: string } {
  // Probar las 18:00 UTC → da 13:00 CDT o 12:00 CST → calculamos el offset
  const probe = new Date(`${dateStr}T18:00:00Z`)
  const mxStr = new Intl.DateTimeFormat('sv', {
    timeZone: 'America/Mexico_City',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(probe)
  // mxStr → "2026-06-24 13:00:00" (CDT) o "2026-06-24 12:00:00" (CST)
  const mxMs    = new Date(mxStr.replace(' ', 'T') + 'Z').getTime()
  const offsetMs = mxMs - probe.getTime() // -5h (CDT) o -6h (CST) en ms

  const [y, m, d] = dateStr.split('-').map(Number)
  const midnight   = Date.UTC(y, m - 1, d,  0,  0,  0)
  const endOfDay   = Date.UTC(y, m - 1, d, 23, 59, 59)

  return {
    start: new Date(midnight - offsetMs).toISOString(),   // ej: 2026-06-24T05:00:00.000Z
    end:   new Date(endOfDay - offsetMs).toISOString(),   // ej: 2026-06-25T04:59:59.000Z
  }
}

/** Devuelve la fecha actual en hora México como YYYY-MM-DD */
export function todayMx(): string {
  return new Intl.DateTimeFormat('sv', { timeZone: 'America/Mexico_City' }).format(new Date())
}
