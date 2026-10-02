import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Branch, Offer, Place } from '../types';
import { directionsUrl } from '../urls';
import { el, externalLink } from './dom';
import { icon, initials, pinShape } from './icons';

/**
 * Leaflet map. No default Leaflet marker images are used (avoids the bundler icon-path issue);
 * markers are DOM-built divIcons and popups receive DOM nodes, never HTML strings.
 * Styling (tile tint, pins, popups, controls) lives in components.css; Leaflet only gets class names.
 */

export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
// Static constant (not data): Leaflet renders attribution markup itself.
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export interface MapView {
  showPlace(place: Place, radiusM?: number): void;
  /** Replaces the pins. `fit: false` keeps the current view (e.g. the "Verified only" switch). */
  showBranches(branches: readonly Branch[], offersById: ReadonlyMap<string, Offer>, opts?: { fit?: boolean }): void;
  clearBranches(): void;
  /** Swaps pins to the claimed check (and back) for these offer ids. */
  setClaimed(ids: ReadonlySet<string>): void;
  /** Removes the searched place, radius ring and pins and zooms back out ("Clear search"). */
  reset(): void;
  invalidateSize(): void;
}

export interface MapOptions {
  /** A branch pin was activated (click / Enter). */
  onSelect?: (offerId: string) => void;
}

function branchIcon(offerId: string, brand: string, claimed: boolean): L.DivIcon {
  const wrap = el('span', { class: `map-marker map-marker--branch pin${claimed ? ' is-claimed' : ''}`, 'data-offer-id': offerId }, [
    pinShape(),
    el('span', { class: 'pin__mono pin__mono--text', 'aria-hidden': 'true' }, [initials(brand)]),
    el('span', { class: 'pin__mono pin__mono--check', 'aria-hidden': 'true' }, [icon('check')]),
  ]);
  return L.divIcon({ html: wrap, className: 'map-marker-host', iconSize: [40, 50], iconAnchor: [20, 48], popupAnchor: [0, -46] });
}

function centerIcon(): L.DivIcon {
  const wrap = el('span', { class: 'map-marker map-marker--center' }, [
    el('span', { class: 'me__halo' }),
    el('span', { class: 'me__core' }),
  ]);
  return L.divIcon({ html: wrap, className: 'map-marker-host map-marker-host--center', iconSize: [22, 22], iconAnchor: [11, 11] });
}

function directionsLabel(brand: string, branchName: string): string {
  return branchName && branchName !== brand ? `Get directions to ${brand}, ${branchName}` : `Get directions to ${brand}`;
}

function popupContent(branch: Branch, offer: Offer | undefined): HTMLElement {
  const brand = offer?.brand ?? branch.name;
  const link = externalLink(directionsUrl(branch.lat, branch.lng), 'Get directions', {
    class: 'link link--sm map-popup__directions',
    'aria-label': `${directionsLabel(brand, branch.name)} (opens in a new tab)`,
  });
  link.appendChild(icon('arrow'));
  return el('div', { class: 'map-popup' }, [
    el('p', { class: 'map-popup__brand' }, [brand]),
    branch.name && offer && branch.name !== offer.brand ? el('p', { class: 'map-popup__name' }, [branch.name]) : null,
    offer ? el('p', { class: 'map-popup__offer' }, [offer.rewardItem ?? offer.offer]) : null,
    link,
  ]);
}

/** Leaflet control with one "recenter" button, styled like the zoom pill. */
function recenterControl(onClick: () => void): L.Control {
  const Ctl = L.Control.extend({
    onAdd() {
      const btn = el('button', { type: 'button', class: 'map-recenter', 'aria-label': 'Recenter on your search area', title: 'Recenter' }, [icon('locate')]);
      const bar = el('div', { class: 'leaflet-bar leaflet-control map-recenter-bar' }, [btn]);
      L.DomEvent.disableClickPropagation(bar);
      btn.addEventListener('click', onClick);
      return bar;
    },
  });
  return new Ctl({ position: 'topright' });
}

export function createMap(container: HTMLElement, opts: MapOptions = {}): MapView {
  const map = L.map(container, {
    zoomControl: false,
    attributionControl: true,
    scrollWheelZoom: false,
    worldCopyJump: true,
  }).setView([20, 0], 2);
  L.control.zoom({ position: 'topright' }).addTo(map);

  const tiles = L.tileLayer(TILE_URL, {
    maxZoom: 19,
    attribution: TILE_ATTRIBUTION,
    // OSM tile policy wants an identifying Referer; send origin only (see DECISIONS #6).
    referrerPolicy: 'strict-origin',
  }).addTo(map);

  const branchLayer = L.layerGroup().addTo(map);
  let centerMarker: L.Marker | null = null;
  let radiusRing: L.Circle | null = null;
  let claimed: ReadonlySet<string> = new Set();
  const markers = new Map<L.Marker, string>();
  let active: L.Marker | null = null;

  function recenter(): void {
    if (radiusRing) map.fitBounds(radiusRing.getBounds(), { padding: [12, 12] });
    else if (centerMarker) map.setView(centerMarker.getLatLng(), 13);
  }
  recenterControl(recenter).addTo(map);

  // Tile failure notice ("Map couldn't load ... Try again"), only when nothing loads at all.
  let tileErrors = 0;
  let tileLoads = 0;
  const notice = el('div', { class: 'map-notice notice', role: 'note', hidden: true }, [
    icon('globe'),
    el('div', {}, [
      el('p', { class: 'notice__title' }, ["Map couldn't load"]),
      el('p', {}, ['The map tiles did not arrive. Your quests are still listed.']),
    ]),
  ]);
  const retry = el('button', { type: 'button', class: 'btn btn--ghost btn--sm' }, [icon('refresh'), 'Try again']);
  retry.addEventListener('click', () => {
    tileErrors = 0;
    notice.hidden = true;
    tiles.redraw();
  });
  notice.appendChild(retry);
  container.parentElement?.appendChild(notice);
  tiles.on('tileload', () => {
    tileLoads += 1;
    notice.hidden = true;
  });
  tiles.on('tileerror', () => {
    tileErrors += 1;
    if (tileErrors >= 4 && tileLoads === 0) notice.hidden = false;
  });

  function setActive(m: L.Marker | null): void {
    active?.getElement()?.classList.remove('is-active');
    active = m;
    m?.getElement()?.classList.add('is-active');
  }

  function applyClaimed(m: L.Marker, offerId: string): void {
    const host = m.getElement();
    host?.querySelector('.map-marker')?.classList.toggle('is-claimed', claimed.has(offerId));
  }

  map.on('popupclose', () => setActive(null));

  return {
    showPlace(place, radiusM) {
      if (centerMarker) centerMarker.remove();
      if (radiusRing) radiusRing.remove();
      radiusRing = null;
      centerMarker = L.marker([place.lat, place.lng], {
        icon: centerIcon(),
        title: 'Your searched area',
        alt: 'Your searched area',
        keyboard: false,
        interactive: false,
      }).addTo(map);
      if (radiusM && Number.isFinite(radiusM) && radiusM > 0) {
        // Decorative search-circle outline (SVG path attributes + CSS class, no inline styles → CSP-safe).
        radiusRing = L.circle([place.lat, place.lng], {
          radius: radiusM,
          interactive: false,
          color: '#6B2D5E',
          weight: 1.2,
          opacity: 0.4,
          dashArray: '2 6',
          lineCap: 'round',
          fillColor: '#6B2D5E',
          fillOpacity: 0.05,
          className: 'map-radius',
        }).addTo(map);
        map.fitBounds(radiusRing.getBounds(), { padding: [12, 12] });
      } else {
        map.setView([place.lat, place.lng], 13);
      }
    },
    showBranches(branches, offersById, showOpts = {}) {
      branchLayer.clearLayers();
      markers.clear();
      active = null;
      const pts: L.LatLngExpression[] = [];
      for (const b of branches) {
        const offer = offersById.get(b.offerId);
        const brand = offer?.brand ?? b.name;
        const label = offer ? `${offer.brand}: ${b.name}` : b.name;
        const m = L.marker([b.lat, b.lng], { icon: branchIcon(b.offerId, brand, claimed.has(b.offerId)), title: label, alt: label, keyboard: true, riseOnHover: true })
          .bindPopup(popupContent(b, offer), { className: 'bsq-popup', maxWidth: 260, minWidth: 196, closeButton: true })
          .addTo(branchLayer);
        m.on('click', () => {
          setActive(m);
          opts.onSelect?.(b.offerId);
        });
        markers.set(m, b.offerId);
        pts.push([b.lat, b.lng]);
      }
      if (centerMarker) pts.push(centerMarker.getLatLng());
      if (showOpts.fit !== false && pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [32, 32], maxZoom: 15 });
    },
    clearBranches() {
      branchLayer.clearLayers();
      markers.clear();
      active = null;
    },
    setClaimed(ids) {
      claimed = new Set(ids);
      for (const [m, id] of markers) applyClaimed(m, id);
    },
    reset() {
      branchLayer.clearLayers();
      markers.clear();
      active = null;
      centerMarker?.remove();
      radiusRing?.remove();
      centerMarker = null;
      radiusRing = null;
      map.closePopup();
      map.setView([20, 0], 2);
    },
    invalidateSize() {
      map.invalidateSize();
    },
  };
}
