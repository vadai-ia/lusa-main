import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const TEMPLATE = 'lusa_admin'

function toE164(phone: string) {
  return phone.startsWith('+') ? phone : `+${phone}`
}

function getTodayMX() {
  const now     = new Date()
  const todayMX = new Intl.DateTimeFormat('sv', { timeZone: 'America/Mexico_City' }).format(now)
  const [y, m, d] = todayMX.split('-')
  return {
    fecha: `${d}/${m}/${y}`,
    desde: `${todayMX}T06:00:00.000Z`,
    hasta: now.toISOString(),
  }
}

async function sendWhatsApp(to: string, params: string[]) {
  try {
    const res = await fetch('https://api.whaapy.com/messages/v1', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WHAAPY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to,
        type: 'template',
        templateName: TEMPLATE,
        template_parameters: params,
      }),
    })
    if (!res.ok) console.error(`[cron/admin] whaapy error → ${to}:`, await res.text())
    return res.ok
  } catch (e) {
    console.error(`[cron/admin] fetch error → ${to}:`, e)
    return false
  }
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const { fecha, desde, hasta } = getTodayMX()

  const [{ data: admins }, { data: images }] = await Promise.all([
    supabase.schema('lusa').from('operators')
      .select('name, phone')
      .eq('role', 'admin')
      .not('phone', 'is', null),
    supabase.schema('lusa').from('images')
      .select('validation_state')
      .gte('created_at', desde)
      .lte('created_at', hasta),
  ])

  const imgs      = images ?? []
  const enviadas  = imgs.length
  const exitosas  = imgs.filter(i => i.validation_state === 'approved').length
  const errores   = imgs.filter(i => ['manipulated', 'invalid'].includes(i.validation_state)).length

  let sent = 0
  for (const admin of admins ?? []) {
    const ok = await sendWhatsApp(toE164(admin.phone), [
      fecha,        // {{1}}
      String(enviadas),  // {{2}}
      String(exitosas),  // {{3}}
      String(errores),   // {{4}}
    ])
    if (ok) sent++
    console.log(`[cron/admin] ${admin.name} (${admin.phone}) ok=${ok}`)
  }

  return NextResponse.json({ ok: true, fecha, enviadas, exitosas, errores, admins_notificados: sent })
}
