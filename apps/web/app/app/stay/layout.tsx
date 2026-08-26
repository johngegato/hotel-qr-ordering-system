import type { Metadata } from 'next'
import StayRootClientWrapper from './components/StayRootClientWrapper'

export const metadata: Metadata = {
  title: 'Guest Concierge | Kekehyu Hotel',
  description: 'Your digital in-room hotel concierge.',
}

export default function StayLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <StayRootClientWrapper>
      {children}
    </StayRootClientWrapper>
  )
}
