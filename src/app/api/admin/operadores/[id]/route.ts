import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { removeOperadorTag } from '@/lib/whaapy'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.schema('lusa').from('profiles')
    .select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return null
  return { admin: createAdminClient(), user }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { admin: supabase, user } = ctx

  const { id } = await params
  const body = await req.json()
  const { name, phone, unit, is_active } = body

  // Leer estado anterior para el log
  const { data: before } = await supabase.schema('lusa').from('operators')
    .select('name, phone, unit, is_active')
    .eq('id', id)
    .single()

  const updates: Record<string, unknown> = {}
  if (name      !== undefined) updates.name      = name
  if (phone     !== undefined) updates.phone     = phone
  if (unit      !== undefined) updates.unit      = unit || null
  if (is_active !== undefined) updates.is_active = is_active

  const { error } = await supabase.schema('lusa').from('operators')
    .update(updates)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.schema('lusa').from('audit_log').insert({
    image_id:         null,
    user_id:          user.id,
    user_email:       user.email!,
    action:           'editar_contacto',
    old_state:        before ? JSON.stringify({ name: before.name, phone: before.phone, unit: before.unit, is_active: before.is_active }) : null,
    new_state:        JSON.stringify(updates),
    old_fraud_reason: before?.name ?? null,
    new_fraud_reason: null,
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { admin: supabase, user } = ctx

  const { id } = await params

  const { data: op } = await supabase.schema('lusa').from('operators')
    .select('user_id, whaapy_contact_id, name, phone')
    .eq('id', id)
    .single()

  // Quitar tag "operador" en Whaapy (best-effort)
  if (op?.whaapy_contact_id) {
    removeOperadorTag(op.whaapy_contact_id).catch(() => {})
  }

  const { error: opError } = await supabase.schema('lusa').from('operators')
    .delete().eq('id', id)

  if (opError) return NextResponse.json({ error: opError.message }, { status: 500 })

  if (op?.user_id) {
    await supabase.schema('lusa').from('profiles').delete().eq('id', op.user_id)
    await supabase.auth.admin.deleteUser(op.user_id)
  }

  await supabase.schema('lusa').from('audit_log').insert({
    image_id:         null,
    user_id:          user.id,
    user_email:       user.email!,
    action:           'eliminar_contacto',
    old_state:        null,
    new_state:        null,
    old_fraud_reason: op?.name ?? null,
    new_fraud_reason: op ? `${op.name} (${op.phone})` : null,
  })

  return NextResponse.json({ ok: true })
}
