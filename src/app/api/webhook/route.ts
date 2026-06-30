import { NextRequest, NextResponse } from 'next/server'
import { createHmac, createHash, timingSafeEqual } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import Anthropic from '@anthropic-ai/sdk'
import sharp from 'sharp'
import { hammingDistance, HAMMING_THRESHOLD } from '@/lib/utils/phash'

// ─── HMAC-SHA256 ─────────────────────────────────────────────────────────────

function verifySignature(rawBody: string, signature: string): boolean {
  const secret = process.env.WHAAPY_WEBHOOK_SECRET
  if (!secret) return false
  try {
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    return false
  }
}

// ─── Extensión por mime type ──────────────────────────────────────────────────

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg':  'jpg',
    'image/png':  'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
  }
  return map[mime] ?? 'jpg'
}

// ─── Tag "operador" en Whaapy ─────────────────────────────────────────────────

async function hasOperadorTag(contactId: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.whaapy.com/contacts/v1/${contactId}`, {
      headers: { Authorization: `Bearer ${process.env.WHAAPY_API_KEY}` },
    })
    const data = await res.json()
    console.log('[webhook] whaapy contact status:', res.status, JSON.stringify(data).slice(0, 300))
    if (!res.ok) return false
    const tags = data.contact?.tags ?? []
    return tags.includes('operador') && !tags.includes('inactivo')
  } catch (e) {
    console.error('[webhook] error consultando contacto whaapy:', e)
    return false
  }
}

// ─── dHash perceptual (64-bit difference hash) ────────────────────────────────

async function computeDhash(buffer: Buffer): Promise<string> {
  const { data } = await sharp(buffer)
    .resize(9, 8, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  let bits = ''
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const idx = row * 9 + col
      bits += data[idx] < data[idx + 1] ? '1' : '0'
    }
  }

  let hex = ''
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16)
  }
  return hex
}

// ─── GPS desde EXIF ───────────────────────────────────────────────────────────

async function extractExifGps(buffer: Buffer): Promise<{
  latitud: number | null
  longitud: number | null
  altitud_m: number | null
}> {
  try {
    const { default: exifr } = await import('exifr')
    const exif = await exifr.parse(buffer, {
      pick: ['latitude', 'longitude', 'altitude'],
    })
    if (!exif) return { latitud: null, longitud: null, altitud_m: null }
    return {
      latitud:   exif.latitude  ?? null,
      longitud:  exif.longitude ?? null,
      altitud_m: exif.altitude  ?? null,
    }
  } catch {
    return { latitud: null, longitud: null, altitud_m: null }
  }
}

// ─── Análisis Claude Vision ───────────────────────────────────────────────────

const CLAUDE_PROMPT = `Eres un sistema forense de análisis de incidencias para una empresa de transporte público en México.

Esta imagen muestra un objeto que pasó por la barra contadora de pasaje sin pagar (maleta, perro, bicicleta, carriola, etc.).
La app de cámara del operador imprime un overlay de texto sobre la imagen con: fecha/hora, rumbo, dirección GPS, nombre del operador y número de unidad.
Algunos overlays también muestran altitud y velocidad.

INSTRUCCIONES CRÍTICAS PARA LECTURA DE NÚMEROS:
- Lee cada dígito individualmente, carácter por carácter, antes de formar el número completo.
- Los dígitos más confusos en overlays comprimidos: 0↔6, 1↔7, 2↔8, 3↔8, 5↔6, 8↔9. El par 2↔8 es especialmente común: la parte superior de un 8 comprimido puede leerse como 2. Cuando tengas duda, analiza si el número tiene sentido en su contexto antes de confirmar.
- La fecha sigue formato DD/MM/YYYY HH:MM:SS o similar. El año siempre empieza con 20. Verifica: día entre 1-31, mes entre 1-12, minuto y segundo entre 0-59.
- La hora puede estar en formato 12h (1-12 a.m./p.m.) o 24h (0-23). Si ves "a.m." la hora debe ser 1-12; si ves "p.m." la hora debe ser 1-12 también. Una hora de "2 p.m." y una de "8 p.m." se ven similares en overlays — verifica el trazo: el 8 tiene dos ciercos cerrados, el 2 termina en línea horizontal.
- La velocidad de un autobús urbano es típicamente entre 0 y 80 km/h. Si lees algo fuera de ese rango, revisa el dígito.
- El rumbo es un número entre 0° y 359° seguido de una dirección cardinal (N, NE, E, SE, S, SO, O, NO).
- El número de unidad suele ser alfanumérico corto (ej: unidad042, A-17, U-205). Léelo exactamente.
- Si un carácter es ambiguo y no puedes determinarlo con certeza, usa el valor más probable según contexto.

Extrae toda la información y responde ÚNICAMENTE con JSON válido, sin bloques de código, sin texto adicional:

{
  "fecha_foto": "<fecha y hora de la foto en ISO 8601, ej: 2026-05-12T15:29:01. null si no se distingue>",
  "rumbo": "<dirección del dispositivo tal como aparece en el overlay, ej: 122° SE. null si no se ve>",
  "direccion": "<dirección postal completa del overlay. null si no se ve>",
  "altitud_m": <altitud en metros como número entero, null si no aparece en el overlay>,
  "velocidad_kmh": <velocidad en km/h como número, null si no aparece en el overlay>,
  "operador_overlay": "<nombre completo del operador tal como aparece. null si no se ve>",
  "unidad_overlay": "<identificador de unidad limpio sin # ni símbolos especiales, ej: unidad111. null si no se ve>",
  "objeto_detectado": "<sustantivo en español del objeto principal no-humano que pasó por la barra: maleta, perro, bicicleta, carriola, caja, mochila, bulto, silla de ruedas, patinete, etc. Escribe desconocido si no se distingue>",
  "ocr_raw": "<transcripción exacta carácter por carácter de TODO el texto visible en la imagen, incluyendo el overlay>"
}`

// ─── Handler principal ────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const rawBody  = await request.text()
  const signature = request.headers.get('x-webhook-signature') ?? ''
  const event     = request.headers.get('x-webhook-event') ?? ''

  // 1. Verificar firma HMAC
  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  if (event !== 'message.received') return NextResponse.json({ ok: true })

  const body      = JSON.parse(rawBody)
  const data      = body.data
  const message   = data?.message
  const from      = message?.from as string | undefined
  const contactId = data?.contact_id as string | undefined

  if (!from || !contactId) return NextResponse.json({ ok: true })

  const fromDb = from.startsWith('+') ? from.slice(1) : from

  // 2. Verificar tag "operador"
  const esOperador = await hasOperadorTag(contactId)
  if (!esOperador) {
    console.log(`[webhook] ${from} no tiene tag operador, ignorando`)
    return NextResponse.json({ ok: true })
  }

  // 3. Verificar que sea imagen
  if (message?.type !== 'image') {
    console.log(`[webhook] ${from} envió tipo "${message?.type}", se esperaba image`)
    return NextResponse.json({ ok: true })
  }

  const mediaUrl     = data.media_url as string
  const whaapyMsgId  = data.whaapy_message_id as string
  const whaapyConvId = data.conversation_id as string
  const mimeType     = (message.image?.mime_type as string) ?? 'image/jpeg'

  const supabase = createAdminClient()

  // 4. Verificar operador activo
  const { data: operator, error: opError } = await supabase
    .schema('lusa')
    .from('operators')
    .select('id')
    .eq('phone', fromDb)
    .eq('is_active', true)
    .single()

  if (opError || !operator) return NextResponse.json({ ok: true })

  // 5. Descargar imagen
  let imageBuffer: Buffer
  try {
    const res = await fetch(mediaUrl)
    if (!res.ok) throw new Error(`fetch media failed: ${res.status}`)
    imageBuffer = Buffer.from(await res.arrayBuffer())
  } catch (e) {
    console.error('[webhook] error descargando imagen:', e)
    return NextResponse.json({ error: 'media fetch failed' }, { status: 500 })
  }

  // 6. MD5 + dHash + EXIF en paralelo
  const [md5Hash, phash, gps] = await Promise.all([
    Promise.resolve(createHash('md5').update(imageBuffer).digest('hex')),
    computeDhash(imageBuffer).catch(() => null),
    extractExifGps(imageBuffer),
  ])

  // 7. Cross-check con Hamming distance — detecta duplicados y fraude cruzado
  // Traemos todos los hashes en dos queries para comparar en JS con Hamming ≤ 10
  const [
    { data: sameOpHashes },
    { data: otherOpHashes },
    { data: crossMd5 },
  ] = await Promise.all([
    // Hashes del mismo operador (duplicados propios — no es fraude)
    supabase.schema('lusa').from('images')
      .select('id, phash, md5_hash, validation_state')
      .eq('operator_id', operator.id)
      .not('phash', 'is', null),
    // Hashes de otros operadores (para detectar fraude cruzado)
    supabase.schema('lusa').from('images')
      .select('id, operator_id, phash')
      .neq('operator_id', operator.id)
      .not('phash', 'is', null),
    // MD5 exacto de otro operador (prueba forense definitiva)
    supabase.schema('lusa').from('images')
      .select('id, operator_id')
      .eq('md5_hash', md5Hash)
      .neq('operator_id', operator.id)
      .limit(1)
      .maybeSingle(),
  ])

  const sameMd5SameOp   = sameOpHashes?.find(i => i.md5_hash === md5Hash) ?? null
  const samePHashSameOp = phash
    ? sameOpHashes?.find(i => i.phash && hammingDistance(phash, i.phash) <= HAMMING_THRESHOLD) ?? null
    : null
  const crossPHashMatch = phash
    ? otherOpHashes?.find(i => i.phash && hammingDistance(phash, i.phash) <= HAMMING_THRESHOLD) ?? null
    : null

  const sameDup    = sameMd5SameOp ?? samePHashSameOp
  const crossFraud = crossMd5 ?? (crossPHashMatch ? { id: crossPHashMatch.id } : null)
  const crossType  = crossMd5 ? 'cross_operator_exact' : crossPHashMatch ? 'cross_operator_similar' : null

  let validationState: string
  let fraudReason: string | null = null

  if (crossFraud && crossType) {
    // Foto ya existente de otro operador — intercambiada
    validationState = 'intercambiada'
    fraudReason     = `${crossType}::${crossFraud.id}`
    console.log(`[webhook] FRAUDE CRUZADO: ${crossType} — match con imagen ${crossFraud.id}`)
  } else if (sameDup) {
    // Duplicado del mismo operador — no es fraude
    validationState = 'duplicate_clean'
    await supabase.schema('lusa').from('images')
      .update({ validation_state: 'duplicate_clean' })
      .eq('id', sameDup.id)
    console.log(`[webhook] duplicado mismo operador: ${sameDup.id}`)
  } else {
    validationState = 'approved'
  }


  // 8. Subir a Supabase Storage
  const ext      = extFromMime(mimeType)
  const filePath = `${operator.id}/${whaapyMsgId}.${ext}`

  const { error: storageError } = await supabase.storage
    .from('imagenes_lusa')
    .upload(filePath, imageBuffer, { contentType: mimeType, upsert: false })

  if (storageError) {
    if (!storageError.message.includes('already exists')) {
      console.error('[webhook] error subiendo a storage:', storageError.message)
      return NextResponse.json({ error: 'storage upload failed' }, { status: 500 })
    }
    console.log('[webhook] archivo ya existe en storage, continuando')
  }

  // 9. Insertar registro con hashes y GPS del EXIF
  const { error: insertError } = await supabase
    .schema('lusa')
    .from('images')
    .insert({
      operator_id            : operator.id,
      whaapy_message_id      : whaapyMsgId,
      whaapy_conversation_id : whaapyConvId,
      from_phone             : fromDb,
      media_url              : mediaUrl,
      storage_path           : filePath,
      md5_hash               : md5Hash,
      phash                  : phash ?? null,
      latitud                : gps.latitud,
      longitud               : gps.longitud,
      altitud_m              : gps.altitud_m,
      processed_at           : new Date().toISOString(),
      validation_state       : validationState,
      fraud_reason           : fraudReason,
    })

  if (insertError) {
    console.error('[webhook] insert error:', insertError.message)
    return NextResponse.json({ error: 'db insert failed' }, { status: 500 })
  }

  // Actualizar última foto del operador
  await supabase
    .schema('lusa')
    .from('operators')
    .update({ last_image_at: new Date().toISOString() })
    .eq('id', operator.id)

  // 10. Análisis estructurado con Claude Vision
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const base64Image = imageBuffer.toString('base64')
    const mediaTypeMap: Record<string, 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'> = {
      'image/jpeg': 'image/jpeg',
      'image/jpg':  'image/jpeg',
      'image/png':  'image/png',
      'image/webp': 'image/webp',
    }
    const claudeMime = mediaTypeMap[mimeType] ?? 'image/jpeg'

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: claudeMime, data: base64Image } },
          { type: 'text', text: CLAUDE_PROMPT },
        ],
      }],
    })

    const raw     = response.content[0].type === 'text' ? response.content[0].text.trim() : '{}'
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

    let parsed: Record<string, unknown> = {}
    try { parsed = JSON.parse(cleaned) } catch { parsed = { ocr_raw: raw } }

    await supabase
      .schema('lusa')
      .from('images')
      .update({
        ocr_text         : parsed.ocr_raw          ?? '',
        objeto_detectado : parsed.objeto_detectado ?? '',
        fecha_foto       : parsed.fecha_foto       ?? null,
        rumbo            : parsed.rumbo            ?? null,
        direccion        : parsed.direccion        ?? null,
        altitud_m        : parsed.altitud_m        ?? gps.altitud_m,
        velocidad_kmh    : parsed.velocidad_kmh    ?? null,
        operador_overlay : parsed.operador_overlay ?? null,
        unidad_overlay   : parsed.unidad_overlay   ?? null,
      })
      .eq('whaapy_message_id', whaapyMsgId)

    // Post-Claude cross-check: misma imagen, metadata distinta (manipulación)
    let metadataManipulated = false
    if (validationState === 'approved' && phash) {
      const currentFecha  = parsed.fecha_foto    as string | null
      const currentUnidad = parsed.unidad_overlay as string | null

      const { data: metaMatch } = await supabase.schema('lusa').from('images')
        .select('id, fecha_foto, unidad_overlay')
        .eq('phash', phash)
        .eq('operator_id', operator.id)
        .neq('whaapy_message_id', whaapyMsgId)
        .limit(1)
        .maybeSingle()

      if (metaMatch) {
        const fechaDifiere  = currentFecha  && metaMatch.fecha_foto    && currentFecha  !== metaMatch.fecha_foto
        const unidadDifiere = currentUnidad && metaMatch.unidad_overlay && currentUnidad !== metaMatch.unidad_overlay

        if (fechaDifiere) {
          await supabase.schema('lusa').from('images')
            .update({ validation_state: 'manipulated', fraud_reason: `metadata_manipulation::${metaMatch.id}` })
            .eq('whaapy_message_id', whaapyMsgId)
          metadataManipulated = true
          console.log(`[webhook] MANIPULACIÓN DE METADATA: fecha difiere — match con ${metaMatch.id}`)
        } else if (unidadDifiere) {
          await supabase.schema('lusa').from('images')
            .update({ validation_state: 'manipulated', fraud_reason: `credential_sharing::${metaMatch.id}` })
            .eq('whaapy_message_id', whaapyMsgId)
          metadataManipulated = true
          console.log(`[webhook] CREDENTIAL SHARING: unidad difiere — match con ${metaMatch.id}`)
        }
      }
    }

    // Sin OCR o sin fecha_foto → inválida
    const ocrVacio = !parsed.ocr_raw   || String(parsed.ocr_raw).trim()   === ''
    const sinFecha = !parsed.fecha_foto || String(parsed.fecha_foto).trim() === ''
    if ((ocrVacio || sinFecha) && validationState === 'approved' && !metadataManipulated) {
      const reason = ocrVacio ? 'sin_ocr' : 'sin_fecha'
      await supabase.schema('lusa').from('images')
        .update({ validation_state: 'invalida', fraud_reason: reason })
        .eq('whaapy_message_id', whaapyMsgId)
      console.log(`[webhook] ${reason} — imagen marcada como invalida`)
    }
  } catch (e) {
    console.error('[webhook] error en análisis Claude:', e)
  }

  return NextResponse.json({ ok: true })
}
