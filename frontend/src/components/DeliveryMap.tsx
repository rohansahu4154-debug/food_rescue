import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useAppContext } from '../context/AppContext'
import { apiRequest } from '../services/api'
import type { FoodClaim } from '../types'

export type MapLocation = {
  address: string
  latitude: number | null
  longitude: number | null
}

export type RouteChoice = {
  id: number
  distance_km: number
  duration_minutes: number
  geometry: [number, number][]
}

type RouteData = {
  pickup: MapLocation
  delivery: MapLocation
  volunteer: { latitude: number; longitude: number; updated_at: string } | null
  routes: RouteChoice[]
  fastest_route_id: number
  shortest_distance_route_id: number | null
}

const LeafletMap = lazy(() => import('./LeafletMap'))

function InteractiveMap({
  pickup,
  delivery,
  volunteer,
  route,
  onSelect,
}: {
  pickup?: MapLocation | null
  delivery?: MapLocation | null
  volunteer?: { latitude: number; longitude: number } | null
  route?: RouteChoice | null
  onSelect?: (latitude: number, longitude: number) => void
}) {
  return (
    <Suspense fallback={<div className="delivery-map map-loading" role="status">Loading interactive map...</div>}>
      <LeafletMap pickup={pickup} delivery={delivery} volunteer={volunteer} route={route} onSelect={onSelect} />
    </Suspense>
  )
}

export function LocationMapPreview({
  pickup,
  delivery,
  volunteer,
}: {
  pickup: MapLocation
  delivery?: MapLocation | null
  volunteer?: { latitude: number; longitude: number } | null
}) {
  return <InteractiveMap pickup={pickup} delivery={delivery} volunteer={volunteer} />
}

export function PickupLocationPicker({
  value,
  onChange,
  title = 'Pickup location',
}: {
  value: MapLocation
  onChange: (location: MapLocation) => void
  title?: string
}) {
  const { token } = useAppContext()
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')

  async function searchAddress() {
    const address = value.address.trim()
    if (address.length < 3) {
      setError('Enter an address to search, or select a point on the map.')
      return
    }
    setSearching(true)
    setError('')
    try {
      const location = await apiRequest<MapLocation>(`/locations/geocode?${new URLSearchParams({ address })}`, {}, token)
      onChange(location)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to find that address.')
    } finally {
      setSearching(false)
    }
  }

  return (
    <section className="map-location-picker">
      <label>{title}<input value={value.address} maxLength={500} onChange={(event) => onChange({ ...value, address: event.target.value, latitude: null, longitude: null })} /></label>
      <button type="button" className="button button-secondary" disabled={searching} onClick={() => void searchAddress()}>{searching ? 'Searching address...' : 'Find address on map'}</button>
      <p className="map-hint">Click the map to select the exact location. Coordinates: {value.latitude == null || value.longitude == null ? 'not selected' : `${value.latitude.toFixed(5)}, ${value.longitude.toFixed(5)}`}</p>
      {error ? <p className="map-error" role="alert">{error}</p> : null}
      <InteractiveMap
        pickup={value.latitude == null || value.longitude == null ? null : value}
        onSelect={(latitude, longitude) => onChange({ ...value, latitude, longitude })}
      />
    </section>
  )
}

export function DeliveryRouteMap({
  claim,
  editableDelivery = false,
  shareLocation = false,
}: {
  claim: Pick<FoodClaim, 'id' | 'status' | 'delivery_address' | 'delivery_latitude' | 'delivery_longitude' | 'volunteer_latitude' | 'volunteer_longitude' | 'volunteer_location_updated_at'>
  editableDelivery?: boolean
  shareLocation?: boolean
}) {
  const { token } = useAppContext()
  const [delivery, setDelivery] = useState<MapLocation>({
    address: claim.delivery_address ?? '',
    latitude: claim.delivery_latitude,
    longitude: claim.delivery_longitude,
  })
  const [routeData, setRouteData] = useState<RouteData | null>(null)
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tracking, setTracking] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const watchId = useRef<number | null>(null)
  const lastSentAt = useRef(0)

  useEffect(() => {
    let active = true
    void apiRequest<RouteData>(`/ngo/claims/${claim.id}/route`, {}, token).then((result) => {
      if (active) {
        setRouteData(result)
        setDelivery(result.delivery)
        setSelectedRouteId(result.fastest_route_id)
      }
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Unable to calculate the road route.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [claim.id, revision, token])

  useEffect(() => {
    if (!editableDelivery || !['assigned', 'collected'].includes(claim.status)) return
    const timer = window.setInterval(() => {
      void apiRequest<{ volunteer: RouteData['volunteer'] }>(
        `/ngo/claims/${claim.id}/volunteer-location`,
        {},
        token,
      ).then((result) => {
        setRouteData((previous) => previous ? { ...previous, volunteer: result.volunteer } : previous)
      }).catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : 'Unable to refresh volunteer location.')
      })
    }, 15000)
    return () => window.clearInterval(timer)
  }, [claim.id, claim.status, editableDelivery, token])

  useEffect(() => {
    if (!tracking || !shareLocation || !navigator.geolocation || !['assigned', 'collected'].includes(claim.status)) {
      return
    }
    watchId.current = navigator.geolocation.watchPosition((position) => {
      const now = Date.now()
      if (now - lastSentAt.current < 10000) return
      lastSentAt.current = now
      const current = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }
      void apiRequest(`/volunteer/tasks/${claim.id}/location`, {
        method: 'POST',
        body: JSON.stringify(current),
      }, token).then(() => setRouteData((previous) => previous ? {
        ...previous,
        volunteer: { ...current, updated_at: new Date().toISOString() },
      } : previous)).catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : 'Unable to share your location.')
      })
    }, (reason) => {
      setError(reason.code === reason.PERMISSION_DENIED
        ? 'Location permission was denied. Your position is not being shared.'
        : 'Unable to read your current location.')
      setTracking(false)
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 })
    return () => {
      const wasTracking = watchId.current != null
      if (wasTracking && watchId.current != null) navigator.geolocation.clearWatch(watchId.current)
      watchId.current = null
      if (wasTracking) {
        void apiRequest(`/volunteer/tasks/${claim.id}/location`, { method: 'DELETE' }, token).catch(() => {
          console.error('Unable to clear the last shared volunteer location from the server.')
        })
      }
    }
  }, [claim.id, claim.status, shareLocation, token, tracking])

  const selectedRoute = useMemo(
    () => routeData?.routes.find((route) => route.id === selectedRouteId) ?? null,
    [routeData, selectedRouteId],
  )

  async function saveDeliveryLocation() {
    if (!delivery.address.trim() || delivery.latitude == null || delivery.longitude == null) {
      setError('Enter a delivery address and select a point on the map.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await apiRequest(`/ngo/claims/${claim.id}/delivery-location`, {
        method: 'PUT',
        body: JSON.stringify({ address: delivery.address.trim(), latitude: delivery.latitude, longitude: delivery.longitude }),
      }, token)
      setLoading(true)
      setRevision((value) => value + 1)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save the delivery location.')
    } finally {
      setSaving(false)
    }
  }

  const openDirections = routeData
    ? `https://www.google.com/maps/dir/?api=1&origin=${routeData.pickup.latitude},${routeData.pickup.longitude}&destination=${routeData.delivery.latitude},${routeData.delivery.longitude}&travelmode=driving`
    : ''

  return (
    <section className="delivery-route-panel">
      <h3>Pickup and delivery route</h3>
      {editableDelivery ? (
        <>
          <PickupLocationPicker title="Delivery location" value={delivery} onChange={setDelivery} />
          <button type="button" className="button button-primary" disabled={saving} onClick={() => void saveDeliveryLocation()}>{saving ? 'Saving delivery location...' : 'Save delivery location'}</button>
        </>
      ) : null}
      {loading ? <p role="status">Calculating road route...</p> : null}
      {error ? <p className="map-error" role="alert">{error}</p> : null}
      {routeData ? (
        <>
          <div className="route-summary">
            <label>Route
              <select value={selectedRouteId ?? ''} onChange={(event) => setSelectedRouteId(Number(event.target.value))}>
                {routeData.routes.map((route) => <option value={route.id} key={route.id}>
                  {route.id === routeData.fastest_route_id && route.id === routeData.shortest_distance_route_id
                    ? 'Fastest and shortest among returned alternatives'
                    : route.id === routeData.fastest_route_id
                      ? 'Fastest route'
                      : route.id === routeData.shortest_distance_route_id
                        ? 'Shortest among returned alternatives'
                        : `Alternative ${route.id + 1}`}
                </option>)}
              </select>
            </label>
            {selectedRoute ? <p><strong>{selectedRoute.distance_km} km</strong> · <strong>{selectedRoute.duration_minutes} min</strong> estimated driving time</p> : null}
          </div>
          <InteractiveMap pickup={routeData.pickup} delivery={routeData.delivery} volunteer={routeData.volunteer} route={selectedRoute} />
          <a className="button button-secondary map-directions" href={openDirections} target="_blank" rel="noreferrer">Open directions in Google Maps</a>
          {routeData.volunteer?.updated_at ? <p className="map-hint">Volunteer location updated {new Date(routeData.volunteer.updated_at).toLocaleTimeString()}.</p> : null}
        </>
      ) : null}
      {shareLocation ? (
        <button type="button" className="button button-secondary" disabled={!['assigned', 'collected'].includes(claim.status)} onClick={() => {
          setError('')
          if (!tracking && !navigator.geolocation) {
            setError('Location sharing is not available in this browser.')
            return
          }
          setTracking((value) => !value)
        }}>
          {tracking ? 'Stop sharing my location' : 'Share my current location'}
        </button>
      ) : null}
    </section>
  )
}
