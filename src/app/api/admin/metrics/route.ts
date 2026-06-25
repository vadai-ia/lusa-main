import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.schema('lusa').from('profiles')
    .select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()

  const since = new Date()
  since.setDate(since.getDate() - 29)
  since.setHours(0, 0, 0, 0)

  const [{ data: recentImages }, { data: allImages }, { data: operators }] = await Promise.all([
    admin.schema('lusa').from('images')
      .select('created_at')
      .gte('created_at', since.toISOString()),
    admin.schema('lusa').from('images')
      .select('validation_state, operator_id'),
    admin.schema('lusa').from('operators')
      .select('id, name'),
  ])

  // byDay — last 30 days, all initialized to 0
  const byDayMap: Record<string, number> = {}
  for (let i = 29; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    byDayMap[d.toISOString().slice(0, 10)] = 0
  }
  for (const img of recentImages ?? []) {
    const day = img.created_at.slice(0, 10)
    if (day in byDayMap) byDayMap[day]++
  }
  const byDay = Object.entries(byDayMap).map(([date, count]) => ({
    date: date.slice(5), // MM-DD
    count,
  }))

  // byState — all time
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
