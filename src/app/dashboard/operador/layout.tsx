import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardShell from '../../components/DashboardShell'

export default async function OperadorLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) redirect('/login')

  const { data: profile } = await supabase
    .schema('lusa')
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')
  if (profile.role !== 'operador') redirect('/dashboard/admin')

  return (
    <DashboardShell role="operador" email={user.email ?? ''}>
      {children}
    </DashboardShell>
  )
}
