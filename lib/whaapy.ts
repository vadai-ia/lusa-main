const WHAAPY_BASE = 'https://api.whaapy.com/contacts/v1'

function headers() {
  return {
    'Authorization': `Bearer ${process.env.WHAAPY_API_KEY}`,
    'Content-Type': 'application/json',
  }
}

/** Busca o crea el contacto, agrega tag "operador". Retorna el contactId o null. */
export async function syncOperadorContact(phone: string, name: string): Promise<string | null> {
  const apiKey = process.env.WHAAPY_API_KEY
  if (!apiKey) return null

  try {
    // Buscar por teléfono
    const searchRes = await fetch(`${WHAAPY_BASE}?search=${encodeURIComponent(phone)}`, { headers: headers() })
    if (!searchRes.ok) return null
    const searchData = await searchRes.json()
    const existing = (searchData.contacts ?? []).find(
      (c: { phone_number: string }) => c.phone_number === phone || c.phone_number === `+${phone}`
    )

    if (existing) {
      const mergedTags = (existing.tags ?? []).includes('operador')
        ? existing.tags
        : [...(existing.tags ?? []), 'operador']
      await fetch(`${WHAAPY_BASE}/${existing.id}`, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({ name, tags: mergedTags }),
      })
      return existing.id as string
    } else {
      const phoneE164 = phone.startsWith('+') ? phone : `+${phone}`
      const createRes = await fetch(WHAAPY_BASE, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ phone_number: phoneE164, name, tags: ['operador'] }),
      })
      if (!createRes.ok) return null
      const created = await createRes.json()
      return (created.contact?.id ?? created.id ?? null) as string | null
    }
  } catch (e) {
    console.error('[whaapy] syncOperadorContact error:', e)
    return null
  }
}

/** Agrega el tag "inactivo" al contacto. */
export async function addInactivoTag(contactId: string): Promise<void> {
  if (!process.env.WHAAPY_API_KEY) return
  try {
    await fetch(`${WHAAPY_BASE}/${contactId}`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({ add_tags: ['inactivo'] }),
    })
  } catch (e) {
    console.error('[whaapy] addInactivoTag error:', e)
  }
}

/** Quita el tag "inactivo" del contacto. */
export async function removeInactivoTag(contactId: string): Promise<void> {
  if (!process.env.WHAAPY_API_KEY) return
  try {
    await fetch(`${WHAAPY_BASE}/${contactId}`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({ remove_tags: ['inactivo'] }),
    })
  } catch (e) {
    console.error('[whaapy] removeInactivoTag error:', e)
  }
}

/** Agrega el tag "operador" al contacto. */
export async function addOperadorTag(contactId: string): Promise<void> {
  if (!process.env.WHAAPY_API_KEY) return
  try {
    await fetch(`${WHAAPY_BASE}/${contactId}`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({ add_tags: ['operador'] }),
    })
  } catch (e) {
    console.error('[whaapy] addOperadorTag error:', e)
  }
}

/** Quita el tag "operador" del contacto. */
export async function removeOperadorTag(contactId: string): Promise<void> {
  if (!process.env.WHAAPY_API_KEY) return
  try {
    await fetch(`${WHAAPY_BASE}/${contactId}`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({ remove_tags: ['operador'] }),
    })
  } catch (e) {
    console.error('[whaapy] removeOperadorTag error:', e)
  }
}
