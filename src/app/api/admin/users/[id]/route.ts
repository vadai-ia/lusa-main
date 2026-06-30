import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncOperadorContact, removeOperadorTag, addInactivoTag, removeInactivoTag } from '@/lib/whaapy'

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
  const { admin, user: adminUser } = ctx

  const { id: userId } = await params
  const { full_name, email, password, role, phone, unit, is_active } = await req.json()

  // Estado anterior
  const [{ data: prevProfile }, { data: prevOp }] = await Promise.all([
    admin.schema('lusa').from('profiles').select('role, email, full_name').eq('id', userId).single(),
    admin.schema('lusa').from('operators').select('id, name, phone, unit, whaapy_contact_id').eq('user_id', userId).maybeSingle(),
  ])

  if (!prevProfile) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

  // 1. Actualizar auth (email y/o contraseña)
  const authUpdates: { email?: string; password?: string } = {}
  if (email && email !== prevProfile.email) authUpdates.email = email
  if (password)                             authUpdates.password = password

  if (Object.keys(authUpdates).length > 0) {
    const { error: authErr } = await admin.auth.admin.updateUserById(userId, authUpdates)
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 })
  }

  // 2. Actualizar profile
  const profileUp: Record<string, unknown> = {}
  if (full_name !== undefined) profileUp.full_name = full_name || null
  if (email)                   profileUp.email     = email
  if (role)                    profileUp.role      = role

  if (Object.keys(profileUp).length > 0) {
    const { error: profErr } = await admin.schema('lusa').from('profiles')
      .update(profileUp).eq('id', userId)
    if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 })
  }

  // 3. Actualizar operators (si existe) o crear si le cambiamos a operador
  const opName = (full_name ?? prevProfile.full_name) || email || ''

  if (prevOp) {
    const opUp: Record<string, unknown> = {}
    if (full_name !== undefined) opUp.name = full_name || prevOp.name
    if (phone     !== undefined) opUp.phone = phone.replace(/^\+/, '')
    if (unit      !== undefined) opUp.unit  = unit || null

    if (Object.keys(opUp).length > 0) {
      await admin.schema('lusa').from('operators').update(opUp).eq('id', prevOp.id)
    }
  } else if (role === 'operador' && phone) {
    // Admin sin registro de operator → promovido a operador, crear registro
    const phoneSanitized = phone.replace(/^\+/, '')
    const { data: newOp } = await admin.schema('lusa').from('operators').insert({
      phone: phoneSanitized,
      name:  opName,
      user_id: userId,
      unit:  unit || null,
      is_active: true,
    }).select('id').single()

    syncOperadorContact(phoneSanitized, opName)
      .then(contactId => {
        if (contactId && newOp?.id) {
          admin.schema('lusa').from('operators')
            .update({ whaapy_contact_id: contactId }).eq('id', newOp.id).then(() => {})
        }
      })
      .catch(() => {})
  }

  // 4a. Toggle is_active
  if (is_active !== undefined && prevOp) {
    const active = Boolean(is_active)
    await admin.schema('lusa').from('operators').update({ is_active: active }).eq('id', prevOp.id)

    if (prevOp.whaapy_contact_id) {
      if (active) {
        removeInactivoTag(prevOp.whaapy_contact_id).catch(() => {})
      } else {
        addInactivoTag(prevOp.whaapy_contact_id).catch(() => {})
      }
    }

    await admin.schema('lusa').from('audit_log').insert({
      image_id:         null,
      user_id:          adminUser.id,
      user_email:       adminUser.email!,
      action:           active ? 'activar_contacto' : 'desactivar_contacto',
      old_state:        String(!active),
      new_state:        String(active),
      old_fraud_reason: prevOp.name ?? null,
      new_fraud_reason: null,
    })

    return NextResponse.json({ ok: true })
  }

  // 4b. Whaapy tags si cambió el rol
  const roleChanged = role && role !== prevProfile.role
  if (roleChanged && prevOp?.whaapy_contact_id) {
    if (role === 'admin') {
      // operador → admin: quitar tag
      removeOperadorTag(prevOp.whaapy_contact_id).catch(() => {})
    } else if (role === 'operador') {
      // admin → operador: agregar tag
      const ph = (phone || prevOp.phone || '').replace(/^\+/, '')
      if (ph) syncOperadorContact(ph, opName).catch(() => {})
    }
  }

  // 5. Audit log
  await admin.schema('lusa').from('audit_log').insert({
    image_id:         null,
    user_id:          adminUser.id,
    user_email:       adminUser.email!,
    action:           'editar_contacto',
    old_state:        JSON.stringify({ role: prevProfile.role, email: prevProfile.email, full_name: prevProfile.full_name }),
    new_state:        JSON.stringify({ role: role ?? prevProfile.role, email: email ?? prevProfile.email, full_name: full_name ?? prevProfile.full_name }),
    old_fraud_reason: prevProfile.full_name ?? prevProfile.email,
    new_fraud_reason: null,
  })

  return NextResponse.json({ ok: true })
}
