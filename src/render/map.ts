import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Branch, Offer, Place } from '../types';
import { directionsUrl } from '../urls';
import { el, externalLink } from './dom';
import { centerIcon, heartIcon } from './icons';

/**
 * Leaflet map. No default Leaflet marker images are used (avoids the bundler icon-path issue);
 * markers are DOM-built divIcons and popups receive DOM nodes, never HTML strings.
 */

export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
// Static constant (not data) — Leaflet renders attribution markup itself.
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export interface MapView {
  showPlace(place: Place): void;
  showBranches(branches: readonly Branch[], offersById: ReadonlyMap<string, Offer>): void;
  clearBranches(): void;
  invalidateSize(): void;
}

function markerIcon(kind: 'branch' | 'center', category?: string): L.DivIcon {
  const wrap = el('span', { class: `map-marker map-marker--${kind}`, 'data-category': category ?? null });
  wrap.appendChild(kind === 'branch' ? heartIcon() : centerIcon());
  return L.divIcon({
    html: wrap,
    className: 'map-marker-host',
    iconSize: kind === 'branch' ? [28, 28] : [22, 22],
    iconAnchor: kind === 'branch' ? [14, 26] : [11, 11],
    popupAnchor: [0, -24],
  });
}

function popupContent(branch: Branch, offer: Offer | undefined): HTMLElement {
  return el('div', { class: 'map-popup' }, [
    el('strong', { class: 'map-popup__brand' }, [offer?.brand ?? branch.name]),
    branch.name && offer && branch.name !== offer.brand ? el('span', { class: 'map-popup__name' }, [branch.name]) : null,
    offer ? el('p', { class: 'map-popup__offer' }, [offer.offer]) : null,
    externalLink(directionsUrl(branch.lat, branch.lng), 'Get directions', { class: 'map-popup__directions' }),
  ]);
}

export function createMap(container: HTMLElement): MapView {
  const map = L.map(container, {
    zoomControl: true,
    attributionControl: true,
    scrollWheelZoom: false,
    worldCopyJump: true,
  }).setView([20, 0], 2);

  L.tileLayer(TILE_URL, {
    maxZoom: 19,
    attribution: TILE_ATTRIBUTION,
    // OSM tile policy wants an identifying Referer; send origin only (see DECISIONS #6).
    referrerPolicy: 'strict-origin',
  }).addTo(map);

  const branchLayer = L.layerGroup().addTo(map);
  let centerMarker: L.Marker | null = null;

  return {
    showPlace(place) {
      if (centerMarker) centerMarker.remove();
      centerMarker = L.marker([place.lat, place.lng], {
        icon: markerIcon('center'),
        title: 'Your searched area',
        alt: 'Your searched area',
        keyboard: false,
        interactive: false,
      }).addTo(map);
      map.setView([place.lat, place.lng], 13);
    },
    showBranches(branches, offersById) {
      branchLayer.clearLayers();
      const pts: L.LatLngExpression[] = [];
      for (const b of branches) {
        const offer = offersById.get(b.offerId);
        const label = offer ? `${offer.brand}: ${b.name}` : b.name;
        L.marker([b.lat, b.lng], { icon: markerIcon('branch', offer?.category), title: label, alt: label, keyboard: true })
          .bindPopup(popupContent(b, offer))
          .addTo(branchLayer);
        pts.push([b.lat, b.lng]);
      }
      if (centerMarker) pts.push(centerMarker.getLatLng());
      if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [32, 32], maxZoom: 15 });
    },
    clearBranches() {
      branchLayer.clearLayers();
    },
    invalidateSize() {
      map.invalidateSize();
    },
  };
}
