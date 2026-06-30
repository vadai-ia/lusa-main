import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mxDayBounds } from '@/lib/utils/dates'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.schema('lusa').from('profiles')
    .select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()

  const { searchParams } = new URL(req.url)
  const desde = searchParams.get('desde') // YYYY-MM-DD
  const hasta  = searchParams.get('hasta') // YYYY-MM-DD
  const hasFilter = !!(desde || hasta)

  // Compute UTC bounds for the selected range
  let startIso: string
  let endIso: string

  if (desde && hasta) {
    startIso = mxDayBounds(desde).start
    endIso   = mxDayBounds(hasta).end
  } else if (desde) {
    startIso = mxDayBounds(desde).start
    endIso   = new Date().toISOString()
  } else if (hasta) {
    endIso   = mxDayBounds(hasta).end
    const d  = new Date(endIso)
    d.setDate(d.getDate() - 29)
    startIso = d.toISOString()
  } else {
    const since = new Date()
    since.setDate(since.getDate() - 29)
    since.setHours(0, 0, 0, 0)
    startIso = since.toISOString()
    endIso   = new Date().toISOString()
  }

  let allImagesQuery = admin.schema('lusa').from('images')
    .select('validation_state, operator_id')

  if (hasFilter) {
    allImagesQuery = allImagesQuery
      .gte('created_at', startIso)
      .lte('created_at', endIso)
  }

  const [{ data: recentImages }, { data: allImages }, { data: operators }] = await Promise.all([
    admin.schema('lusa').from('images')
      .select('created_at')
      .gte('created_at', startIso)
      .lte('created_at', endIso),
    allImagesQuery,
    admin.schema('lusa').from('operators').select('id, name'),
  ])

  // byDay — build a map of every Mexico City calendar day in the range
  const mxFmt = new Intl.DateTimeFormat('sv', { timeZone: 'America/Mexico_City' })
  const byDayMap: Record<string, number> = {}

  const rangeStart = new Date(startIso)
  const rangeEnd   = new Date(endIso)
  const cur = new Date(rangeStart)
  let safeguard = 0
  while (cur <= rangeEnd && safeguard < 366) {
    byDayMap[mxFmt.format(cur)] = 0
    cur.setDate(cur.getDate() + 1)
    safeguard++
  }

  for (const img of recentImages ?? []) {
    const mxDay = mxFmt.format(new Date(img.created_at))
    if (mxDay in byDayMap) byDayMap[mxDay]++
  }

  const byDay = Object.entries(byDayMap).map(([date, count]) => ({
    date: date.slice(5), // MM-DD
    count,
  }))

  // byState and topRejected — scoped to the selected range (or all-time)
  const byStateMap: Record<string, number> = {}
  const opStats: Record<string, { total: number; rechazadas: number }> = {}

  for (const img of allImages ?? []) {
    byStateMap[img.validation_state] = (byStateMap[img.validation_state] ?? 0) + 1
    if (!opStats[img.operator_id]) opStats[img.operator_id] = { total: 0, rechazadas: 0 }
    opStats[img.operator_id].total++
    if (['manipulated', 'intercambiada', 'invalid', 'invalida'].includes(img.validation_state)) {
      opStats[img.operator_id].rechazadas++
    }
  }

  const byState = Object.entries(byStateMap).map(([state, count]) => ({ state, count }))

  const opMap = Object.fromEntries((operators ?? []).map(o => [o.id, o.name as string]))

  const topRejected = Object.entries(opStats)
    .filter(([, v]) => v.total > 0)
    .map(([id, v]) => ({
      name: (opMap[id] ?? 'Desconocido').slice(0, 16),
      total: v.total,
      rechazadas: v.rechazadas,
      tasa: Math.round((v.rechazadas / v.total) * 100),
    }))
    .sort((a, b) => b.tasa - a.tasa)
    .slice(0, 5)

  return NextResponse.json({ byDay, byState, topRejected })
}
