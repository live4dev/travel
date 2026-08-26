export type PublicationStatus = "awaiting-export" | "draft" | "published";
export type TransportMode = "water" | "road" | "walk" | "unknown";
export type LocationAccuracy = "exact" | "verified" | "approximate";

export interface Trip {
  title: string;
  subtitle: string;
  dates: string;
  startDate: string;
  endDate: string;
  status: PublicationStatus;
  routeNote?: string;
  mapCenter: [number, number];
  mapZoom: number;
}

export interface LocationPoint {
  id: string;
  name: string;
  coordinates: [number, number];
  accuracy: LocationAccuracy;
}

export interface DayRecord {
  id: string;
  date: string;
  dayNumber: number;
  title: string;
  summary: string;
  paragraphs: string[];
  locations: LocationPoint[];
  media: string[];
}

export interface PhotoVariant {
  width: number;
  src: string;
}

export interface MediaAsset {
  id: string;
  dayId: string;
  capturedAt: string | null;
  coordinates: [number, number] | null;
  alt: string;
  caption: string;
  width: number;
  height: number;
  src: string;
  variants: {
    avif: PhotoVariant[];
    webp: PhotoVariant[];
  };
}

export interface MediaManifest {
  generatedAt: string | null;
  media: MediaAsset[];
}

export interface RouteSegmentProperties {
  id: string;
  dayId: string;
  name: string;
  mode: TransportMode;
  accuracy: LocationAccuracy;
}

export interface RouteFeature {
  type: "Feature";
  properties: RouteSegmentProperties;
  geometry: {
    type: "LineString";
    coordinates: [number, number][];
  };
}

export interface RouteCollection {
  type: "FeatureCollection";
  features: RouteFeature[];
}
