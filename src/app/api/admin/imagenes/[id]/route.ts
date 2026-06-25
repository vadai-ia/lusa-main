import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const VALID_STATES = ['approved', 'duplicate_clean', 'manipulated', 'intercambiada', 'invalid', 'invalida', 'pending', 'rejected']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.schema('lusa').from('profiles')
    .select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { validation_state, fraud_reason } = body

  if (!VALID_STATES.includes(validation_state)) {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: current } = await admin.schema('lusa').from('images')
    .select('validation_state, fraud_reason')
    .eq('id', id)
    .single()

  const { error } = await admin.schema('lusa').from('images')
    .update({
      validation_state,
      fraud_reason: fraud_reason?.trim() || null,
    })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { error: auditError } = await admin.schema('lusa').from('audit_log').insert({
    image_id:         id,
    user_id:          user.id,
    user_email:       user.email ?? 'unknown',
    action:           'manual',
    old_state:        current?.validation_state ?? null,
    new_state:        validation_state,
    old_fraud_reason: current?.fraud_reason ?? null,
    new_fraud_reason: fraud_reason?.trim() || null,
  })

  if (auditError) console.error('[audit_log] insert error:', auditError)

  return NextResponse.json({ ok: true })
}
