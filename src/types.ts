import type { Geometry } from "geojson";

export type PrimaryLayer = "normal" | "temperature" | "wind" | "radar" | "seismic" | "risk";

export type Severity = "quiet" | "watch" | "warning" | "danger";

export interface CityLocation {
  id: number;
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
}

export interface LocalWeather {
  fetchedAt: string;
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    precipitation: number;
    rain: number;
    showers: number;
    snowfall: number;
    weather_code: number;
    cloud_cover: number;
    pressure_msl: number;
    wind_speed_10m: number;
    wind_gusts_10m: number;
    wind_direction_10m: number;
    visibility: number;
    uv_index: number;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    precipitation_probability: number[];
    precipitation: number[];
    weather_code: number[];
    wind_gusts_10m: number[];
    uv_index: number[];
  };
  airQuality?: AirQuality;
}

export interface AirQuality {
  us_aqi?: number;
  european_aqi?: number;
  pm2_5?: number;
  pm10?: number;
  ozone?: number;
}

export interface LocalSignal {
  id: string;
  title: string;
  detail: string;
  severity: Severity;
  sourceUrl?: string;
}

export interface WeatherGridPoint {
  id: string;
  lat: number;
  lon: number;
  time?: string;
  temperature: number;
  weatherCode: number;
  windSpeed: number;
  windGust: number;
  windDirection: number;
  precipitation: number;
  precipitationProbability?: number;
  pressure: number;
  cloudCover: number;
}

export interface AviationBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface AircraftState {
  id: string;
  callsign?: string;
  registration?: string;
  originCountry?: string;
  operator?: string;
  aircraftType?: string;
  aircraftModel?: string;
  lat: number;
  lon: number;
  altitude?: number;
  geoAltitude?: number;
  velocity?: number;
  heading?: number;
  verticalRate?: number;
  onGround?: boolean;
  squawk?: string;
  category?: number;
  categoryLabel?: string;
  flightStatus?: string;
  flightStatusDetail?: string;
  flightStatusWarning?: boolean;
  lastContact: number;
  sourceLabel: string;
}

export interface AircraftTrackPoint {
  lat: number;
  lon: number;
  altitude?: number;
  heading?: number;
  onGround?: boolean;
  time: number;
}

export interface AircraftTrack {
  aircraftId: string;
  callsign?: string;
  startTime?: number;
  endTime?: number;
  path: AircraftTrackPoint[];
  sourceLabel: string;
}

export interface AviationIncident {
  id: string;
  title: string;
  summary: string;
  lat: number;
  lon: number;
  place: string;
  time: number;
  sourceUrl: string;
  sourceLabel: string;
  sourceDomain?: string;
  confidence: "reported" | "official";
  fetchedAt: string;
}

export interface EarthquakeEvent {
  id: string;
  magnitude?: number;
  place: string;
  time: number;
  updated: number;
  url: string;
  alert?: string | null;
  tsunami: boolean;
  significance: number;
  lat: number;
  lon: number;
  depth?: number;
  feltReports?: number;
  feltIntensity?: number;
  instrumentalIntensity?: number;
  source?: string;
  sourceLabel?: string;
}

export interface GdacsAlert {
  id: string;
  title: string;
  link: string;
  source?: string;
  sourceLabel?: string;
  sourceLanguage?: string;
  date?: string;
  description?: string;
  eventType?: string;
  alertLevel?: string;
  levelCode?: string;
  areaName?: string;
  startsAt?: string;
  endsAt?: string;
  lat?: number;
  lon?: number;
  geometry?: Geometry;
}

export interface RiskSignalEvent {
  id: string;
  title: string;
  summary: string;
  kind: "conflict" | "violence" | "protest" | "threat" | "military";
  severity: Severity;
  lat: number;
  lon: number;
  place: string;
  country?: string;
  time: number;
  sourceUrl: string;
  sourceLabel: string;
  eventCode: string;
  eventRootCode: string;
  eventLabel: string;
  geoType?: number;
  geoPrecision?: string;
  goldsteinScale?: number;
  avgTone?: number;
  mentions: number;
  sources: number;
  articles: number;
  actors?: string;
  actor1?: string;
  actor2?: string;
  actor1Type?: string;
  actor2Type?: string;
  sourceDomain?: string;
  fetchedAt: string;
}

export interface RainFrame {
  time: number;
  path: string;
}

export interface RainViewerState {
  generated: number;
  host: string;
  past: RainFrame[];
  nowcast: RainFrame[];
}
