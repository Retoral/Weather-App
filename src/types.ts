import type { Geometry } from "geojson";

export type PrimaryLayer = "normal" | "temperature" | "radar" | "seismic";

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
}

export interface WeatherGridPoint {
  id: string;
  lat: number;
  lon: number;
  temperature: number;
  weatherCode: number;
  windSpeed: number;
  windGust: number;
  precipitation: number;
  pressure: number;
  cloudCover: number;
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
