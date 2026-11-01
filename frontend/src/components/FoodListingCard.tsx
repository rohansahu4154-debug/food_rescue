import { ArrowRight, Clock3, MapPin, PackageCheck, UtensilsCrossed } from 'lucide-react'
import { useAppContext } from '../context/AppContext'
import type { FoodListing } from '../types'

export function FoodListingCard({
  listing,
  canClaim = false,
  onClaimed,
}: {
  listing: FoodListing
  canClaim?: boolean
  onClaimed?: () => Promise<void>
}) {
  const { claimBusy, handleClaimFood } = useAppContext()
  async function claim() {
    await handleClaimFood(listing.id)
    await onClaimed?.()
  }
  return (
    <article className="food-listing-card">
      <div className="food-listing-art" role="img" aria-label="Food image unavailable from the current API">
        <UtensilsCrossed aria-hidden="true" size={38} strokeWidth={1.5} />
        <span>Food photo unavailable</span>
      </div>
      <div className="food-listing-content">
        <div className="food-title-row"><h3>{listing.title}</h3><span className="food-category">{listing.source_type}</span></div>
        <p className="food-description">{listing.description || 'Food description not provided.'}</p>
        <div className="food-details-grid">
          <p><PackageCheck aria-hidden="true" size={16} /><span><strong>{listing.quantity} {listing.unit}</strong><small>Available</small></span></p>
          <p><MapPin aria-hidden="true" size={16} /><span><strong>{listing.pickup_location}</strong><small>Pickup location</small></span></p>
          <p><Clock3 aria-hidden="true" size={16} /><span><strong>{new Date(listing.expires_at).toLocaleString()}</strong><small>Food expiry · pickup time not provided</small></span></p>
        </div>
        <div className="food-card-bottom">
          <span className="food-price">{listing.price_paise === 0 ? 'Free' : `₹${(listing.price_paise / 100).toFixed(2)}`}</span>
          {canClaim ? (
            <button type="button" className="button button-primary" disabled={claimBusy === listing.id} onClick={() => void claim()}>
              {claimBusy === listing.id ? 'Claiming...' : 'Claim Food'}<ArrowRight aria-hidden="true" size={16} />
            </button>
          ) : <span className="food-category">NGO claim only</span>}
        </div>
      </div>
    </article>
  )
}
