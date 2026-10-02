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
  /** Optional structured claim details (all validated in src/offers.ts). */
  /** The concrete thing you get, e.g. "A free tall drink of your choice". */
  rewardItem?: string;
  /** 1 to 6 short, ordered steps. Shown as a numbered list instead of howToClaim. */
  steps?: string[];
  /** true: a purchase is needed; false: no purchase needed; null: unknown. */
  purchaseRequired?: boolean | null;
  /** Minimum spend as written by the brand, e.g. "₹500". */
  minSpend?: string;
  /** Join the programme at least this many days before your birthday (0 = any time). */
  signupLeadDays?: number;
  /** How long the reward stays valid, e.g. "7 days from your birthday". */
  validFor?: string;
  /** What to bring, e.g. ["App", "Photo ID"]. */
  bring?: string[];
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
