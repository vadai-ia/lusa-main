import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncOperadorContact } from '@/lib/whaapy'

const DEFAULT_PASSWORD = '12345678'

function nameToEmail(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 30) || 'usuario'
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.schema('lusa').from('profiles')
    .select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { contacts } = await req.json() as {
    contacts: Array<{ name: string; phone: string; role: string }>
  }

  if (!Array.isArray(contacts) || contacts.length === 0) {
    return NextResponse.json({ error: 'No contacts provided' }, { status: 400 })
  }

  const adminClient = createAdminClient()
  const usedEmails = new Set<string>()
  const results: Array<{ name: string; email: string; status: 'ok' | 'error'; error?: string }> = []

  for (const contact of contacts) {
    const name  = (contact.name ?? '').trim()
    const phone = (contact.phone ?? '').toString().trim().replace(/^\+/, '')
    const role  = ['admin', 'operador'].includes(contact.role) ? contact.role : 'operador'

    if (!name || !phone) {
      results.push({ name: name || '(sin nombre)', email: '', status: 'error', error: 'Nombre y teléfono son requeridos' })
      continue
    }

    const base = nameToEmail(name)
    let email = `${base}@hotmail.com`
    let n = 2
    while (usedEmails.has(email)) { email = `${base}${n}@hotmail.com`; n++ }
    usedEmails.add(email)

    try {
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password: DEFAULT_PASSWORD,
        email_confirm: true,
      })
      if (createError) throw new Error(createError.message)

      const { error: profileError } = await adminClient.schema('lusa').from('profiles').upsert({
        id: newUser.user.id,
        email,
        role,
        full_name: name,
      }, { onConflict: 'id' })
      if (profileError) {
        await adminClient.auth.admin.deleteUser(newUser.user.id)
        throw new Error(profileError.message)
      }

      if (role === 'operador') {
        const { data: newOp, error: opError } = await adminClient.schema('lusa').from('operators').insert({
          phone,
          name,
          user_id: newUser.user.id,
          is_active: true,
        }).select('id').single()

        if (opError) {
          await adminClient.auth.admin.deleteUser(newUser.user.id)
          throw new Error(opError.message)
        }

        // Sync Whaapy y guardar contactId
        syncOperadorContact(phone, name)
          .then(contactId => {
            if (contactId && newOp?.id) {
              adminClient.schema('lusa').from('operators')
                .update({ whaapy_contact_id: contactId })
                .eq('id', newOp.id)
                .then(() => {})
            }
          })
          .catch(() => {})
      }

      results.push({ name, email, status: 'ok' })
    } catch (e) {
      results.push({ name, email, status: 'error', error: e instanceof Error ? e.message : 'Error desconocido' })
    }
  }

  const exitosos = results.filter(r => r.status === 'ok').length
  const errores  = results.filter(r => r.status === 'error').length

  await adminClient.schema('lusa').from('audit_log').insert({
    image_id:         null,
    user_id:          user.id,
    user_email:       user.email!,
    action:           'importar_contactos',
    old_state:        null,
    new_state:        null,
    old_fraud_reason: null,
    new_fraud_reason: `${contacts.length} recibidos — ${exitosos} importados, ${errores} errores`,
  })

  return NextResponse.json({ results })
}
