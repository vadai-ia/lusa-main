import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const TEMPLATE = 'lusa_operador'

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
    if (!res.ok) console.error(`[cron/operator] whaapy error → ${to}:`, await res.text())
    return res.ok
  } catch (e) {
    console.error(`[cron/operator] fetch error → ${to}:`, e)
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

  const [{ data: operators }, { data: images }] = await Promise.all([
    supabase.schema('lusa').from('operators')
      .select('id, name, phone')
      .eq('role', 'operador')
      .not('phone', 'is', null),
    supabase.schema('lusa').from('images')
      .select('operator_id, validation_state')
      .gte('created_at', desde)
      .lte('created_at', hasta),
  ])

  const imgs = images ?? []

  // Agrupar imágenes por operador
  const byOp = new Map<string, typeof imgs>()
  for (const img of imgs) {
    if (!byOp.has(img.operator_id)) byOp.set(img.operator_id, [])
    byOp.get(img.operator_id)!.push(img)
  }

  let sent = 0
  for (const op of operators ?? []) {
    const opImgs = byOp.get(op.id) ?? []
    if (opImgs.length === 0) continue // sin actividad hoy → no molestar

    const ok = await sendWhatsApp(toE164(op.phone), [
      op.name,                                                                                      // {{1}}
      fecha,                                                                                        // {{2}}
      String(opImgs.length),                                                                        // {{3}}
      String(opImgs.filter(i => i.validation_state === 'approved').length),                        // {{4}}
      String(opImgs.filter(i => ['manipulated', 'invalid'].includes(i.validation_state)).length),  // {{5}}
    ])
    if (ok) sent++
    console.log(`[cron/operator] ${op.name} (${op.phone}) ok=${ok}`)
  }

  return NextResponse.json({ ok: true, fecha, desde, hasta, operadores_notificados: sent })
}
