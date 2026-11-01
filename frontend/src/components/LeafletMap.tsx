import { useEffect, useMemo } from 'react'
import L from 'leaflet'
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { MapLocation, RouteChoice } from './DeliveryMap'

const TILE_URL = import.meta.env.VITE_MAP_TILE_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const ICONS = {
  pickup: L.divIcon({ className: 'map-pin map-pin-pickup', html: '<span></span>', iconSize: [24, 24], iconAnchor: [12, 12] }),
  delivery: L.divIcon({ className: 'map-pin map-pin-delivery', html: '<span></span>', iconSize: [24, 24], iconAnchor: [12, 12] }),
}

function MapClickHandler({ onSelect }: { onSelect: (latitude: number, longitude: number) => void }) {
  useMapEvents({
    click(event) {
      onSelect(event.latlng.lat, event.latlng.lng)
    },
  })
  return null
}

function FitMap({ points }: { points: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length > 1) map.fitBounds(points, { padding: [36, 36], maxZoom: 15 })
    else if (points.length === 1) map.setView(points[0], 14)
  }, [map, points])
  return null
}

function MapControls({ points }: { points: [number, number][] }) {
  const map = useMap()
  return (
    <div className="leaflet-top leaflet-right">
      <div className="leaflet-control map-action-control">
        <button type="button" disabled={!points.length} onClick={() => {
          if (points.length > 1) map.fitBounds(points, { padding: [36, 36], maxZoom: 15 })
          else if (points.length === 1) map.setView(points[0], 14)
        }}>Fit route</button>
        <button type="button" disabled={!points.length} onClick={() => {
          if (points.length) map.setView(points[0], 15)
        }}>Recenter</button>
      </div>
    </div>
  )
}

export default function LeafletMap({
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
  const points = useMemo(() => {
    const result: [number, number][] = []
    if (pickup?.latitude != null && pickup.longitude != null) result.push([pickup.latitude, pickup.longitude])
    if (delivery?.latitude != null && delivery.longitude != null) result.push([delivery.latitude, delivery.longitude])
    if (volunteer?.latitude != null && volunteer.longitude != null) {
      result.push([volunteer.latitude, volunteer.longitude])
    }
    if (route) result.push(...route.geometry.map(([longitude, latitude]) => [latitude, longitude] as [number, number]))
    return result
  }, [delivery, pickup, route, volunteer])
  const center: [number, number] = points[0] ?? [20, 0]

  return (
    <div className="delivery-map" aria-label="Interactive pickup and delivery map">
      <MapContainer center={center} zoom={points.length ? 13 : 2} scrollWheelZoom className="delivery-map-canvas">
        <TileLayer url={TILE_URL} attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
        <FitMap points={points} />
        <MapControls points={points} />
        {onSelect ? <MapClickHandler onSelect={onSelect} /> : null}
        {pickup?.latitude != null && pickup.longitude != null ? <Marker position={[pickup.latitude, pickup.longitude]} icon={ICONS.pickup}><Popup><strong>Pickup Location</strong><br />{pickup.address}</Popup></Marker> : null}
        {delivery?.latitude != null && delivery.longitude != null ? <Marker position={[delivery.latitude, delivery.longitude]} icon={ICONS.delivery}><Popup><strong>Delivery Location</strong><br />{delivery.address}</Popup></Marker> : null}
        {volunteer ? <CircleMarker center={[volunteer.latitude, volunteer.longitude]} radius={9} pathOptions={{ color: '#6941c6', fillColor: '#6941c6', fillOpacity: 0.9 }}><Popup>Volunteer current location</Popup></CircleMarker> : null}
        {route ? <Polyline positions={route.geometry.map(([longitude, latitude]) => [latitude, longitude])} pathOptions={{ color: '#2878c8', weight: 5, opacity: 0.85 }} /> : null}
      </MapContainer>
      <div className="map-legend" aria-label="Map legend">
        {pickup ? <span><i className="map-legend-pickup" />Pickup Location</span> : null}
        {delivery ? <span><i className="map-legend-delivery" />Delivery Location</span> : null}
        {route ? <span><i className="map-legend-route" />Calculated road route</span> : null}
        {volunteer ? <span><i className="map-legend-volunteer" />Volunteer location</span> : null}
      </div>
    </div>
  )
}
