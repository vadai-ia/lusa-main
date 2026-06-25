'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LogoutButton({ className }: { className?: string }) {
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <button
      onClick={handleLogout}
      className={className ?? 'px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-sm'}
    >
      Cerrar sesión
    </button>
  )
}
