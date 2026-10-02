export type Category = 'cafe' | 'dessert' | 'restaurant' | 'beauty' | 'fashion' | 'retail' | 'online';
export type Channel = 'in-store' | 'online' | 'both';
export type ClaimWindow = 'day' | 'week' | 'month' | 'varies';

export interface OsmHint {
  wikidata?: string;
  nameRegex?: string;
}

export interface Offer {
  id: string;
  brand: string;
  category: Category;
  offer: string;
  howToClaim: string;
  countries: string[];
  channel: Channel;
  claimWindow: ClaimWindow;
  sourceUrl: string;
  lastVerified: string;
  verified: boolean;
  osm?: OsmHint;
}

export interface OffersFile {
  schemaVersion: 1;
  updated: string;
  offers: Offer[];
}

export interface Place {
  lat: number;
  lng: number;
  countryCode: string;
  label: string;
}

export interface Branch {
  offerId: string;
  name: string;
  lat: number;
  lng: number;
}

export interface LiveResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
}
