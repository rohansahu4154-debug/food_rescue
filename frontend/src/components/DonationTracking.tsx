import { Check } from 'lucide-react'
import type { FoodClaim } from '../types'

export function DonationTracking({ claim }: { claim: FoodClaim }) {
  const stages = [
    { label: 'Donation Posted', complete: true },
    { label: 'NGO Matched', complete: ['claimed', 'collected', 'delivered'].includes(claim.status) },
    { label: 'Pickup Scheduled', complete: claim.volunteer_id !== null || ['collected', 'delivered'].includes(claim.status) },
    { label: 'Food Delivered', complete: claim.delivered_at !== null || claim.status === 'delivered' },
  ]

  return (
    <ol className="tracking-timeline" aria-label={`Donation tracking for listing ${claim.listing_id}`}>
      {stages.map((stage) => (
        <li className={stage.complete ? 'stage-complete' : ''} key={stage.label}>
          <span className="stage-marker">{stage.complete ? <Check aria-hidden="true" size={13} /> : null}</span>
          <span>{stage.label}</span>
        </li>
      ))}
    </ol>
  )
}
