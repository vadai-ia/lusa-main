import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const TEMPLATE_OPERADOR = 'operador_daily'
const TEMPLATE_ADMIN    = 'admin_daily'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? ''

// Fecha y rango UTC para "hoy" en Ciudad de México (CST = UTC-6)
function getTodayMX() {
  const now     = new Date()
  const todayMX = new Intl.DateTimeFormat('sv', { timeZone: 'America/Mexico_City' }).format(now)
  const [y, m, d] = todayMX.split('-')
  return {
    fecha    : `${d}/${m}/${y}`,           // para el template: "24/06/2026"
    fechaIso : todayMX,                    // "2026-06-24" — para la URL del filtro
    desde    : `${todayMX}T06:00:00.000Z`, // medianoche CST = 06:00 UTC
    hasta    : now.toISOString(),
  }
}

async function sendWhatsApp(to: string, templateName: string, params: string[]) {
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
        templateName,
        template_parameters: params,
      }),
    })
    if (!res.ok) {
      console.error(`[cron] whaapy error → ${to}:`, await res.text())
    }
    return res.ok
  } catch (e) {
    console.error(`[cron] fetch error → ${to}:`, e)
    return false
  }
}

export async function GET(req: NextRequest) {
  // En producción Vercel envía: Authorization: Bearer {CRON_SECRET}
  // En dev se puede omitir si CRON_SECRET no está definido
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const admin = createAdminClient()
  const { fecha, fechaIso, desde, hasta } = getTodayMX()

  // Separar user_ids por role para no mezclar admins con operadores
  const { data: profiles } = await admin.schema('lusa').from('profiles').select('id, role')
  const adminUserIds    = (profiles ?? []).filter(p => p.role === 'admin').map(p => p.id)
  const operadorUserIds = (profiles ?? []).filter(p => p.role === 'operador').map(p => p.id)

  const [{ data: adminOps }, { data: operators }, { data: images }] = await Promise.all([
    // Admins con teléfono registrado en operators
    adminUserIds.length > 0
      ? admin.schema('lusa').from('operators')
          .select('name, phone')
          .in('user_id', adminUserIds)
          .not('phone', 'is', null)
      : Promise.resolve({ data: [] as { name: string; phone: string }[] }),
    // Operadores (solo role=operador)
    operadorUserIds.length > 0
      ? admin.schema('lusa').from('operators')
          .select('id, name, phone')
          .in('user_id', operadorUserIds)
          .not('phone', 'is', null)
      : Promise.resolve({ data: [] as { id: string; name: string; phone: string }[] }),
    // Imágenes de hoy
    admin.schema('lusa').from('images')
      .select('operator_id, validation_state')
      .gte('created_at', desde)
      .lte('created_at', hasta),
  ])

  const imgs = images ?? []

  // Conteos globales para admin
  const totalAdmin       = imgs.length
  const aceptadasAdmin   = imgs.filter(i => i.validation_state === 'approved').length
  const duplicadasAdmin  = imgs.filter(i => i.validation_state === 'duplicate_clean').length
  const manipuladasAdmin = imgs.filter(i => ['manipulated', 'intercambiada'].includes(i.validation_state)).length
  const invalidasAdmin   = imgs.filter(i => i.validation_state === 'invalida').length

  // Agrupar por operador
  const byOp = new Map<string, typeof imgs>()
  for (const img of imgs) {
    if (!byOp.has(img.operator_id)) byOp.set(img.operator_id, [])
    byOp.get(img.operator_id)!.push(img)
  }

  // ── Reporte admin (todos los admins con teléfono en BD) ───────────────────
  let adminsSent = 0
  for (const adm of adminOps ?? []) {
    const phone = adm.phone.startsWith('+') ? adm.phone : `+${adm.phone}`
    const ok = await sendWhatsApp(phone, TEMPLATE_ADMIN, [
      fecha,                      // {{1}} fecha
      String(totalAdmin),         // {{2}} total
      String(aceptadasAdmin),     // {{3}} aceptadas
      String(duplicadasAdmin),    // {{4}} duplicadas
      String(manipuladasAdmin),   // {{5}} manipuladas/compartidas
      String(invalidasAdmin),     // {{6}} inválidas
    ])
    if (ok) adminsSent++
    console.log(`[cron] admin ${adm.name} (${adm.phone}) ok=${ok}`)
  }

  // ── Reporte por operador ──────────────────────────────────────────────────
  let sent = 0
  for (const op of operators ?? []) {
    const opImgs = byOp.get(op.id) ?? []
    if (opImgs.length === 0) continue // sin actividad hoy → no molestar

    const aceptadas   = opImgs.filter(i => i.validation_state === 'approved').length
    const duplicadas  = opImgs.filter(i => i.validation_state === 'duplicate_clean').length
    const manipuladas = opImgs.filter(i => ['manipulated', 'intercambiada'].includes(i.validation_state)).length
    const invalidas   = opImgs.filter(i => i.validation_state === 'invalida').length
    const phone       = op.phone.startsWith('+') ? op.phone : `+${op.phone}`
    const linkFecha   = `${APP_URL}/dashboard/operador/imagenes?desde=${fechaIso}&hasta=${fechaIso}`

    const ok = await sendWhatsApp(phone, TEMPLATE_OPERADOR, [
      op.name,               // {{1}} nombre
      fecha,                 // {{2}} fecha legible
      String(opImgs.length), // {{3}} enviadas
      String(aceptadas),     // {{4}} aceptadas
      String(duplicadas),    // {{5}} duplicadas
      String(manipuladas),   // {{6}} manipuladas/compartidas
      String(invalidas),     // {{7}} inválidas
      linkFecha,             // {{8}} enlace "Ver mis imágenes de hoy"
    ])
    if (ok) sent++
    console.log(`[cron] operador ${op.name} (${op.phone}) ok=${ok}`)
  }

  return NextResponse.json({
    ok: true,
    fecha,
    desde,
    hasta,
    total_imagenes:         totalAdmin,
    admins_notificados:     adminsSent,
    operadores_notificados: sent,
  })
}
