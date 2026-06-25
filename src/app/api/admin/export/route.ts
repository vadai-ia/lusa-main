import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import * as XLSX from 'xlsx'

const STATE_LABELS: Record<string, string> = {
  approved:        'Aprobada',
  duplicate_clean: 'Duplicado',
  manipulated:     'Manipulada',
  intercambiada:   'Intercambiada',
  invalid:         'Inválida',
  invalida:        'Inválida',
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: profile } = await supabase.schema('lusa').from('profiles')
    .select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return new Response('Forbidden', { status: 403 })

  const { searchParams } = new URL(req.url)
  const format     = searchParams.get('format') === 'xlsx' ? 'xlsx' : 'csv'
  const estado     = searchParams.get('estado')
  const desde      = searchParams.get('desde')
  const hasta      = searchParams.get('hasta')
  const tipo_fecha = searchParams.get('tipo_fecha')
  const dateCol    = tipo_fecha === 'foto' ? 'fecha_foto' : 'created_at'

  const admin = createAdminClient()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!

  let query = admin.schema('lusa').from('images')
    .select('id, operator_id, from_phone, validation_state, fraud_reason, created_at, fecha_foto, objeto_detectado, direccion, rumbo, velocidad_kmh, latitud, longitud, operador_overlay, unidad_overlay, ocr_text, md5_hash, phash, storage_path')
    .order('created_at', { ascending: false })
    .limit(10000)

  if (estado) query = query.eq('validation_state', estado)
  if (desde)  query = query.gte(dateCol, `${desde}T00:00:00`)
  if (hasta)  query = query.lte(dateCol, `${hasta}T23:59:59`)

  const [{ data: images }, { data: operators }] = await Promise.all([
    query,
    admin.schema('lusa').from('operators').select('id, name, phone, unit'),
  ])

  const opMap = Object.fromEntries((operators ?? []).map(o => [o.id, o]))

  type Row = Record<string, string | number | null>
  const rows: Row[] = (images ?? []).map(img => {
    const op = opMap[img.operator_id] as { name: string; phone: string; unit: string } | undefined
    return {
      'ID':               img.id,
      'Operador':         op?.name ?? img.operador_overlay ?? '',
      'Teléfono':         op?.phone ?? img.from_phone ?? '',
      'Unidad':           op?.unit ?? img.unidad_overlay ?? '',
      'Estado':           STATE_LABELS[img.validation_state] ?? img.validation_state,
      'Motivo fraude':    img.fraud_reason ?? '',
      'Fecha recepción':  img.created_at ? new Date(img.created_at).toLocaleString('es-MX') : '',
      'Fecha foto':       img.fecha_foto ?? '',
      'Objeto detectado': img.objeto_detectado ?? '',
      'Dirección':        img.direccion ?? '',
      'Rumbo':            img.rumbo ?? '',
      'Velocidad km/h':   img.velocidad_kmh ?? '',
      'Latitud':          img.latitud ?? '',
      'Longitud':         img.longitud ?? '',
      'OCR':              img.ocr_text ?? '',
      'MD5':              img.md5_hash ?? '',
      'pHash':            img.phash ?? '',
      'URL imagen':       img.storage_path
                            ? `${supabaseUrl}/storage/v1/object/public/imagenes_lusa/${img.storage_path}`
                            : '',
    }
  })

  const filename = `lusa_imagenes_${new Date().toISOString().slice(0, 10)}`

  await admin.schema('lusa').from('audit_log').insert({
    image_id:         null,
    user_id:          user.id,
    user_email:       user.email!,
    action:           'exportar_imagenes',
    old_state:        null,
    new_state:        null,
    old_fraud_reason: null,
    new_fraud_reason: [
      format.toUpperCase(),
      estado   ? `estado:${estado}`   : null,
      desde    ? `desde:${desde}`     : null,
      hasta    ? `hasta:${hasta}`     : null,
      `${rows.length} registros`,
    ].filter(Boolean).join(' / '),
  })

  if (format === 'xlsx') {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(rows)

    if (rows.length > 0) {
      const keys = Object.keys(rows[0])
      ws['!cols'] = keys.map(key => {
        const max = rows.slice(0, 200).reduce(
          (m, r) => Math.max(m, String(r[key] ?? '').length),
          key.length
        )
        return { wch: max + 2 }
      })
    }

    XLSX.utils.book_append_sheet(wb, ws, 'Imágenes')
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Uint8Array
    return new Response(buf.buffer as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}.xlsx"`,
      },
    })
  }

  // CSV con BOM para que Excel abra correctamente en UTF-8
  const keys = rows.length > 0 ? Object.keys(rows[0]) : []
  const escape = (v: unknown) => {
    const s = String(v ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }
  const csv = [
    keys.join(','),
    ...rows.map(r => keys.map(k => escape(r[k])).join(',')),
  ].join('\n')

  return new Response('﻿' + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}.csv"`,
    },
  })
}
