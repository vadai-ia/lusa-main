import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hammingDistance, HAMMING_THRESHOLD } from '@/lib/utils/phash'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.schema('lusa').from('profiles')
    .select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()

  // Traer todas las imágenes con phash que no sean ya fraude cross-check
  const { data: images, error } = await admin.schema('lusa').from('images')
    .select('id, operator_id, phash, md5_hash, created_at, validation_state, fraud_reason')
    .not('phash', 'is', null)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!images?.length) return NextResponse.json({ nuevos: 0, total: 0 })

  // Separar imágenes en grupos por operador para comparar entre ellos
  const byOp: Record<string, typeof images> = {}
  for (const img of images) {
    if (!byOp[img.operator_id]) byOp[img.operator_id] = []
    byOp[img.operator_id].push(img)
  }

  const operatorIds = Object.keys(byOp)
  let nuevos = 0
  const updates: { id: string; state: string; reason: string; old_state: string; old_reason: string | null }[] = []

  // Comparar cada imagen de operador A contra todas las de operadores B, C, D...
  for (let i = 0; i < operatorIds.length; i++) {
    for (let j = i + 1; j < operatorIds.length; j++) {
      const groupA = byOp[operatorIds[i]]
      const groupB = byOp[operatorIds[j]]

      for (const imgA of groupA) {
        for (const imgB of groupB) {
          if (!imgA.phash || !imgB.phash) continue

          const dist = hammingDistance(imgA.phash, imgB.phash)
          const isNearDup = dist <= HAMMING_THRESHOLD
          const isExact   = imgA.md5_hash === imgB.md5_hash

          if (!isNearDup && !isExact) continue

          const fraudType = isExact ? 'cross_operator_exact' : 'cross_operator_similar'

          // El más nuevo es el sospechoso; el más antiguo es el original
          const [original, sospechoso] = imgA.created_at < imgB.created_at
            ? [imgA, imgB]
            : [imgB, imgA]

          // Solo actualizar si no está ya marcado como este tipo de fraude
          const yaFlagged = sospechoso.fraud_reason?.startsWith(fraudType)
          if (!yaFlagged && sospechoso.validation_state !== 'approved') {
            updates.push({
              id:        sospechoso.id,
              state:     'intercambiada',
              reason:    `${fraudType}::${original.id}`,
              old_state: sospechoso.validation_state,
              old_reason: sospechoso.fraud_reason ?? null,
            })
            nuevos++
          }
        }
      }
    }
  }

  // Aplicar updates y registrar en audit_log
  for (const u of updates) {
    await admin.schema('lusa').from('images')
      .update({ validation_state: u.state, fraud_reason: u.reason })
      .eq('id', u.id)

    await admin.schema('lusa').from('audit_log').insert({
      image_id:         u.id,
      user_id:          user.id,
      user_email:       user.email!,
      action:           'cross_check',
      old_state:        u.old_state,
      new_state:        u.state,
      old_fraud_reason: u.old_reason,
      new_fraud_reason: u.reason,
    })
  }

  return NextResponse.json({ nuevos, total: images.length })
}
