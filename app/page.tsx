import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'

/** Private tool: no marketing page, straight to the app or the login. */
export default async function Home() {
  const session = await getSession()
  redirect(session ? '/dashboard' : '/login')
}
