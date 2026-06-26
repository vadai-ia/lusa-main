import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncOperadorContact } from '@/lib/whaapy'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.schema('lusa').from('profiles')
    .select('role').eq('id', user.id).single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden: Admin only' }, { status: 403 })
  }

  const { email, password, role, full_name, phone, unit } = await req.json()

  if (!email || !password || !role) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (!['admin', 'operador'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 500 })
  }

  const { error: profileError } = await adminClient.schema('lusa').from('profiles').upsert({
    id: newUser.user.id,
    email,
    role,
    full_name: full_name || null,
  }, { onConflict: 'id' })

  if (profileError) {
    await adminClient.auth.admin.deleteUser(newUser.user.id)
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  if (role === 'operador') {
    if (!phone) {
      return NextResponse.json({ error: 'El teléfono es requerido para operadores' }, { status: 400 })
    }
    const phoneSanitized = phone.startsWith('+') ? phone.slice(1) : phone
    const opName = full_name || email.split('@')[0]

    const { data: newOp, error: operatorError } = await adminClient.schema('lusa').from('operators').insert({
      phone: phoneSanitized,
      name: opName,
      user_id: newUser.user.id,
      unit: unit || null,
      is_active: true,
    }).select('id').single()

    if (operatorError) {
      await adminClient.auth.admin.deleteUser(newUser.user.id)
      return NextResponse.json({ error: operatorError.message }, { status: 500 })
    }

    // Sync Whaapy y guardar contactId
    const contactId = await syncOperadorContact(phoneSanitized, opName).catch(e => {
      console.error('[users] whaapy sync failed:', e)
      return null
    })
    if (contactId && newOp?.id) {
      await adminClient.schema('lusa').from('operators')
        .update({ whaapy_contact_id: contactId })
        .eq('id', newOp.id)
      console.log(`[users] whaapy_contact_id guardado: ${contactId}`)
    }
  }

  // Admin con teléfono → guardar en operators para recibir reportes por WhatsApp
  if (role === 'admin' && phone) {
    const phoneSanitized = phone.startsWith('+') ? phone.slice(1) : phone
    const adminName = full_name || email.split('@')[0]
    await adminClient.schema('lusa').from('operators').insert({
      phone: phoneSanitized,
      name: adminName,
      user_id: newUser.user.id,
      unit: null,
      is_active: true,
    })
  }

  await adminClient.schema('lusa').from('audit_log').insert({
    image_id:         null,
    user_id:          user.id,
    user_email:       user.email!,
    action:           'crear_contacto',
    old_state:        null,
    new_state:        null,
    old_fraud_reason: full_name ?? email,
    new_fraud_reason: role === 'operador' ? `${full_name ?? email} (${phone})` : `${full_name ?? email} — ${role}`,
  })

  return NextResponse.json(
    { message: 'Operador creado correctamente', user: { id: newUser.user.id, email, role } },
    { status: 201 }
  )
}
