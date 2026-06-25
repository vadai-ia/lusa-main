import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function LoginLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return <>{children}</>

  const { data: profile } = await supabase
    .schema('lusa')
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'admin') redirect('/dashboard/admin')
  if (profile?.role === 'operador') redirect('/dashboard/operador')

  return <>{children}</>
}
