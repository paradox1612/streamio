import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import MarketingHomePage from '@/components/MarketingHomePage'

export default async function LandingPage() {
  const cookieStore = await cookies()
  if (cookieStore.get('sb_token')?.value) {
    redirect('/dashboard')
  }

  return <MarketingHomePage />
}
