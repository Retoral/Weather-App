import type {
  AirQuality,
  AircraftState,
  AircraftTrack,
  AircraftTrackPoint,
  AviationBounds,
  AviationIncident,
  CityLocation,
  EarthquakeEvent,
  GdacsAlert,
  LocalSignal,
  LocalWeather,
  RainViewerState,
  RiskSignalEvent,
  Severity,
  WeatherGridPoint
} from "../types";
import { formatRain, formatTemperature, formatWind, weatherCodeLabel } from "../utils/weatherCodes";
import type { RainUnit, TemperatureUnit, WindUnit } from "../utils/weatherCodes";

const OPEN_METEO_FORECAST = "https://api.open-meteo.com/v1/forecast";
const OPEN_METEO_GEOCODING = "https://geocoding-api.open-meteo.com/v1/search";
const OPEN_METEO_AIR = "https://air-quality-api.open-meteo.com/v1/air-quality";
const USGS_EARTHQUAKES = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson";
const USGS_MAJOR_EARTHQUAKES = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson";
const EMSC_EARTHQUAKES = "https://www.seismicportal.eu/fdsnws/event/1/query";
const GEONET_EARTHQUAKES = "https://api.geonet.org.nz/quake?MMI=-1";
const BMKG_M5_EARTHQUAKES = "https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json";
const BMKG_FELT_EARTHQUAKES = "https://data.bmkg.go.id/DataMKG/TEWS/gempadirasakan.json";
const INGV_EARTHQUAKES = "https://webservices.ingv.it/fdsnws/event/1/query";
const TAIWAN_CWA_EARTHQUAKES = "https://sta.ci.taiwan.gov.tw/STA_Earthquake_v2/v1.0/Things";
const RAINVIEWER = "https://api.rainviewer.com/public/weather-maps.json";
const GDACS_RSS = "https://www.gdacs.org/xml/rss.xml";
const SMHI_WARNINGS = "https://opendata-download-warnings.smhi.se/ibww/api/version/1/warning.json";
const NWS_ALERTS = "https://api.weather.gov/alerts/active?status=actual&message_type=alert,update";
const MET_NORWAY_ALERTS = "https://api.met.no/weatherapi/metalerts/2.0/current.json";
const DWD_WARNINGS = "https://www.dwd.de/DWD/warnungen/warnapp/json/warnings.json";
const HKO_WARNING_SUMMARY = "https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum&lang=en";
const HKO_WARNING_INFO = "https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warningInfo&lang=en";
const JMA_WARNING_MAP = "https://www.jma.go.jp/bosai/warning/data/warning/map.json";
const JMA_AREA_METADATA = "https://www.jma.go.jp/bosai/common/const/area.json";
const INMET_ACTIVE_WARNINGS = "https://apiprevmet3.inmet.gov.br/avisos/ativos";
const GDELT_LAST_UPDATE = "http://data.gdeltproject.org/gdeltv2/lastupdate.txt";
const OPENSKY_STATES = "https://opensky-network.org/api/states/all";
const OPENSKY_TRACKS = "https://opensky-network.org/api/tracks/all";
const ADSB_LOL_AIRCRAFT = "https://api.adsb.lol/v2/lat";
const WEATHER_GRID_CACHE_KEY = "weather-watch:weather-grid-cache:v3";
const RISK_EVENTS_CACHE_KEY = "weather-watch:risk-events-cache:v3";
const AIRCRAFT_CACHE_PREFIX = "weather-watch:aircraft-cache:v2";
const AIRCRAFT_TRACK_CACHE_PREFIX = "weather-watch:aircraft-track-cache:v1";
const AVIATION_INCIDENTS_CACHE_KEY = "weather-watch:aviation-incidents-cache:v1";
const EARTHQUAKE_EVENTS_CACHE_KEY = "weather-watch:earthquake-events-cache:v1";
const WARNING_EVENTS_CACHE_KEY = "weather-watch:warning-events-cache:v1";
const EVENT_RETENTION_MS = 21 * 24 * 60 * 60 * 1000;
const WEATHER_GRID_FRESH_MS = 9 * 60 * 1000;
const WEATHER_GRID_STALE_MS = 8 * 60 * 60 * 1000;
const RISK_EVENTS_FRESH_MS = 55 * 1000;
const RISK_EVENTS_STALE_MS = 45 * 60 * 1000;
const AIRCRAFT_FRESH_MS = 55 * 1000;
const AIRCRAFT_STALE_MS = 30 * 60 * 1000;
const AIRCRAFT_TRACK_FRESH_MS = 2 * 60 * 1000;
const AIRCRAFT_TRACK_STALE_MS = 20 * 60 * 1000;
const AVIATION_INCIDENTS_FRESH_MS = 10 * 60 * 1000;
const AVIATION_INCIDENTS_STALE_MS = EVENT_RETENTION_MS;
const EARTHQUAKE_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const EARTHQUAKE_PROVIDER_TIMEOUT_MS = 9 * 1000;
const LOCAL_WEATHER_CACHE_PREFIX = "weather-watch:local-weather-cache";
const LOCAL_WEATHER_FRESH_MS = 9 * 60 * 1000;
const LOCAL_WEATHER_STALE_MS = 6 * 60 * 60 * 1000;
const PROVIDER_COOLDOWN_PREFIX = "weather-watch:provider-cooldown:v3";
const RATE_LIMIT_COOLDOWN_MS = 10 * 60 * 1000;
const WEATHER_GRID_PROVIDER = "open-meteo-grid";
const WEATHER_GRID_FAILURE_COOLDOWN_MS = 90 * 1000;
const AIRCRAFT_PROVIDER = "opensky-states";
const AIRCRAFT_FAILURE_COOLDOWN_MS = 5 * 60 * 1000;
const ADSB_LOL_FALLBACK_RADIUS_KM = 350;
const ADSB_LOL_MAX_FALLBACK_QUERIES = 12;
const ADSB_LOL_QUERY_TIMEOUT_MS = 4_500;

class WeatherRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string
  ) {
    super(message);
    this.name = "WeatherRequestError";
  }
}

class WeatherProviderPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WeatherProviderPayloadError";
  }
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  if (shouldPreferBridgeJson(url) && window.weatherWatch?.fetchText) {
    return parseProviderJsonText<T>(await window.weatherWatch.fetchText(url));
  }

  try {
    const response = await fetch(url, { signal, cache: "no-store" });
    if (!response.ok) {
      throw new WeatherRequestError(`Request failed with ${response.status}`, response.status, url);
    }
    return validateProviderJson(await response.json()) as T;
  } catch (browserError) {
    if (browserError instanceof WeatherRequestError || browserError instanceof WeatherProviderPayloadError || !window.weatherWatch?.fetchText) {
      throw browserError;
    }

    return parseProviderJsonText<T>(await window.weatherWatch.fetchText(url));
  }
}

function shouldPreferBridgeJson(url: string) {
  try {
    const parsed = new URL(url);
    return ["api.open-meteo.com", "air-quality-api.open-meteo.com", "geocoding-api.open-meteo.com"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function validateProviderJson(data: unknown) {
  if (data && typeof data === "object" && "error" in data && data.error === true) {
    const reason = "reason" in data && typeof data.reason === "string" ? data.reason : "Weather data request failed";
    throw new WeatherProviderPayloadError(reason);
  }
  return data;
}

function parseProviderJsonText<T>(text: string): T {
  return validateProviderJson(JSON.parse(text)) as T;
}

async function fetchJsonViaText<T>(url: string, signal?: AbortSignal): Promise<T> {
  try {
    return await fetchJson<T>(url, signal);
  } catch (browserError) {
    const text = await fetchText(url, signal);
    try {
      return parseProviderJsonText<T>(text);
    } catch {
      throw browserError;
    }
  }
}

async function fetchBrowserText(url: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch(url, { signal, cache: "no-store" });
  if (!response.ok) {
    throw new WeatherRequestError(`Request failed with ${response.status}`, response.status, url);
  }
  return response.text();
}

async function fetchText(url: string, signal?: AbortSignal, options: { preferBrowser?: boolean } = {}): Promise<string> {
  if (options.preferBrowser) {
    try {
      return await fetchBrowserText(url, signal);
    } catch (browserError) {
      if (!window.weatherWatch?.fetchText) throw browserError;
      return window.weatherWatch.fetchText(url);
    }
  }

  if (window.weatherWatch?.fetchText) {
    try {
      return await window.weatherWatch.fetchText(url);
    } catch (electronError) {
      try {
        return await fetchBrowserText(url, signal);
      } catch {
        throw electronError;
      }
    }
  }

  return fetchBrowserText(url, signal);
}

async function fetchZipText(url: string): Promise<string> {
  if (!window.weatherWatch?.fetchZipText) {
    throw new Error("Compressed live feed requires the desktop app");
  }

  return window.weatherWatch.fetchZipText(url);
}

export async function searchCities(query: string, language = "en", signal?: AbortSignal): Promise<CityLocation[]> {
  const url = new URL(OPEN_METEO_GEOCODING);
  url.searchParams.set("name", query);
  url.searchParams.set("count", "8");
  url.searchParams.set("language", language);
  url.searchParams.set("format", "json");

  const data = await fetchJson<{ results?: CityLocation[] }>(url.toString(), signal);
  return data.results ?? [];
}

export async function fetchLocalWeather(
  location: CityLocation,
  signal?: AbortSignal,
  options: { freshMs?: number } = {}
): Promise<LocalWeather> {
  const freshCache = readLocalWeatherCache(location, options.freshMs ?? LOCAL_WEATHER_FRESH_MS);
  if (freshCache) return freshCache;

  const providers: Array<{ id: "met-no" | "open-meteo"; fetchWeather: () => Promise<LocalWeather> }> = [
    {
      id: "met-no",
      fetchWeather: async () => {
        const weather = await fetchMetNorwayLocalWeather(location, signal);
        const airQuality = await fetchOpenMeteoAirQuality(location, signal).catch(() => undefined);
        return { ...weather, airQuality };
      }
    },
    {
      id: "open-meteo",
      fetchWeather: () => fetchOpenMeteoLocalWeather(location, signal)
    }
  ];

  let lastError: unknown;
  const cooledDownProviders: typeof providers = [];

  for (const provider of providers) {
    if (providerInCooldown(provider.id)) {
      cooledDownProviders.push(provider);
      continue;
    }

    try {
      const weather = await provider.fetchWeather();
      writeLocalWeatherCache(location, weather);
      clearProviderCooldown(provider.id);
      return weather;
    } catch (error) {
      lastError = error;
      if (shouldCooldownProvider(error)) {
        setProviderCooldown(provider.id, RATE_LIMIT_COOLDOWN_MS);
      }
    }
  }

  const staleCache = readLocalWeatherCache(location, LOCAL_WEATHER_STALE_MS);
  if (staleCache) return staleCache;

  for (const provider of cooledDownProviders) {
    try {
      const weather = await provider.fetchWeather();
      writeLocalWeatherCache(location, weather);
      clearProviderCooldown(provider.id);
      return weather;
    } catch (error) {
      lastError = error;
      if (shouldCooldownProvider(error)) {
        setProviderCooldown(provider.id, RATE_LIMIT_COOLDOWN_MS);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unable to refresh local weather");
}

async function fetchOpenMeteoLocalWeather(location: CityLocation, signal?: AbortSignal): Promise<LocalWeather> {
  const weatherUrl = new URL(OPEN_METEO_FORECAST);
  weatherUrl.searchParams.set("latitude", String(location.latitude));
  weatherUrl.searchParams.set("longitude", String(location.longitude));
  weatherUrl.searchParams.set(
    "current",
    [
      "temperature_2m",
      "apparent_temperature",
      "relative_humidity_2m",
      "precipitation",
      "rain",
      "showers",
      "snowfall",
      "weather_code",
      "cloud_cover",
      "pressure_msl",
      "wind_speed_10m",
      "wind_gusts_10m",
      "wind_direction_10m",
      "visibility",
      "uv_index"
    ].join(",")
  );
  weatherUrl.searchParams.set(
    "hourly",
    ["temperature_2m", "precipitation_probability", "precipitation", "weather_code", "wind_gusts_10m", "uv_index"].join(",")
  );
  weatherUrl.searchParams.set("forecast_days", "2");
  weatherUrl.searchParams.set("timezone", location.timezone || "auto");

  const [weather, air] = await Promise.all([
    fetchJson<Omit<LocalWeather, "fetchedAt" | "airQuality">>(weatherUrl.toString(), signal),
    fetchOpenMeteoAirQuality(location, signal).catch(() => undefined)
  ]);

  return {
    ...weather,
    fetchedAt: new Date().toISOString(),
    airQuality: air
  };
}

async function fetchOpenMeteoAirQuality(location: CityLocation, signal?: AbortSignal) {
  const airUrl = new URL(OPEN_METEO_AIR);
  airUrl.searchParams.set("latitude", String(location.latitude));
  airUrl.searchParams.set("longitude", String(location.longitude));
  airUrl.searchParams.set("current", "us_aqi,european_aqi,pm2_5,pm10,ozone");
  airUrl.searchParams.set("timezone", location.timezone || "auto");

  const air = await fetchJson<{ current?: AirQuality }>(airUrl.toString(), signal);
  return air.current;
}

function localWeatherCacheKey(location: CityLocation) {
  return `${LOCAL_WEATHER_CACHE_PREFIX}:${location.id}:${location.latitude.toFixed(3)}:${location.longitude.toFixed(3)}`;
}

function readLocalWeatherCache(location: CityLocation, maxAgeMs: number) {
  try {
    const raw = localStorage.getItem(localWeatherCacheKey(location));
    if (!raw) return undefined;
    const cached = JSON.parse(raw) as { fetchedAt: number; weather: LocalWeather };
    if (!cached.weather || Date.now() - cached.fetchedAt > maxAgeMs) return undefined;
    return cached.weather;
  } catch {
    return undefined;
  }
}

function writeLocalWeatherCache(location: CityLocation, weather: LocalWeather) {
  try {
    localStorage.setItem(localWeatherCacheKey(location), JSON.stringify({ fetchedAt: Date.now(), weather }));
  } catch {
    // A cached local forecast keeps the panel useful during provider rate limits.
  }
}

function providerCooldownKey(provider: string) {
  return `${PROVIDER_COOLDOWN_PREFIX}:${provider}`;
}

function providerInCooldown(provider: string) {
  try {
    const retryAt = Number(localStorage.getItem(providerCooldownKey(provider)));
    if (!Number.isFinite(retryAt) || retryAt <= Date.now()) {
      clearProviderCooldown(provider);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function setProviderCooldown(provider: string, durationMs: number) {
  try {
    localStorage.setItem(providerCooldownKey(provider), String(Date.now() + durationMs));
  } catch {
    // Cooldown state is a best-effort guard against repeated 429s.
  }
}

function clearProviderCooldown(provider: string) {
  try {
    localStorage.removeItem(providerCooldownKey(provider));
  } catch {
    // Ignore storage failures; the next request can still proceed normally.
  }
}

function shouldCooldownProvider(error: unknown) {
  if (error instanceof WeatherRequestError) return error.status === 429 || error.status === 403;
  return error instanceof Error && (
    /\b(?:400|403|429)\b/.test(error.message) ||
    /forbidden|rate limit|too many requests|daily api request limit/i.test(error.message)
  );
}

interface MetNorwayForecast {
  properties?: {
    timeseries?: Array<{
      time: string;
      data?: {
        instant?: {
          details?: {
            air_temperature?: number;
            relative_humidity?: number;
            wind_speed?: number;
            wind_speed_of_gust?: number;
            wind_from_direction?: number;
            air_pressure_at_sea_level?: number;
            cloud_area_fraction?: number;
            fog_area_fraction?: number;
          };
        };
        next_1_hours?: {
          summary?: { symbol_code?: string };
          details?: { precipitation_amount?: number };
        };
      };
    }>;
  };
}

async function fetchMetNorwayLocalWeather(location: CityLocation, signal?: AbortSignal): Promise<LocalWeather> {
  const url = new URL("https://api.met.no/weatherapi/locationforecast/2.0/compact");
  url.searchParams.set("lat", location.latitude.toFixed(4));
  url.searchParams.set("lon", location.longitude.toFixed(4));

  const data = JSON.parse(await fetchText(url.toString(), signal, { preferBrowser: true })) as MetNorwayForecast;
  const timeseries = data.properties?.timeseries ?? [];
  const currentRow = timeseries[0];
  const currentDetails = currentRow?.data?.instant?.details;
  if (!currentRow || !currentDetails) {
    throw new Error("Unable to refresh local weather");
  }

  const currentCode = symbolCodeToWeatherCode(currentRow.data?.next_1_hours?.summary?.symbol_code);
  const currentPrecipitation = currentRow.data?.next_1_hours?.details?.precipitation_amount ?? 0;
  const currentTemperature = currentDetails.air_temperature ?? 0;
  const currentWind = msToKmh(currentDetails.wind_speed);
  const currentGust = msToKmh(currentDetails.wind_speed_of_gust ?? currentDetails.wind_speed);

  const hourlyRows = timeseries.slice(0, 48);
  const hourlyCodes = hourlyRows.map((row) => symbolCodeToWeatherCode(row.data?.next_1_hours?.summary?.symbol_code));

  return {
    fetchedAt: new Date().toISOString(),
    current: {
      time: currentRow.time,
      temperature_2m: currentTemperature,
      apparent_temperature: currentTemperature,
      relative_humidity_2m: currentDetails.relative_humidity ?? 0,
      precipitation: currentPrecipitation,
      rain: currentPrecipitation,
      showers: 0,
      snowfall: isSnowCode(currentCode) ? currentPrecipitation : 0,
      weather_code: currentCode,
      cloud_cover: currentDetails.cloud_area_fraction ?? 0,
      pressure_msl: currentDetails.air_pressure_at_sea_level ?? 0,
      wind_speed_10m: currentWind,
      wind_gusts_10m: currentGust,
      wind_direction_10m: currentDetails.wind_from_direction ?? 0,
      visibility: (currentDetails.fog_area_fraction ?? 0) > 60 ? 1000 : 10000,
      uv_index: 0
    },
    hourly: {
      time: hourlyRows.map((row) => row.time),
      temperature_2m: hourlyRows.map((row) => row.data?.instant?.details?.air_temperature ?? currentTemperature),
      precipitation_probability: hourlyRows.map((row) => (row.data?.next_1_hours?.details?.precipitation_amount ?? 0) > 0 ? 70 : 0),
      precipitation: hourlyRows.map((row) => row.data?.next_1_hours?.details?.precipitation_amount ?? 0),
      weather_code: hourlyCodes,
      wind_gusts_10m: hourlyRows.map((row) => {
        const details = row.data?.instant?.details;
        return msToKmh(details?.wind_speed_of_gust ?? details?.wind_speed);
      }),
      uv_index: hourlyRows.map(() => 0)
    },
    airQuality: undefined
  };
}

function msToKmh(value?: number) {
  return Math.round((value ?? 0) * 3.6);
}

function symbolCodeToWeatherCode(symbol?: string) {
  const code = (symbol ?? "").toLowerCase();
  if (code.includes("thunder")) return 95;
  if (code.includes("fog")) return 45;
  if (code.includes("heavyrain")) return 65;
  if (code.includes("rainshowers")) return 80;
  if (code.includes("lightrain")) return 51;
  if (code.includes("rain")) return 61;
  if (code.includes("heavysnow")) return 75;
  if (code.includes("snowshowers")) return 85;
  if (code.includes("lightsnow")) return 71;
  if (code.includes("snow")) return 73;
  if (code.includes("sleet")) return 85;
  if (code.includes("cloudy")) return code.includes("partly") ? 2 : 3;
  if (code.includes("fair")) return 1;
  if (code.includes("clear")) return 0;
  return 3;
}

function isSnowCode(code: number) {
  return [71, 73, 75, 77, 85, 86].includes(code);
}

type WeatherGridCoordinate = { lat: number; lon: number };

function makeGrid(options: { bounds?: AviationBounds; step?: number; maxPoints?: number } = {}): WeatherGridCoordinate[] {
  if (options.bounds) return makeBoundedGrid(options.bounds, options.step ?? 2.5, options.maxPoints ?? 220);

  return makeGlobalGrid();
}

function makeGlobalGrid(): WeatherGridCoordinate[] {
  const points: WeatherGridCoordinate[] = [];
  for (let lat = -80; lat <= 80; lat += 20) {
    for (let lon = -180; lon < 180; lon += 20) {
      points.push({ lat, lon });
    }
  }
  return points;
}

function makeBoundedGrid(bounds: AviationBounds, requestedStep: number, maxPoints: number): WeatherGridCoordinate[] {
  const normalized = normalizedWeatherBounds(bounds);
  if (!normalized) return makeGlobalGrid();

  let step = requestedStep;
  let points = boundedGridPoints(normalized, step);
  while (points.length > maxPoints && step < 10) {
    step = nextWeatherGridStep(step);
    points = boundedGridPoints(normalized, step);
  }
  return points;
}

function nextWeatherGridStep(currentStep: number) {
  const steps = [0.25, 0.5, 1, 2.5, 5, 7.5, 10];
  return steps.find((step) => step > currentStep + 0.001) ?? Math.min(10, currentStep * 2);
}

function normalizedWeatherBounds(bounds?: AviationBounds): AviationBounds | undefined {
  if (!bounds) return undefined;
  const south = Math.max(-80, Math.min(80, Math.min(bounds.south, bounds.north)));
  const north = Math.max(-80, Math.min(80, Math.max(bounds.south, bounds.north)));
  if (north - south < 0.05) return undefined;

  const rawSpan = Math.abs(bounds.east - bounds.west);
  if (rawSpan >= 330) return undefined;

  return {
    south,
    north,
    west: normalizeApiLongitude(bounds.west),
    east: normalizeApiLongitude(bounds.east)
  };
}

function boundedGridPoints(bounds: AviationBounds, step: number): WeatherGridCoordinate[] {
  const points: WeatherGridCoordinate[] = [];
  const south = Math.max(-80, Math.floor((bounds.south - step) / step) * step);
  const north = Math.min(80, Math.ceil((bounds.north + step) / step) * step);
  const west = bounds.west;
  const east = bounds.east < bounds.west ? bounds.east + 360 : bounds.east;
  const startLon = Math.floor((west - step) / step) * step;
  const endLon = Math.ceil((east + step) / step) * step;

  for (let lat = south; lat <= north + step * 0.25; lat += step) {
    for (let lon = startLon; lon <= endLon + step * 0.25; lon += step) {
      points.push({ lat: roundCoordinate(lat), lon: roundCoordinate(normalizeApiLongitude(lon)) });
    }
  }

  return points;
}

function roundCoordinate(value: number) {
  return Math.round(value * 1000) / 1000;
}

export interface WeatherGridFetchResult {
  points: WeatherGridPoint[];
  fromCache: boolean;
  stale: boolean;
  fetchedAt: number;
}

export async function fetchWeatherGridWithMeta(
  signal?: AbortSignal,
  options: { freshMs?: number; forecastHourOffset?: number; bounds?: AviationBounds; step?: number; maxPoints?: number } = {}
): Promise<WeatherGridFetchResult> {
  const forecastHourOffset = Math.max(0, Math.round(options.forecastHourOffset ?? 0));
  const freshCache = readWeatherGridCache(options.freshMs ?? WEATHER_GRID_FRESH_MS, forecastHourOffset, options);
  if (freshCache) {
    return {
      points: freshCache,
      fromCache: true,
      stale: false,
      fetchedAt: Date.now()
    };
  }

  if (providerInCooldown(WEATHER_GRID_PROVIDER)) {
    const staleCache = readWeatherGridCache(WEATHER_GRID_STALE_MS, forecastHourOffset, options);
    if (staleCache) {
      return {
        points: staleCache,
        fromCache: true,
        stale: true,
        fetchedAt: Date.now()
      };
    }
    throw new Error("Weather forecast provider is cooling down after a recent request failure");
  }

  const grid = makeGrid(options);
  const batchSize = forecastHourOffset > 0 ? 25 : 100;
  const result: WeatherGridPoint[] = [];

  try {
    for (let index = 0; index < grid.length; index += batchSize) {
      const batch = grid.slice(index, index + batchSize);
      const url = new URL(OPEN_METEO_FORECAST);
      url.searchParams.set("latitude", batch.map((point) => point.lat).join(","));
      url.searchParams.set("longitude", batch.map((point) => point.lon).join(","));
      url.searchParams.set("timezone", "UTC");

      if (forecastHourOffset <= 0) {
        url.searchParams.set(
          "current",
          [
            "temperature_2m",
            "weather_code",
            "wind_speed_10m",
            "wind_gusts_10m",
            "wind_direction_10m",
            "precipitation",
            "pressure_msl",
            "cloud_cover"
          ].join(",")
        );
        url.searchParams.set("forecast_days", "1");
      } else {
        url.searchParams.set(
          "hourly",
          [
            "temperature_2m",
            "weather_code",
            "wind_speed_10m",
            "wind_gusts_10m",
            "wind_direction_10m",
            "precipitation",
            "rain",
            "showers",
            "precipitation_probability",
            "pressure_msl",
            "cloud_cover"
          ].join(",")
        );
        url.searchParams.set("forecast_days", String(Math.min(7, Math.max(1, Math.ceil((forecastHourOffset + 6) / 24)))));
        url.searchParams.set("forecast_hours", String(Math.max(2, forecastHourOffset + 3)));
      }

      const data = await fetchJson<
        Array<{
          latitude: number;
          longitude: number;
          current?: Record<string, number>;
          hourly?: Record<string, Array<number | string>>;
        }>
      >(url.toString(), signal);
      const rows = Array.isArray(data) ? data : [data];

      rows.forEach((row, rowIndex) => {
        const source = batch[rowIndex] ?? { lat: row.latitude, lon: row.longitude };
        const sample = forecastHourOffset <= 0 ? row.current : forecastGridSample(row.hourly, forecastHourOffset);
        if (!sample) return;
        result.push({
          id: `${source.lat}:${source.lon}:${forecastHourOffset}`,
          lat: source.lat,
          lon: source.lon,
          time: typeof sample.time === "string" ? sample.time : undefined,
          temperature: numberValue(sample.temperature_2m) ?? 0,
          weatherCode: numberValue(sample.weather_code) ?? 0,
          windSpeed: numberValue(sample.wind_speed_10m) ?? 0,
          windGust: numberValue(sample.wind_gusts_10m) ?? 0,
          windDirection: numberValue(sample.wind_direction_10m) ?? 0,
          precipitation: numberValue(sample.precipitation) ?? 0,
          precipitationProbability: numberValue(sample.precipitation_probability),
          pressure: numberValue(sample.pressure_msl) ?? 0,
          cloudCover: numberValue(sample.cloud_cover) ?? 0
        });
      });
    }

    writeWeatherGridCache(result, forecastHourOffset, options);
    return {
      points: result,
      fromCache: false,
      stale: false,
      fetchedAt: Date.now()
    };
  } catch (err) {
    if (shouldCooldownProvider(err)) setProviderCooldown(WEATHER_GRID_PROVIDER, WEATHER_GRID_FAILURE_COOLDOWN_MS);
    const staleCache = readWeatherGridCache(WEATHER_GRID_STALE_MS, forecastHourOffset, options);
    if (staleCache) {
      return {
        points: staleCache,
        fromCache: true,
        stale: true,
        fetchedAt: Date.now()
      };
    }
    throw err;
  }
}

export async function fetchWeatherGrid(
  signal?: AbortSignal,
  options: { freshMs?: number; forecastHourOffset?: number; bounds?: AviationBounds; step?: number; maxPoints?: number } = {}
): Promise<WeatherGridPoint[]> {
  return (await fetchWeatherGridWithMeta(signal, options)).points;
}

export function getCachedWeatherGrid(options: { maxAgeMs?: number; forecastHourOffset?: number; bounds?: AviationBounds; step?: number; maxPoints?: number } = {}) {
  const forecastHourOffset = Math.max(0, Math.round(options.forecastHourOffset ?? 0));
  return readWeatherGridCache(options.maxAgeMs ?? WEATHER_GRID_STALE_MS, forecastHourOffset, options);
}

function forecastGridSample(hourly: Record<string, Array<number | string>> | undefined, forecastHourOffset: number) {
  const times = hourly?.time;
  if (!hourly || !Array.isArray(times) || times.length === 0) return undefined;

  const target = Date.now() + forecastHourOffset * 60 * 60 * 1000;
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  times.forEach((time, index) => {
    const parsed = typeof time === "string" ? Date.parse(time.endsWith("Z") ? time : `${time}Z`) : Number.NaN;
    const distance = Math.abs(parsed - target);
    if (Number.isFinite(distance) && distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });

  return Object.fromEntries(Object.entries(hourly).map(([key, values]) => [key, values[bestIndex]])) as Record<string, number | string>;
}

function weatherGridCacheKey(forecastHourOffset: number, options: { bounds?: AviationBounds; step?: number; maxPoints?: number } = {}) {
  const bounds = normalizedWeatherBounds(options.bounds);
  if (!bounds) return `${WEATHER_GRID_CACHE_KEY}:global:${forecastHourOffset}`;
  const step = options.step ?? 2.5;
  const maxPoints = options.maxPoints ?? 220;
  return [
    WEATHER_GRID_CACHE_KEY,
    "viewport",
    forecastHourOffset,
    step.toFixed(2),
    maxPoints,
    bounds.south.toFixed(2),
    bounds.west.toFixed(2),
    bounds.north.toFixed(2),
    bounds.east.toFixed(2)
  ].join(":");
}

function readWeatherGridCache(maxAgeMs: number, forecastHourOffset = 0, options: { bounds?: AviationBounds; step?: number; maxPoints?: number } = {}) {
  try {
    const raw = localStorage.getItem(weatherGridCacheKey(forecastHourOffset, options));
    if (!raw) return undefined;
    const cached = JSON.parse(raw) as { fetchedAt: number; points: WeatherGridPoint[] };
    if (!Array.isArray(cached.points) || Date.now() - cached.fetchedAt > maxAgeMs) return undefined;
    return cached.points;
  } catch {
    return undefined;
  }
}

function writeWeatherGridCache(points: WeatherGridPoint[], forecastHourOffset = 0, options: { bounds?: AviationBounds; step?: number; maxPoints?: number } = {}) {
  try {
    localStorage.setItem(weatherGridCacheKey(forecastHourOffset, options), JSON.stringify({ fetchedAt: Date.now(), points }));
  } catch {
    // Cache is only a resilience layer for provider rate limits.
  }
}

function readRetainedEvents<T>(cacheKey: string) {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return undefined;
    const cached = JSON.parse(raw) as { fetchedAt: number; events: T[] };
    if (!Array.isArray(cached.events) || Date.now() - cached.fetchedAt > EVENT_RETENTION_MS) return undefined;
    return cached;
  } catch {
    return undefined;
  }
}

function writeRetainedEvents<T>(cacheKey: string, events: T[]) {
  try {
    localStorage.setItem(cacheKey, JSON.stringify({ fetchedAt: Date.now(), events }));
  } catch {
    // Retained event history is useful, but should never block live updates.
  }
}

function retainRecentEvents<T>(
  events: T[],
  eventTime: (event: T) => number | undefined,
  fallbackTime = Date.now()
) {
  const now = Date.now();
  return events.filter((event) => {
    const time = eventTime(event);
    const effectiveTime = time !== undefined && Number.isFinite(time) && time > 0 ? time : fallbackTime;
    return now - effectiveTime <= EVENT_RETENTION_MS;
  });
}

export async function fetchAircraftStates(
  bounds?: AviationBounds,
  signal?: AbortSignal,
  options: { freshMs?: number } = {}
): Promise<AircraftState[]> {
  const cacheKey = aircraftCacheKey(bounds);
  const freshCache = readAircraftCache(cacheKey, options.freshMs ?? AIRCRAFT_FRESH_MS);
  if (freshCache?.aircraft.length) return freshCache.aircraft;

  if (providerInCooldown(AIRCRAFT_PROVIDER)) {
    const fallbackAircraft = await fetchAdsbLolAircraft(bounds, signal).catch(() => []);
    if (fallbackAircraft.length > 0) {
      writeAircraftCache(cacheKey, fallbackAircraft);
      return fallbackAircraft;
    }
    const staleCache = readAircraftCache(cacheKey, AIRCRAFT_STALE_MS);
    if (staleCache?.aircraft.length) return staleCache.aircraft;
    throw new Error("Aircraft provider is cooling down after a recent request failure");
  }

  try {
    const urls = openskyStateUrls(bounds);
    const responses = await Promise.allSettled(urls.map((url) => fetchText(url, signal)));
    const rejected = responses.filter((response) => response.status === "rejected");
    const aircraft = dedupeAircraft(
      responses.flatMap((response) => response.status === "fulfilled" ? parseOpenSkyStates(response.value) : [])
    ).sort((left, right) => right.lastContact - left.lastContact);

    if (rejected.length === responses.length || (aircraft.length === 0 && rejected.length > 0)) {
      throw rejected[0]?.reason ?? new Error("Aircraft provider request failed");
    }

    writeAircraftCache(cacheKey, aircraft);
    clearProviderCooldown(AIRCRAFT_PROVIDER);
    return aircraft;
  } catch (err) {
    if (shouldCooldownProvider(err)) setProviderCooldown(AIRCRAFT_PROVIDER, AIRCRAFT_FAILURE_COOLDOWN_MS);
    const fallbackAircraft = await fetchAdsbLolAircraft(bounds, signal).catch(() => []);
    if (fallbackAircraft.length > 0) {
      writeAircraftCache(cacheKey, fallbackAircraft);
      return fallbackAircraft;
    }
    const staleCache = readAircraftCache(cacheKey, AIRCRAFT_STALE_MS);
    if (staleCache?.aircraft.length) return staleCache.aircraft;
    throw err;
  }
}

export function getCachedAircraftStates(bounds?: AviationBounds, maxAgeMs = AIRCRAFT_STALE_MS): AircraftState[] {
  return readAircraftCache(aircraftCacheKey(bounds), maxAgeMs)?.aircraft ?? [];
}

export async function fetchAircraftStatesByIds(
  aircraftIds: string[],
  signal?: AbortSignal,
  options: { freshMs?: number } = {}
): Promise<AircraftState[]> {
  const normalizedIds = Array.from(new Set(aircraftIds.map((id) => id.toLowerCase()).filter(Boolean))).slice(0, 12);
  if (normalizedIds.length === 0) return [];

  const cacheKey = `${AIRCRAFT_CACHE_PREFIX}:tracked:${normalizedIds.sort().join(",")}`;
  const freshCache = readAircraftCache(cacheKey, options.freshMs ?? AIRCRAFT_FRESH_MS);
  if (freshCache) return freshCache.aircraft;

  if (providerInCooldown(AIRCRAFT_PROVIDER)) {
    const staleCache = readAircraftCache(cacheKey, AIRCRAFT_STALE_MS);
    if (staleCache) return staleCache.aircraft;
    return [];
  }

  try {
    const aircraft = dedupeAircraft(parseOpenSkyStates(await fetchText(openSkyTrackedStateUrl(normalizedIds), signal), { includeGround: true }))
      .sort((left, right) => right.lastContact - left.lastContact)
      .slice(0, normalizedIds.length);
    writeAircraftCache(cacheKey, aircraft);
    clearProviderCooldown(AIRCRAFT_PROVIDER);
    return aircraft;
  } catch (err) {
    if (shouldCooldownProvider(err)) setProviderCooldown(AIRCRAFT_PROVIDER, AIRCRAFT_FAILURE_COOLDOWN_MS);
    const staleCache = readAircraftCache(cacheKey, AIRCRAFT_STALE_MS);
    if (staleCache) return staleCache.aircraft;
    return [];
  }
}

function readAircraftCache(cacheKey: string, maxAgeMs: number) {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return undefined;
    const cached = JSON.parse(raw) as { fetchedAt: number; aircraft: AircraftState[] };
    if (!Array.isArray(cached.aircraft) || Date.now() - cached.fetchedAt > maxAgeMs) return undefined;
    return cached;
  } catch {
    return undefined;
  }
}

function writeAircraftCache(cacheKey: string, aircraft: AircraftState[]) {
  try {
    localStorage.setItem(cacheKey, JSON.stringify({ fetchedAt: Date.now(), aircraft }));
  } catch {
    // Flight data updates frequently; cache is best-effort only.
  }
}

function aircraftCacheKey(bounds?: AviationBounds) {
  const normalized = normalizedAviationBounds(bounds);
  if (!normalized) return `${AIRCRAFT_CACHE_PREFIX}:global`;
  return [
    AIRCRAFT_CACHE_PREFIX,
    normalized.south.toFixed(1),
    normalized.west.toFixed(1),
    normalized.north.toFixed(1),
    normalized.east.toFixed(1)
  ].join(":");
}

function openskyStateUrls(bounds?: AviationBounds) {
  const normalized = normalizedAviationBounds(bounds);
  if (!normalized) return [openSkyStateUrl()];

  if (normalized.west <= normalized.east) {
    return [openSkyStateUrl(normalized)];
  }

  return [
    openSkyStateUrl({ ...normalized, east: 180 }),
    openSkyStateUrl({ ...normalized, west: -180 })
  ];
}

function openSkyStateUrl(bounds?: AviationBounds) {
  const url = new URL(OPENSKY_STATES);
  url.searchParams.set("extended", "1");
  if (bounds) {
    url.searchParams.set("lamin", bounds.south.toFixed(4));
    url.searchParams.set("lomin", bounds.west.toFixed(4));
    url.searchParams.set("lamax", bounds.north.toFixed(4));
    url.searchParams.set("lomax", bounds.east.toFixed(4));
  }
  return url.toString();
}

function openSkyTrackedStateUrl(aircraftIds: string[]) {
  const url = new URL(OPENSKY_STATES);
  url.searchParams.set("extended", "1");
  aircraftIds.forEach((id) => url.searchParams.append("icao24", id));
  return url.toString();
}

async function fetchAdsbLolAircraft(bounds?: AviationBounds, signal?: AbortSignal) {
  const queries = adsbLolQueries(bounds);
  if (queries.length === 0) return [];

  const responses = await Promise.allSettled(
    queries.map((query) => {
      const url = `${ADSB_LOL_AIRCRAFT}/${query.lat.toFixed(4)}/lon/${query.lon.toFixed(4)}/dist/${query.radiusKm}`;
      return withPromiseTimeout(
        withTimeoutSignal(signal, ADSB_LOL_QUERY_TIMEOUT_MS, (querySignal) =>
          fetchText(url, querySignal, { preferBrowser: true }).then((text) => parseAdsbLolAircraft(text, query.bounds))
        ),
        ADSB_LOL_QUERY_TIMEOUT_MS + 400
      );
    })
  );
  return dedupeAircraft(
    responses.flatMap((response) => response.status === "fulfilled" ? response.value : [])
  ).sort((left, right) => right.lastContact - left.lastContact);
}

function adsbLolQueries(bounds?: AviationBounds) {
  const normalized = normalizedAviationBounds(bounds);
  if (!normalized) return [];

  const west = normalized.west;
  const east = normalized.east < normalized.west ? normalized.east + 360 : normalized.east;
  const centerLat = Math.max(-80, Math.min(80, (normalized.south + normalized.north) / 2));
  const latKm = Math.max(1, (normalized.north - normalized.south) * 111);
  const lonKm = Math.max(1, (east - west) * 111 * Math.max(0.25, Math.cos((centerLat * Math.PI) / 180)));
  let rows = Math.max(1, Math.ceil(latKm / (ADSB_LOL_FALLBACK_RADIUS_KM * 1.55)));
  let cols = Math.max(1, Math.ceil(lonKm / (ADSB_LOL_FALLBACK_RADIUS_KM * 1.55)));

  while (rows * cols > ADSB_LOL_MAX_FALLBACK_QUERIES) {
    if (cols >= rows && cols > 1) {
      cols -= 1;
    } else if (rows > 1) {
      rows -= 1;
    } else {
      break;
    }
  }

  const queries: Array<{ lat: number; lon: number; radiusKm: number; bounds: AviationBounds }> = [];
  for (let row = 0; row < rows; row += 1) {
    const cellSouth = normalized.south + ((normalized.north - normalized.south) * row) / rows;
    const cellNorth = normalized.south + ((normalized.north - normalized.south) * (row + 1)) / rows;
    const lat = (cellSouth + cellNorth) / 2;
    for (let col = 0; col < cols; col += 1) {
      const cellWest = west + ((east - west) * col) / cols;
      const cellEast = west + ((east - west) * (col + 1)) / cols;
      const lon = normalizeApiLongitude((cellWest + cellEast) / 2);
      const corners = [
        [cellSouth, normalizeApiLongitude(cellWest)],
        [cellSouth, normalizeApiLongitude(cellEast)],
        [cellNorth, normalizeApiLongitude(cellWest)],
        [cellNorth, normalizeApiLongitude(cellEast)]
      ] as const;
      const radiusKm = Math.round(Math.min(ADSB_LOL_FALLBACK_RADIUS_KM, Math.max(35, ...corners.map(([cornerLat, cornerLon]) => distanceKm(lat, lon, cornerLat, cornerLon)))));
      queries.push({ lat, lon, radiusKm, bounds: normalized });
    }
  }

  return queries;
}

function parseAdsbLolAircraft(text: string, bounds?: AviationBounds): AircraftState[] {
  const payload = JSON.parse(text) as { ac?: Array<Record<string, unknown>>; now?: number };
  const now = typeof payload.now === "number" ? payload.now : Date.now();
  return (payload.ac ?? [])
    .map((row): AircraftState | undefined => {
      const id = stringValue(row.hex)?.toLowerCase();
      const lat = numberValue(row.lat);
      const lon = numberValue(row.lon);
      if (!id || lat === undefined || lon === undefined) return undefined;
      if (bounds && !pointInAviationBounds(lat, lon, bounds)) return undefined;

      const seenSeconds = numberValue(row.seen_pos) ?? numberValue(row.seen) ?? 0;
      const lastContact = now - seenSeconds * 1000;
      if (Date.now() - lastContact > 5 * 60 * 1000) return undefined;

      const baroAltitude = row.alt_baro === "ground" ? undefined : feetToMeters(numberValue(row.alt_baro));
      const geomAltitude = feetToMeters(numberValue(row.alt_geom));
      const groundSpeed = numberValue(row.gs);
      const categoryCode = stringValue(row.category);
      const registration = stringValue(row.r);
      const aircraftType = stringValue(row.t)?.toUpperCase();
      const aircraftDescription = aircraftDescriptionLabel(stringValue(row.desc));
      const callsign = stringValue(row.flight) || registration || undefined;
      return {
        id,
        callsign,
        registration,
        originCountry: inferredAircraftOriginCountry(registration, id),
        operator: aircraftOperatorLabel(row, callsign),
        aircraftType,
        aircraftModel: aircraftDescription ?? aircraftModelLabel(aircraftType),
        lat,
        lon,
        altitude: baroAltitude,
        geoAltitude: geomAltitude,
        velocity: groundSpeed !== undefined ? Math.round(groundSpeed * 1.852) : undefined,
        heading: numberValue(row.track) ?? numberValue(row.true_heading) ?? undefined,
        verticalRate: feetPerMinuteToMetersPerSecond(numberValue(row.baro_rate) ?? numberValue(row.geom_rate)),
        onGround: row.alt_baro === "ground",
        squawk: stringValue(row.squawk) || undefined,
        categoryLabel: adsbLolCategoryLabel(categoryCode),
        lastContact,
        sourceLabel: "ADSB.lol"
      };
    })
    .filter(isDefined);
}

function pointInAviationBounds(lat: number, lon: number, bounds: AviationBounds) {
  if (lat < bounds.south || lat > bounds.north) return false;
  const normalizedLon = normalizeApiLongitude(lon);
  if (bounds.west <= bounds.east) return normalizedLon >= bounds.west && normalizedLon <= bounds.east;
  return normalizedLon >= bounds.west || normalizedLon <= bounds.east;
}

function feetToMeters(value?: number) {
  return value !== undefined ? Math.round(value * 0.3048) : undefined;
}

function feetPerMinuteToMetersPerSecond(value?: number) {
  return value !== undefined ? value * 0.00508 : undefined;
}

const AIRCRAFT_TYPE_LABELS: Record<string, string> = {
  A318: "Airbus A318",
  A319: "Airbus A319",
  A320: "Airbus A320",
  A321: "Airbus A321",
  A19N: "Airbus A319neo",
  A20N: "Airbus A320neo",
  A21N: "Airbus A321neo",
  A332: "Airbus A330-200",
  A333: "Airbus A330-300",
  A339: "Airbus A330-900neo",
  A343: "Airbus A340-300",
  A359: "Airbus A350-900",
  A35K: "Airbus A350-1000",
  A388: "Airbus A380-800",
  B733: "Boeing 737-300",
  B734: "Boeing 737-400",
  B735: "Boeing 737-500",
  B736: "Boeing 737-600",
  B737: "Boeing 737-700",
  B738: "Boeing 737-800",
  B739: "Boeing 737-900",
  B37M: "Boeing 737 MAX 7",
  B38M: "Boeing 737 MAX 8",
  B39M: "Boeing 737 MAX 9",
  B3XM: "Boeing 737 MAX 10",
  B744: "Boeing 747-400",
  B748: "Boeing 747-8",
  B752: "Boeing 757-200",
  B753: "Boeing 757-300",
  B762: "Boeing 767-200",
  B763: "Boeing 767-300",
  B764: "Boeing 767-400",
  B772: "Boeing 777-200",
  B77L: "Boeing 777-200LR",
  B773: "Boeing 777-300",
  B77W: "Boeing 777-300ER",
  B788: "Boeing 787-8",
  B789: "Boeing 787-9",
  B78X: "Boeing 787-10",
  BE20: "Beechcraft King Air 200",
  B200: "Beechcraft Super King Air 200",
  B350: "Beechcraft King Air 350",
  B190: "Beechcraft 1900",
  E170: "Embraer E170",
  E175: "Embraer E175",
  E190: "Embraer E190",
  E195: "Embraer E195",
  E290: "Embraer E190-E2",
  E295: "Embraer E195-E2",
  CRJ2: "Bombardier CRJ200",
  CRJ7: "Bombardier CRJ700",
  CRJ9: "Bombardier CRJ900",
  CRJX: "Bombardier CRJ1000",
  AT43: "ATR 42-300",
  AT45: "ATR 42-500",
  AT46: "ATR 42-600",
  AT72: "ATR 72",
  AT75: "ATR 72-500",
  AT76: "ATR 72-600",
  DH8A: "De Havilland Canada Dash 8-100",
  DH8B: "De Havilland Canada Dash 8-200",
  DH8C: "De Havilland Canada Dash 8-300",
  DH8D: "De Havilland Canada Dash 8 Q400",
  C172: "Cessna 172",
  C182: "Cessna 182",
  C208: "Cessna 208 Caravan",
  C510: "Cessna Citation Mustang",
  C525: "Cessna CitationJet",
  C56X: "Cessna Citation Excel",
  C680: "Cessna Citation Sovereign",
  C700: "Cessna Citation Longitude",
  PC12: "Pilatus PC-12",
  PA31: "Piper PA-31 Navajo",
  GLF4: "Gulfstream IV",
  GLF5: "Gulfstream V",
  GLF6: "Gulfstream G650",
  GLEX: "Bombardier Global Express",
  CL60: "Bombardier Challenger 600",
  C25A: "Cessna Citation CJ2",
  C25B: "Cessna Citation CJ3",
  C25C: "Cessna Citation CJ4"
};

const AIRCRAFT_REGISTRATION_COUNTRIES: Array<[string, string]> = [
  ["A4O-", "Oman"],
  ["A9C-", "Bahrain"],
  ["VP-B", "Bermuda"],
  ["VP-C", "Cayman Islands"],
  ["VQ-B", "Bermuda"],
  ["3A-", "Monaco"],
  ["4K-", "Azerbaijan"],
  ["4L-", "Georgia"],
  ["4O-", "Montenegro"],
  ["4R-", "Sri Lanka"],
  ["4X-", "Israel"],
  ["5A-", "Libya"],
  ["5B-", "Cyprus"],
  ["5H-", "Tanzania"],
  ["5N-", "Nigeria"],
  ["5R-", "Madagascar"],
  ["5T-", "Mauritania"],
  ["5U-", "Niger"],
  ["5V-", "Togo"],
  ["5X-", "Uganda"],
  ["5Y-", "Kenya"],
  ["6O-", "Somalia"],
  ["6V-", "Senegal"],
  ["6Y-", "Jamaica"],
  ["7O-", "Yemen"],
  ["7P-", "Lesotho"],
  ["7Q-", "Malawi"],
  ["7T-", "Algeria"],
  ["8P-", "Barbados"],
  ["8Q-", "Maldives"],
  ["8R-", "Guyana"],
  ["9A-", "Croatia"],
  ["9G-", "Ghana"],
  ["9H-", "Malta"],
  ["9J-", "Zambia"],
  ["9K-", "Kuwait"],
  ["9L-", "Sierra Leone"],
  ["9M-", "Malaysia"],
  ["9N-", "Nepal"],
  ["9Q-", "Democratic Republic of the Congo"],
  ["9V-", "Singapore"],
  ["9Y-", "Trinidad and Tobago"],
  ["A2-", "Botswana"],
  ["A3-", "Tonga"],
  ["A5-", "Bhutan"],
  ["A6-", "United Arab Emirates"],
  ["A7-", "Qatar"],
  ["AP-", "Pakistan"],
  ["B-H", "Hong Kong"],
  ["B-K", "Hong Kong"],
  ["B-L", "Hong Kong"],
  ["B-M", "Macau"],
  ["C-F", "Canada"],
  ["C-G", "Canada"],
  ["C5-", "Gambia"],
  ["C6-", "Bahamas"],
  ["C9-", "Mozambique"],
  ["CC-", "Chile"],
  ["CN-", "Morocco"],
  ["CP-", "Bolivia"],
  ["CU-", "Cuba"],
  ["CX-", "Uruguay"],
  ["D2-", "Angola"],
  ["D4-", "Cape Verde"],
  ["D6-", "Comoros"],
  ["E3-", "Eritrea"],
  ["E5-", "Cook Islands"],
  ["E7-", "Bosnia and Herzegovina"],
  ["EC-", "Spain"],
  ["EI-", "Ireland"],
  ["EK-", "Armenia"],
  ["EP-", "Iran"],
  ["ER-", "Moldova"],
  ["ES-", "Estonia"],
  ["ET-", "Ethiopia"],
  ["EW-", "Belarus"],
  ["EX-", "Kyrgyzstan"],
  ["EY-", "Tajikistan"],
  ["EZ-", "Turkmenistan"],
  ["HC-", "Ecuador"],
  ["HH-", "Haiti"],
  ["HI-", "Dominican Republic"],
  ["HK-", "Colombia"],
  ["HL", "South Korea"],
  ["HP-", "Panama"],
  ["HS-", "Thailand"],
  ["HZ-", "Saudi Arabia"],
  ["JA", "Japan"],
  ["JY-", "Jordan"],
  ["LX-", "Luxembourg"],
  ["OD-", "Lebanon"],
  ["P2-", "Papua New Guinea"],
  ["P4-", "Aruba"],
  ["PJ-", "Curaçao"],
  ["PK-", "Indonesia"],
  ["PP-", "Brazil"],
  ["PR-", "Brazil"],
  ["PS-", "Brazil"],
  ["PT-", "Brazil"],
  ["PU-", "Brazil"],
  ["PZ-", "Suriname"],
  ["RA-", "Russia"],
  ["RF-", "Russia"],
  ["RP-", "Philippines"],
  ["S2-", "Bangladesh"],
  ["S5-", "Slovenia"],
  ["SE-", "Sweden"],
  ["SP-", "Poland"],
  ["SU-", "Egypt"],
  ["SX-", "Greece"],
  ["T7-", "San Marino"],
  ["TC-", "Turkey"],
  ["TG-", "Guatemala"],
  ["TI-", "Costa Rica"],
  ["TJ-", "Cameroon"],
  ["TR-", "Gabon"],
  ["TU-", "Cote d'Ivoire"],
  ["TZ-", "Mali"],
  ["UK-", "Uzbekistan"],
  ["UN-", "Kazakhstan"],
  ["UP-", "Kazakhstan"],
  ["UR-", "Ukraine"],
  ["VH-", "Australia"],
  ["VN-", "Nepal"],
  ["VT-", "India"],
  ["XA-", "Mexico"],
  ["XB-", "Mexico"],
  ["XC-", "Mexico"],
  ["YI-", "Iraq"],
  ["YK-", "Syria"],
  ["YL-", "Latvia"],
  ["YN-", "Nicaragua"],
  ["YR-", "Romania"],
  ["YS-", "El Salvador"],
  ["YU-", "Serbia"],
  ["YV-", "Venezuela"],
  ["Z3-", "North Macedonia"],
  ["ZA-", "Albania"],
  ["ZK-", "New Zealand"],
  ["ZP-", "Paraguay"],
  ["ZS-", "South Africa"],
  ["ZT-", "South Africa"],
  ["ZU-", "South Africa"],
  ["LN-", "Norway"],
  ["OY-", "Denmark"],
  ["OH-", "Finland"],
  ["TF-", "Iceland"],
  ["LY-", "Lithuania"],
  ["G-", "United Kingdom"],
  ["D-", "Germany"],
  ["F-", "France"],
  ["I-", "Italy"],
  ["PH-", "Netherlands"],
  ["OO-", "Belgium"],
  ["HB-", "Switzerland"],
  ["OE-", "Austria"],
  ["CS-", "Portugal"],
  ["OK-", "Czechia"],
  ["OM-", "Slovakia"],
  ["HA-", "Hungary"],
  ["LZ-", "Bulgaria"],
  ["LV-", "Argentina"],
  ["OB-", "Peru"],
  ["B-", "China"],
  ["B", "China"]
];

const AIRCRAFT_ICAO_COUNTRY_RANGES: Array<[number, number, string]> = [
  [0x0a0000, 0x0a7fff, "South Africa"],
  [0x140000, 0x1fffff, "Russia"],
  [0x300000, 0x33ffff, "Italy"],
  [0x340000, 0x37ffff, "Spain"],
  [0x380000, 0x3bffff, "France"],
  [0x3c0000, 0x3fffff, "Germany"],
  [0x400000, 0x43ffff, "United Kingdom"],
  [0x440000, 0x447fff, "Austria"],
  [0x448000, 0x44ffff, "Belgium"],
  [0x450000, 0x457fff, "Bulgaria"],
  [0x458000, 0x45ffff, "Denmark"],
  [0x460000, 0x467fff, "Finland"],
  [0x468000, 0x46ffff, "Greece"],
  [0x470000, 0x477fff, "Hungary"],
  [0x478000, 0x47ffff, "Norway"],
  [0x480000, 0x487fff, "Netherlands"],
  [0x488000, 0x48ffff, "Poland"],
  [0x490000, 0x497fff, "Portugal"],
  [0x498000, 0x49ffff, "Czechia"],
  [0x4a0000, 0x4a7fff, "Romania"],
  [0x4a8000, 0x4affff, "Sweden"],
  [0x4b0000, 0x4b7fff, "Switzerland"],
  [0x4b8000, 0x4bffff, "Turkey"],
  [0x4ca000, 0x4cafff, "Ireland"],
  [0x4cc000, 0x4ccfff, "Iceland"],
  [0x4d2000, 0x4d3fff, "Malta"],
  [0x508000, 0x50ffff, "Ukraine"],
  [0x700000, 0x700fff, "Afghanistan"],
  [0x702000, 0x702fff, "Bangladesh"],
  [0x710000, 0x717fff, "Saudi Arabia"],
  [0x71ba00, 0x71bfff, "South Korea"],
  [0x720000, 0x727fff, "Yemen"],
  [0x730000, 0x737fff, "Iran"],
  [0x738000, 0x73ffff, "Israel"],
  [0x740000, 0x747fff, "Jordan"],
  [0x748000, 0x74ffff, "Lebanon"],
  [0x750000, 0x757fff, "Malaysia"],
  [0x758000, 0x75ffff, "Philippines"],
  [0x760000, 0x767fff, "Pakistan"],
  [0x768000, 0x76ffff, "Singapore"],
  [0x770000, 0x777fff, "Sri Lanka"],
  [0x780000, 0x7bffff, "China"],
  [0x7c0000, 0x7fffff, "Australia"],
  [0x800000, 0x83ffff, "India"],
  [0x840000, 0x87ffff, "Japan"],
  [0x880000, 0x887fff, "Thailand"],
  [0x888000, 0x88ffff, "Vietnam"],
  [0x896000, 0x896fff, "United Arab Emirates"],
  [0x899000, 0x899fff, "Taiwan"],
  [0x8a0000, 0x8affff, "Indonesia"],
  [0xa00000, 0xafffff, "United States"],
  [0xc00000, 0xc3ffff, "Canada"],
  [0xe00000, 0xe3ffff, "Argentina"],
  [0xe40000, 0xe7ffff, "Brazil"],
  [0xe80000, 0xebffff, "Chile"]
];

function aircraftModelLabel(type?: string) {
  const normalized = type?.trim().toUpperCase();
  if (!normalized) return undefined;
  return AIRCRAFT_TYPE_LABELS[normalized] ?? normalized;
}

function aircraftDescriptionLabel(description?: string) {
  if (!description || /^(n\/a|none|unknown|reserved)$/i.test(description)) return undefined;
  return description;
}

const AIRCRAFT_OPERATOR_PREFIXES: Record<string, string> = {
  AAL: "American Airlines",
  ACA: "Air Canada",
  AFR: "Air France",
  AFL: "Aeroflot",
  ANA: "All Nippon Airways",
  AUA: "Austrian Airlines",
  BAW: "British Airways",
  BCS: "European Air Transport Leipzig",
  BER: "Eurowings",
  CFG: "Condor",
  CPA: "Cathay Pacific",
  DAL: "Delta Air Lines",
  DLH: "Lufthansa",
  DFL: "Babcock Scandinavian AirAmbulance",
  EWG: "Eurowings",
  EZY: "easyJet",
  FIN: "Finnair",
  IBE: "Iberia",
  ICE: "Icelandair",
  KLM: "KLM Royal Dutch Airlines",
  LOT: "LOT Polish Airlines",
  NSZ: "Norwegian Air Sweden",
  NAX: "Norwegian Air Shuttle",
  PGT: "Pegasus Airlines",
  QFA: "Qantas",
  QTR: "Qatar Airways",
  RYR: "Ryanair",
  SAS: "Scandinavian Airlines",
  SDM: "Rossiya Airlines",
  SIA: "Singapore Airlines",
  SWR: "Swiss International Air Lines",
  TAY: "ASL Airlines Belgium",
  THY: "Turkish Airlines",
  UAE: "Emirates",
  UAL: "United Airlines",
  UPS: "UPS Airlines",
  WZZ: "Wizz Air"
};

function aircraftOperatorLabel(row: Record<string, unknown>, callsign?: string) {
  const directValue =
    stringValue(row.ownOp) ??
    stringValue(row.operator) ??
    stringValue(row.owner) ??
    stringValue(row.airline) ??
    stringValue(row.op);
  if (directValue && !/^(n\/a|none|unknown|reserved)$/i.test(directValue)) return directValue;
  return aircraftOperatorFromCallsign(callsign);
}

function aircraftOperatorFromCallsign(callsign?: string) {
  const prefix = callsign?.replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase();
  return prefix ? AIRCRAFT_OPERATOR_PREFIXES[prefix] : undefined;
}

function inferredAircraftOriginCountry(registration?: string, icaoHex?: string) {
  const normalizedRegistration = registration?.replace(/\s+/g, "").toUpperCase();
  if (normalizedRegistration) {
    if (/^N[0-9]/.test(normalizedRegistration)) return "United States";
    const match = AIRCRAFT_REGISTRATION_COUNTRIES.find(([prefix]) => normalizedRegistration.startsWith(prefix));
    if (match) return match[1];
  }

  const hex = icaoHex?.trim().toLowerCase();
  if (!hex || !/^[0-9a-f]{6}$/.test(hex)) return undefined;
  const value = Number.parseInt(hex, 16);
  return AIRCRAFT_ICAO_COUNTRY_RANGES.find(([start, end]) => value >= start && value <= end)?.[2];
}

function adsbLolCategoryLabel(category?: string) {
  if (!category) return undefined;
  const labels: Record<string, string> = {
    A1: "Light aircraft",
    A2: "Small aircraft",
    A3: "Large aircraft",
    A4: "High-vortex large",
    A5: "Heavy aircraft",
    A6: "High performance",
    A7: "Rotorcraft",
    B1: "Glider",
    B2: "Lighter-than-air",
    B3: "Parachutist",
    B4: "Ultralight",
    B6: "Unmanned aircraft"
  };
  return labels[category] ?? "Aircraft";
}

function normalizedAviationBounds(bounds?: AviationBounds): AviationBounds | undefined {
  if (!bounds) return undefined;
  const south = Math.max(-85, Math.min(85, Math.min(bounds.south, bounds.north)));
  const north = Math.max(-85, Math.min(85, Math.max(bounds.south, bounds.north)));
  if (north - south < 0.05) return undefined;

  const rawSpan = Math.abs(bounds.east - bounds.west);
  if (rawSpan >= 340) return undefined;

  return {
    south,
    north,
    west: normalizeApiLongitude(bounds.west),
    east: normalizeApiLongitude(bounds.east)
  };
}

function normalizeApiLongitude(longitude: number) {
  return ((longitude + 180) % 360 + 360) % 360 - 180;
}

function parseOpenSkyStates(text: string, options: { includeGround?: boolean } = {}): AircraftState[] {
  if (/too many requests|rate limit/i.test(text)) {
    throw new Error("Aircraft provider returned too many requests");
  }

  const payload = JSON.parse(text) as { states?: unknown[][] };
  const now = Date.now();
  return (payload.states ?? [])
    .map((row): AircraftState | undefined => {
      const id = stringValue(row[0])?.toLowerCase();
      const lat = numberValue(row[6]);
      const lon = numberValue(row[5]);
      const lastContactSeconds = numberValue(row[4]);
      const onGround = row[8] === true;
      if (!id || lat === undefined || lon === undefined || !lastContactSeconds || (!options.includeGround && onGround)) return undefined;

      const lastContact = lastContactSeconds * 1000;
      if (now - lastContact > 3 * 60 * 1000) return undefined;

      const category = numberValue(row[17]);
      return {
        id,
        callsign: stringValue(row[1]) || undefined,
        originCountry: stringValue(row[2]) || undefined,
        operator: aircraftOperatorFromCallsign(stringValue(row[1])),
        lat,
        lon,
        altitude: numberValue(row[7]) ?? undefined,
        velocity: numberValue(row[9]) !== undefined ? Math.round((numberValue(row[9]) ?? 0) * 3.6) : undefined,
        heading: numberValue(row[10]) ?? undefined,
        verticalRate: numberValue(row[11]) ?? undefined,
        onGround,
        geoAltitude: numberValue(row[13]) ?? undefined,
        squawk: stringValue(row[14]) || undefined,
        category,
        categoryLabel: aircraftCategoryLabel(category),
        lastContact,
        sourceLabel: "OpenSky"
      };
    })
    .filter(isDefined);
}

function dedupeAircraft(aircraft: AircraftState[]) {
  const seen = new Map<string, AircraftState>();
  aircraft.forEach((item) => {
    const existing = seen.get(item.id);
    if (!existing || item.lastContact > existing.lastContact) seen.set(item.id, item);
  });
  return Array.from(seen.values());
}

function aircraftCategoryLabel(category?: number) {
  const labels: Record<number, string> = {
    2: "Light aircraft",
    3: "Small aircraft",
    4: "Large aircraft",
    5: "High-vortex large",
    6: "Heavy aircraft",
    7: "High performance",
    8: "Rotorcraft",
    9: "Glider",
    10: "Lighter-than-air",
    11: "Parachutist",
    12: "Ultralight",
    14: "Unmanned aircraft"
  };
  return category !== undefined ? labels[category] ?? "Aircraft" : undefined;
}

export async function fetchAircraftTrack(
  aircraftId: string,
  signal?: AbortSignal,
  options: { freshMs?: number } = {}
): Promise<AircraftTrack | undefined> {
  const normalizedId = aircraftId.toLowerCase();
  const cacheKey = aircraftTrackCacheKey(normalizedId);
  const freshCache = readAircraftTrackCache(cacheKey, options.freshMs ?? AIRCRAFT_TRACK_FRESH_MS);
  if (freshCache) return freshCache.track;

  try {
    const url = new URL(OPENSKY_TRACKS);
    url.searchParams.set("icao24", normalizedId);
    url.searchParams.set("time", "0");

    const track = parseOpenSkyTrack(await fetchText(url.toString(), signal), normalizedId);
    writeAircraftTrackCache(cacheKey, track);
    return track;
  } catch (err) {
    const staleCache = readAircraftTrackCache(cacheKey, AIRCRAFT_TRACK_STALE_MS);
    if (staleCache) return staleCache.track;
    return undefined;
  }
}

function aircraftTrackCacheKey(aircraftId: string) {
  return `${AIRCRAFT_TRACK_CACHE_PREFIX}:${aircraftId}`;
}

function readAircraftTrackCache(cacheKey: string, maxAgeMs: number) {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return undefined;
    const cached = JSON.parse(raw) as { fetchedAt: number; track?: AircraftTrack };
    if (!cached.track || Date.now() - cached.fetchedAt > maxAgeMs) return undefined;
    return cached;
  } catch {
    return undefined;
  }
}

function writeAircraftTrackCache(cacheKey: string, track?: AircraftTrack) {
  try {
    localStorage.setItem(cacheKey, JSON.stringify({ fetchedAt: Date.now(), track }));
  } catch {
    // Track cache only avoids repeated per-aircraft requests.
  }
}

function parseOpenSkyTrack(text: string, aircraftId: string): AircraftTrack | undefined {
  const payload = JSON.parse(text) as {
    icao24?: string;
    callsign?: string | null;
    startTime?: number;
    endTime?: number;
    path?: unknown[][];
  };
  const path = (payload.path ?? [])
    .map((row): AircraftTrackPoint | undefined => {
      const timeSeconds = numberValue(row[0]);
      const lat = numberValue(row[1]);
      const lon = numberValue(row[2]);
      if (!timeSeconds || lat === undefined || lon === undefined) return undefined;
      return {
        time: timeSeconds * 1000,
        lat,
        lon,
        altitude: numberValue(row[3]) ?? undefined,
        heading: numberValue(row[4]) ?? undefined,
        onGround: typeof row[5] === "boolean" ? row[5] : undefined
      };
    })
    .filter(isDefined);

  if (path.length < 2) return undefined;

  return {
    aircraftId: (payload.icao24 ?? aircraftId).toLowerCase(),
    callsign: stringValue(payload.callsign) ?? undefined,
    startTime: payload.startTime ? payload.startTime * 1000 : undefined,
    endTime: payload.endTime ? payload.endTime * 1000 : undefined,
    path,
    sourceLabel: "OpenSky"
  };
}

export async function fetchAviationIncidents(signal?: AbortSignal, options: { freshMs?: number } = {}): Promise<AviationIncident[]> {
  const freshCache = readAviationIncidentsCache(options.freshMs ?? AVIATION_INCIDENTS_FRESH_MS);
  if (freshCache) return freshCache.incidents;

  try {
    const manifest = await fetchText(GDELT_LAST_UPDATE, signal);
    const gkgUrl = gdeltGkgUrl(manifest);
    if (!gkgUrl) throw new Error("GDELT GKG feed unavailable");

    const exportUrls = gdeltExportUrls(gkgUrl, 12);
    const exports = await Promise.allSettled(exportUrls.map((url) => fetchZipText(url)));
    const fetchedAt = new Date().toISOString();
    const fetchedIncidents = dedupeAviationIncidents(
      exports.flatMap((result, index) =>
        result.status === "fulfilled" ? parseGdeltAviationIncidents(result.value, exportUrls[index], fetchedAt) : []
      )
    )
      .sort((left, right) => right.time - left.time)
      .slice(0, 120);
    const retainedCache = readAviationIncidentsCache(EVENT_RETENTION_MS);
    const incidents = retainRecentEvents(
      dedupeAviationIncidents([...fetchedIncidents, ...(retainedCache?.incidents ?? [])]),
      (incident) => incident.time,
      retainedCache?.fetchedAt
    ).sort((left, right) => right.time - left.time);

    writeAviationIncidentsCache(incidents);
    return incidents;
  } catch (err) {
    const staleCache = readAviationIncidentsCache(AVIATION_INCIDENTS_STALE_MS);
    if (staleCache) return staleCache.incidents;
    throw err;
  }
}

function readAviationIncidentsCache(maxAgeMs: number) {
  try {
    const raw = localStorage.getItem(AVIATION_INCIDENTS_CACHE_KEY);
    if (!raw) return undefined;
    const cached = JSON.parse(raw) as { fetchedAt: number; incidents: AviationIncident[] };
    if (!Array.isArray(cached.incidents) || Date.now() - cached.fetchedAt > maxAgeMs) return undefined;
    const incidents = retainRecentEvents(cached.incidents, (incident) => incident.time, cached.fetchedAt)
      .sort((left, right) => right.time - left.time);
    return incidents.length > 0 ? { ...cached, incidents } : undefined;
  } catch {
    return undefined;
  }
}

function writeAviationIncidentsCache(incidents: AviationIncident[]) {
  try {
    localStorage.setItem(
      AVIATION_INCIDENTS_CACHE_KEY,
      JSON.stringify({ fetchedAt: Date.now(), incidents: retainRecentEvents(incidents, (incident) => incident.time) })
    );
  } catch {
    // Incident reports are useful if cached, but never required.
  }
}

function gdeltGkgUrl(manifest: string) {
  return manifest
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/)[2])
    .find((url) => url?.endsWith(".gkg.csv.zip"));
}

function parseGdeltAviationIncidents(text: string, exportUrl: string, fetchedAt: string): AviationIncident[] {
  return text
    .split(/\r?\n/)
    .flatMap((line): AviationIncident[] => {
      if (!line) return [];
      const columns = line.split("\t");
      if (columns.length < 9) return [];

      const sourceUrl = columns[4] || exportUrl;
      const sourceLabel = columns[3] || "GDELT";
      const themes = `${columns[6] ?? ""} ${columns[7] ?? ""}`;
      const names = columns[22] ?? "";
      if (!isAviationIncidentRecord(sourceUrl, themes, names)) return [];

      const locations = parseGdeltGkgLocations(`${columns[8] ?? ""};${columns[9] ?? ""}`);
      if (locations.length === 0) return [];

      const time = parseGdeltTimestamp(columns[1]) || Date.now();
      const title = aviationIncidentTitle(sourceUrl, names);
      const sourceDomain = gdeltSourceDomain(sourceUrl);

      return locations.slice(0, 2).map((location, index) => ({
        id: `gdelt-aviation-${columns[0]}-${index}`,
        title,
        summary: `${title} reported near ${location.place}.`,
        lat: location.lat,
        lon: location.lon,
        place: location.place,
        time,
        sourceUrl,
        sourceLabel,
        sourceDomain,
        confidence: "reported",
        fetchedAt
      }));
    });
}

function isAviationIncidentRecord(sourceUrl: string, themes: string, names: string) {
  const haystack = `${sourceUrl} ${themes} ${names}`.toLowerCase().replace(/[_-]+/g, " ");
  const aviation = /\b(aircraft|airplane|plane|aviation|airline|flight|helicopter|jet|air force|airport|runway)\b/.test(haystack);
  const incident = /\b(crash|crashes|crashed|accident|incident|collision|emergency landing|wreckage|fatal|downed|forced landing|runway excursion)\b/.test(haystack);
  return aviation && incident && !/\b(stock|market|share|shares|index|indexes|crypto)\b.{0,30}\bcrash/.test(haystack);
}

function parseGdeltGkgLocations(value: string) {
  const locations = value
    .split(";")
    .map((entry) => {
      const parts = entry.split("#");
      const lat = numberFromText(parts[4]);
      const lon = numberFromText(parts[5]);
      if (!parts[1] || lat === undefined || lon === undefined || (lat === 0 && lon === 0)) return undefined;
      return {
        type: Math.round(numberFromText(parts[0]) ?? 0),
        place: parts[1],
        lat,
        lon
      };
    })
    .filter(isDefined);

  return locations.sort((left, right) => gkgLocationScore(right.type) - gkgLocationScore(left.type));
}

function gkgLocationScore(type: number) {
  if (type === 3 || type === 4) return 4;
  if (type === 2 || type === 5) return 3;
  if (type === 1) return 1;
  return 2;
}

function aviationIncidentTitle(sourceUrl: string, names: string) {
  const primaryName = names
    .split(";")
    .map((entry) => entry.split(",")[0]?.trim())
    .find((name) => name && /\b(air|flight|plane|aircraft|helicopter|airport|runway|crash|accident)\b/i.test(name));
  if (primaryName) return primaryName;

  try {
    const url = new URL(sourceUrl);
    const slug = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "");
    const cleaned = slug
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned.length > 8) return titleCase(cleaned.slice(0, 96));
  } catch {
    // Fall through to a generic but honest label.
  }

  return "Reported aviation incident";
}

function dedupeAviationIncidents(incidents: AviationIncident[]) {
  const seen = new Map<string, AviationIncident>();
  incidents.forEach((incident) => {
    const key = [
      incident.sourceUrl,
      Math.round(incident.lat * 10) / 10,
      Math.round(incident.lon * 10) / 10
    ].join(":");
    const existing = seen.get(key);
    if (!existing || incident.time > existing.time) seen.set(key, incident);
  });
  return Array.from(seen.values());
}

export async function fetchRiskEvents(signal?: AbortSignal, options: { freshMs?: number } = {}): Promise<RiskSignalEvent[]> {
  const freshCache = readRiskEventsCache(options.freshMs ?? RISK_EVENTS_FRESH_MS);
  if (freshCache) return freshCache.events;

  try {
    const manifest = await fetchText(GDELT_LAST_UPDATE, signal);
    const exportUrl = gdeltExportUrl(manifest);
    if (!exportUrl) throw new Error("GDELT export URL unavailable");

    const staleCache = readRiskEventsCache(RISK_EVENTS_STALE_MS);
    if (staleCache?.exportUrl === exportUrl) return staleCache.events;

    const exportUrls = gdeltExportUrls(exportUrl, 5);
    const exports = await Promise.allSettled(exportUrls.map((url) => fetchZipText(url)));
    const fetchedAt = new Date().toISOString();
    const events = dedupeRiskEvents(
      exports.flatMap((result, index) =>
        result.status === "fulfilled" ? parseGdeltRiskEvents(result.value, exportUrls[index], fetchedAt) : []
      )
    )
      .sort(sortRiskEvents)
      .slice(0, 450);

    writeRiskEventsCache(exportUrl, events);
    return events;
  } catch (err) {
    const staleCache = readRiskEventsCache(RISK_EVENTS_STALE_MS);
    if (staleCache) return staleCache.events;
    throw err;
  }
}

function readRiskEventsCache(maxAgeMs: number) {
  try {
    const raw = localStorage.getItem(RISK_EVENTS_CACHE_KEY);
    if (!raw) return undefined;
    const cached = JSON.parse(raw) as { fetchedAt: number; exportUrl: string; events: RiskSignalEvent[] };
    if (!Array.isArray(cached.events) || Date.now() - cached.fetchedAt > maxAgeMs) return undefined;
    return cached;
  } catch {
    return undefined;
  }
}

function writeRiskEventsCache(exportUrl: string, events: RiskSignalEvent[]) {
  try {
    localStorage.setItem(RISK_EVENTS_CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), exportUrl, events }));
  } catch {
    // Risk feeds are high-churn data; cache only improves resilience.
  }
}

function gdeltExportUrl(manifest: string) {
  return manifest
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/)[2])
    .find((url) => url?.endsWith(".export.CSV.zip"));
}

function gdeltExportUrls(latestUrl: string, count: number) {
  const match = latestUrl.match(/(\d{14})\.(?:export\.CSV|gkg\.csv)\.zip$/i);
  if (!match) return [latestUrl];

  const latestTimestamp = parseGdeltTimestamp(match[1]);
  const urls: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const timestamp = latestTimestamp - index * 15 * 60 * 1000;
    urls.push(latestUrl.replace(match[1], formatGdeltTimestamp(timestamp)));
  }

  return urls;
}

function parseGdeltRiskEvents(text: string, exportUrl: string, fetchedAt: string): RiskSignalEvent[] {
  return text
    .split(/\r?\n/)
    .map((line): RiskSignalEvent | undefined => {
      if (!line) return undefined;
      const columns = line.split("\t");
      if (columns.length < 61 || !isRiskRootCode(columns[28])) return undefined;

      const lat = numberFromText(columns[56]);
      const lon = numberFromText(columns[57]);
      if (lat === undefined || lon === undefined || (lat === 0 && lon === 0)) return undefined;

      const eventCode = columns[26] || columns[27] || columns[28];
      const eventRootCode = columns[28];
      const eventLabel = gdeltEventLabel(eventCode, eventRootCode);
      const kind = gdeltRiskKind(eventRootCode, eventCode);
      const goldsteinScale = numberFromText(columns[30]);
      const avgTone = numberFromText(columns[34]);
      const mentions = Math.max(1, Math.round(numberFromText(columns[31]) ?? 1));
      const sources = Math.max(1, Math.round(numberFromText(columns[32]) ?? 1));
      const articles = Math.max(1, Math.round(numberFromText(columns[33]) ?? 1));
      const geoType = Math.round(numberFromText(columns[51]) ?? 0) || undefined;
      const place = columns[52] || columns[36] || columns[44] || "Reported location";
      const actor1 = columns[6] || undefined;
      const actor2 = columns[16] || undefined;
      const actor1Type = gdeltActorTypeSummary(columns[12], columns[13], columns[14]);
      const actor2Type = gdeltActorTypeSummary(columns[22], columns[23], columns[24]);
      const actors = [actor1, actor2].filter(Boolean).join(" / ") || undefined;
      const time = parseGdeltTimestamp(columns[59]) || parseGdeltDate(columns[1]) || Date.now();
      const sourceUrl = columns[60] || exportUrl;
      const severity = gdeltRiskSeverity(eventRootCode, goldsteinScale, avgTone, mentions, articles);

      return {
        id: `gdelt-${columns[0]}`,
        title: gdeltRiskTitle(eventLabel, place),
        summary: gdeltRiskSummary(eventLabel, place, actor1, actor2),
        kind,
        severity,
        lat,
        lon,
        place,
        country: columns[53] || columns[37] || columns[45] || undefined,
        time,
        sourceUrl,
        sourceLabel: "GDELT",
        eventCode,
        eventRootCode,
        eventLabel,
        geoType,
        geoPrecision: gdeltGeoPrecisionLabel(geoType),
        goldsteinScale,
        avgTone,
        mentions,
        sources,
        articles,
        actors,
        actor1,
        actor2,
        actor1Type,
        actor2Type,
        sourceDomain: gdeltSourceDomain(sourceUrl),
        fetchedAt
      };
    })
    .filter(isDefined);
}

function isRiskRootCode(code: string) {
  return ["13", "14", "15", "17", "18", "19", "20"].includes(code.padStart(2, "0"));
}

function gdeltRiskKind(rootCode: string, eventCode: string): RiskSignalEvent["kind"] {
  const root = rootCode.padStart(2, "0");
  if (root === "20" || eventCode.startsWith("20")) return "violence";
  if (root === "19" || root === "18") return "conflict";
  if (root === "14") return "protest";
  if (root === "15") return "military";
  return "threat";
}

const GDELT_CAMEO_EVENT_LABELS: Record<string, string> = {
  "13": "Threat or coercion",
  "130": "Threat",
  "131": "Non-force threat",
  "132": "Threat of administrative sanction",
  "133": "Threat of protest",
  "134": "Threat to halt talks",
  "135": "Threat to halt mediation",
  "136": "Threat to halt international involvement",
  "137": "Threat of repression",
  "138": "Threat of military force",
  "1381": "Threat of blockade",
  "1382": "Threat of occupation",
  "1383": "Threat of unconventional violence",
  "1384": "Threat of conventional attack",
  "1385": "Threat involving WMD",
  "139": "Ultimatum",
  "14": "Protest or unrest",
  "140": "Political dissent",
  "141": "Demonstration or rally",
  "1411": "Demonstration for leadership change",
  "1412": "Demonstration for policy change",
  "1413": "Demonstration for rights",
  "1414": "Demonstration for institutional change",
  "142": "Hunger strike",
  "143": "Strike or boycott",
  "144": "Obstruction or blockade",
  "145": "Violent protest or riot",
  "15": "Military or police posture",
  "150": "Military or police display",
  "151": "Increased police alert",
  "152": "Increased military alert",
  "153": "Police mobilization",
  "154": "Armed-force mobilization",
  "155": "Cyber-force mobilization",
  "17": "Coercive action",
  "170": "Coercion",
  "171": "Property seizure or damage",
  "172": "Administrative sanction",
  "173": "Arrest or detention",
  "174": "Expulsion or deportation",
  "175": "Repression",
  "176": "Cyber attack",
  "18": "Assault or violence",
  "180": "Unconventional violence",
  "181": "Abduction or hostage-taking",
  "182": "Physical assault",
  "1821": "Sexual assault",
  "1822": "Torture",
  "1823": "Killing by assault",
  "183": "Suicide bombing",
  "184": "Human shield use",
  "185": "Attempted assassination",
  "186": "Assassination",
  "19": "Armed conflict",
  "190": "Conventional military force",
  "191": "Blockade",
  "192": "Occupation of territory",
  "193": "Small-arms fighting",
  "194": "Artillery or tank fighting",
  "195": "Aerial weapons use",
  "196": "Ceasefire violation",
  "20": "Mass violence",
  "200": "Unconventional mass violence",
  "201": "Mass expulsion",
  "202": "Mass killing",
  "203": "Ethnic cleansing",
  "204": "Weapons of mass destruction",
  "2041": "Chemical weapons use",
  "2042": "Biological weapons use",
  "2043": "Radiological weapons use",
  "2044": "Nuclear weapons use"
};

const GDELT_ACTOR_TYPE_LABELS: Record<string, string> = {
  BUS: "business",
  COP: "police",
  CRM: "criminal group",
  CVL: "civilian",
  DEV: "development group",
  EDU: "education",
  ELI: "elite",
  ENV: "environmental group",
  GOV: "government",
  HRI: "human rights group",
  IGO: "international organization",
  INS: "insurgent",
  JUD: "judiciary",
  LAB: "labor group",
  LEG: "legislature",
  MED: "media",
  MIL: "military",
  NGO: "NGO",
  OPP: "opposition",
  RAD: "radical group",
  REB: "rebel group",
  REF: "refugees",
  SEP: "separatist",
  SPY: "intelligence",
  UAF: "armed force"
};

function gdeltEventLabel(eventCode: string, rootCode: string) {
  const normalized = eventCode.replace(/\D/g, "");
  for (let length = normalized.length; length >= 2; length -= 1) {
    const label = GDELT_CAMEO_EVENT_LABELS[normalized.slice(0, length)];
    if (label) return label;
  }
  return GDELT_CAMEO_EVENT_LABELS[rootCode.padStart(2, "0")] ?? "Risk signal";
}

function gdeltActorTypeSummary(...codes: Array<string | undefined>) {
  const labels = codes
    .map((code) => (code ? GDELT_ACTOR_TYPE_LABELS[code] ?? code : ""))
    .filter(Boolean);
  return Array.from(new Set(labels)).join(", ") || undefined;
}

function gdeltGeoPrecisionLabel(geoType?: number) {
  if (geoType === 1) return "Country-level estimate";
  if (geoType === 2) return "Region-level estimate";
  if (geoType === 3) return "City-level estimate";
  if (geoType === 4) return "Local landmark";
  if (geoType === 5) return "Province/state-level estimate";
  return undefined;
}

function gdeltRiskTitle(eventLabel: string, place: string) {
  return `${eventLabel} near ${place || "reported location"}`;
}

function gdeltRiskSummary(eventLabel: string, place: string, actor1?: string, actor2?: string) {
  const involved = [actor1, actor2].filter(Boolean).join(" and ");
  if (involved && place) return `${eventLabel} involving ${involved} near ${place}.`;
  if (involved) return `${eventLabel} involving ${involved}.`;
  if (place) return `${eventLabel} reported near ${place}.`;
  return `${eventLabel} reported by monitored news sources.`;
}

function gdeltSourceDomain(sourceUrl: string) {
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function gdeltRiskSeverity(
  rootCode: string,
  goldsteinScale: number | undefined,
  avgTone: number | undefined,
  mentions: number,
  articles: number
): RiskSignalEvent["severity"] {
  const root = rootCode.padStart(2, "0");
  const impact = Math.log2(mentions + articles + 1);
  const negativeTone = Math.max(0, -(avgTone ?? 0)) / 3;
  const negativeAction = Math.max(0, -(goldsteinScale ?? 0)) / 2;
  const score =
    (root === "20" ? 4 : root === "19" ? 3.5 : root === "18" ? 3 : root === "17" ? 2.4 : root === "15" ? 1.8 : 1.4) +
    impact * 0.28 +
    negativeTone +
    negativeAction;

  if (score >= 7.1 || root === "20") return "danger";
  if (score >= 4.8 || root === "19" || root === "18") return "warning";
  return "watch";
}

function dedupeRiskEvents(events: RiskSignalEvent[]) {
  const seen = new Map<string, RiskSignalEvent>();
  events.forEach((event) => {
    const key = [
      event.eventCode,
      event.actor1 ?? "",
      event.actor2 ?? "",
      Math.round(event.lat * 5) / 5,
      Math.round(event.lon * 5) / 5
    ].join(":");
    const existing = seen.get(key);
    if (!existing || riskEventScore(event) > riskEventScore(existing)) {
      seen.set(key, event);
    }
  });
  return Array.from(seen.values());
}

function sortRiskEvents(left: RiskSignalEvent, right: RiskSignalEvent) {
  return riskEventScore(right) - riskEventScore(left) || right.time - left.time;
}

function riskEventScore(event: RiskSignalEvent) {
  const severityScore = event.severity === "danger" ? 3 : event.severity === "warning" ? 2 : 1;
  return severityScore * 100 + Math.log2(event.mentions + event.articles + 1) * 8 + Math.max(0, -(event.avgTone ?? 0));
}

function parseGdeltTimestamp(value: string) {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (!match) return 0;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6]));
}

function parseGdeltDate(value: string) {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!match) return 0;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function formatGdeltTimestamp(timestamp: number) {
  const date = new Date(timestamp);
  return [
    date.getUTCFullYear(),
    `${date.getUTCMonth() + 1}`.padStart(2, "0"),
    `${date.getUTCDate()}`.padStart(2, "0"),
    `${date.getUTCHours()}`.padStart(2, "0"),
    `${date.getUTCMinutes()}`.padStart(2, "0"),
    `${date.getUTCSeconds()}`.padStart(2, "0")
  ].join("");
}

interface EarthquakeProvider {
  id: string;
  fetchEvents: (signal?: AbortSignal) => Promise<EarthquakeEvent[]>;
}

const earthquakeProviders: EarthquakeProvider[] = [
  { id: "usgs", fetchEvents: fetchUsgsEarthquakes },
  { id: "emsc", fetchEvents: fetchEmscEarthquakes },
  { id: "geonet", fetchEvents: fetchGeoNetEarthquakes },
  { id: "bmkg", fetchEvents: fetchBmkgEarthquakes },
  { id: "ingv", fetchEvents: fetchIngvEarthquakes },
  { id: "taiwan-cwa", fetchEvents: fetchTaiwanCwaEarthquakes }
];

const earthquakeSourcePriority: Record<string, number> = {
  usgs: 2,
  emsc: 3,
  ingv: 4,
  geonet: 5,
  bmkg: 5,
  "taiwan-cwa": 5
};

export async function fetchEarthquakes(signal?: AbortSignal): Promise<EarthquakeEvent[]> {
  const retainedCache = readRetainedEvents<EarthquakeEvent>(EARTHQUAKE_EVENTS_CACHE_KEY);
  const retainedEvents = retainRecentEvents(retainedCache?.events ?? [], (event) => event.time, retainedCache?.fetchedAt);
  const results = await Promise.allSettled(
    earthquakeProviders.map((provider) =>
      withTimeoutSignal(signal, EARTHQUAKE_PROVIDER_TIMEOUT_MS, (providerSignal) => provider.fetchEvents(providerSignal))
    )
  );

  const events = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  if (events.length === 0) {
    if (retainedEvents.length > 0) return retainedEvents.sort((a, b) => b.time - a.time);
    const failure = results.find((result) => result.status === "rejected");
    throw failure?.status === "rejected" && failure.reason instanceof Error ? failure.reason : new Error("Unable to refresh earthquake feeds");
  }

  const retained = retainRecentEvents(
    dedupeEarthquakes([...events, ...retainedEvents]),
    (event) => event.time,
    retainedCache?.fetchedAt
  )
    .sort((a, b) => b.time - a.time);
  writeRetainedEvents(EARTHQUAKE_EVENTS_CACHE_KEY, retained);
  return retained;
}

async function fetchUsgsEarthquakes(signal?: AbortSignal): Promise<EarthquakeEvent[]> {
  const [allWeekResult, majorMonthResult] = await Promise.allSettled([
    fetchUsgsEarthquakeFeed(USGS_EARTHQUAKES, signal),
    fetchUsgsEarthquakeFeed(USGS_MAJOR_EARTHQUAKES, signal)
  ]);

  const events = [allWeekResult, majorMonthResult].flatMap((result) => result.status === "fulfilled" ? result.value : []);
  if (events.length > 0) return events;

  const failure = [allWeekResult, majorMonthResult].find((result) => result.status === "rejected");
  throw failure?.status === "rejected" && failure.reason instanceof Error ? failure.reason : new Error("Unable to refresh USGS earthquake feed");
}

async function fetchUsgsEarthquakeFeed(url: string, signal?: AbortSignal): Promise<EarthquakeEvent[]> {
  const data = await fetchJson<{
    features: Array<{
      id: string;
      properties: {
        mag?: number | null;
        place: string;
        time: number;
        updated: number;
        url: string;
        alert?: string | null;
        tsunami: number;
        sig: number;
        felt?: number | null;
        cdi?: number | null;
        mmi?: number | null;
      };
      geometry: { coordinates: [number, number, number | null] };
    }>;
  }>(url, signal);

  return data.features
    .filter((feature) => Array.isArray(feature.geometry.coordinates))
    .map((feature) => ({
      id: feature.id,
      magnitude: numberOrUndefined(feature.properties.mag),
      place: feature.properties.place,
      time: feature.properties.time,
      updated: feature.properties.updated,
      url: feature.properties.url,
      alert: feature.properties.alert,
      tsunami: feature.properties.tsunami === 1,
      significance: feature.properties.sig,
      lon: feature.geometry.coordinates[0],
      lat: feature.geometry.coordinates[1],
      depth: numberOrUndefined(feature.geometry.coordinates[2]),
      feltReports: numberOrUndefined(feature.properties.felt),
      feltIntensity: numberOrUndefined(feature.properties.cdi),
      instrumentalIntensity: numberOrUndefined(feature.properties.mmi),
      source: "usgs",
      sourceLabel: "USGS"
    }));
}

async function fetchEmscEarthquakes(signal?: AbortSignal): Promise<EarthquakeEvent[]> {
  const url = new URL(EMSC_EARTHQUAKES);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "500");
  url.searchParams.set("minmag", "1.0");
  url.searchParams.set("starttime", new Date(Date.now() - EARTHQUAKE_LOOKBACK_MS).toISOString());

  const data = await fetchJsonViaText<{
    features?: Array<{
      id?: string;
      properties?: {
        source_id?: string | number;
        time?: string;
        lastupdate?: string;
        flynn_region?: string;
        depth?: number | null;
        mag?: number | null;
        magtype?: string;
        auth?: string;
      };
      geometry?: { coordinates?: [number, number, number | null] };
    }>;
  }>(url.toString(), signal);

  return (data.features ?? [])
    .map((feature): EarthquakeEvent | undefined => {
      const coordinates = feature.geometry?.coordinates;
      const properties = feature.properties;
      const time = properties?.time ? Date.parse(properties.time) : NaN;
      if (!coordinates || !properties || !Number.isFinite(time)) return undefined;

      const id = String(feature.id ?? properties.source_id ?? `${properties.time}:${coordinates[1]}:${coordinates[0]}`);
      const magnitude = numberOrUndefined(properties.mag);
      return {
        id: `emsc-${id}`,
        magnitude,
        place: properties.flynn_region ?? "EMSC earthquake",
        time,
        updated: properties.lastupdate ? Date.parse(properties.lastupdate) : time,
        url: `https://www.emsc-csem.org/Earthquake_information/earthquake.php?id=${properties.source_id ?? id}`,
        alert: null,
        tsunami: false,
        significance: earthquakeSignificance(magnitude),
        lon: coordinates[0],
        lat: coordinates[1],
        depth: numberOrUndefined(properties.depth) ?? numberOrUndefined(coordinates[2]),
        source: "emsc",
        sourceLabel: properties.auth ? `EMSC/${properties.auth}` : "EMSC"
      };
    })
    .filter(isDefined);
}

async function fetchGeoNetEarthquakes(signal?: AbortSignal): Promise<EarthquakeEvent[]> {
  const data = await fetchJsonViaText<{
    features?: Array<{
      properties?: {
        publicID?: string;
        time?: string;
        depth?: number | null;
        magnitude?: number | null;
        mmi?: number | null;
        locality?: string;
        quality?: string;
      };
      geometry?: { coordinates?: [number, number] };
    }>;
  }>(GEONET_EARTHQUAKES, signal);

  return (data.features ?? [])
    .map((feature): EarthquakeEvent | undefined => {
      const properties = feature.properties;
      const coordinates = feature.geometry?.coordinates;
      const time = properties?.time ? Date.parse(properties.time) : NaN;
      const magnitude = numberOrUndefined(properties?.magnitude);
      const mmi = numberOrUndefined(properties?.mmi);
      if (!properties || !coordinates || !Number.isFinite(time) || properties.quality === "deleted") return undefined;
      if (Date.now() - time > EARTHQUAKE_LOOKBACK_MS || ((magnitude ?? 0) < 2.5 && (mmi ?? -1) < 3)) return undefined;

      const id = properties.publicID ?? `${properties.time}:${coordinates[1]}:${coordinates[0]}`;
      return {
        id: `geonet-${id}`,
        magnitude,
        place: properties.locality ?? "New Zealand region",
        time,
        updated: time,
        url: `https://www.geonet.org.nz/earthquake/${id}`,
        alert: null,
        tsunami: false,
        significance: earthquakeSignificance(magnitude, mmi),
        lon: coordinates[0],
        lat: coordinates[1],
        depth: numberOrUndefined(properties.depth),
        instrumentalIntensity: mmi,
        source: "geonet",
        sourceLabel: "GeoNet"
      };
    })
    .filter(isDefined);
}

async function fetchBmkgEarthquakes(signal?: AbortSignal): Promise<EarthquakeEvent[]> {
  const [m5Result, feltResult] = await Promise.allSettled([
    fetchBmkgEarthquakeFeed(BMKG_M5_EARTHQUAKES, signal),
    fetchBmkgEarthquakeFeed(BMKG_FELT_EARTHQUAKES, signal)
  ]);

  return [m5Result, feltResult].flatMap((result) => result.status === "fulfilled" ? result.value : []);
}

async function fetchBmkgEarthquakeFeed(url: string, signal?: AbortSignal): Promise<EarthquakeEvent[]> {
  const data = await fetchJsonViaText<{
    Infogempa?: {
      gempa?: BmkgEarthquakeRow | BmkgEarthquakeRow[];
    };
  }>(url, signal);

  const rows = data.Infogempa?.gempa;
  return (Array.isArray(rows) ? rows : rows ? [rows] : [])
    .map((row) => bmkgEarthquakeRowToEvent(row))
    .filter(isDefined);
}

interface BmkgEarthquakeRow {
  DateTime?: string;
  Coordinates?: string;
  Magnitude?: string;
  Kedalaman?: string;
  Wilayah?: string;
  Potensi?: string;
  Dirasakan?: string;
  Shakemap?: string;
}

function bmkgEarthquakeRowToEvent(row: BmkgEarthquakeRow): EarthquakeEvent | undefined {
  const time = row.DateTime ? Date.parse(row.DateTime) : NaN;
  const coordinates = parseBmkgCoordinates(row.Coordinates);
  if (!Number.isFinite(time) || !coordinates) return undefined;

  const magnitude = numberFromText(row.Magnitude);
  const tsunami = Boolean(row.Potensi && !/tidak/i.test(row.Potensi));
  return {
    id: `bmkg-${row.DateTime}-${row.Coordinates}-${row.Magnitude}`,
    magnitude,
    place: row.Wilayah ?? "Indonesia region",
    time,
    updated: time,
    url: row.Shakemap ? `https://static.bmkg.go.id/${row.Shakemap}` : "https://data.bmkg.go.id/gempabumi/",
    alert: tsunami ? "tsunami" : null,
    tsunami,
    significance: earthquakeSignificance(magnitude, undefined, row.Dirasakan ? 80 : 0),
    lat: coordinates.lat,
    lon: coordinates.lon,
    depth: numberFromText(row.Kedalaman?.replace(/[^\d.-]/g, "")),
    feltIntensity: parseMmiFromText(row.Dirasakan),
    source: "bmkg",
    sourceLabel: "BMKG"
  };
}

async function fetchIngvEarthquakes(signal?: AbortSignal): Promise<EarthquakeEvent[]> {
  const url = new URL(INGV_EARTHQUAKES);
  url.searchParams.set("format", "text");
  url.searchParams.set("limit", "240");
  url.searchParams.set("minmagnitude", "1.0");
  url.searchParams.set("starttime", new Date(Date.now() - EARTHQUAKE_LOOKBACK_MS).toISOString());

  const text = await fetchText(url.toString(), signal);
  return parseIngvTextEvents(text);
}

function parseIngvTextEvents(text: string): EarthquakeEvent[] {
  return text
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line): EarthquakeEvent | undefined => {
      const [
        eventId,
        timeText,
        latText,
        lonText,
        depthText,
        author,
        ,
        ,
        ,
        magType,
        magText,
        ,
        place,
        eventType
      ] = line.split("|");
      const time = parseProviderTime(timeText);
      const lat = Number(latText);
      const lon = Number(lonText);
      const magnitude = numberFromText(magText);
      if (!eventId || !Number.isFinite(time) || !Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;

      return {
        id: `ingv-${eventId}`,
        magnitude,
        place: place || "INGV earthquake",
        time,
        updated: time,
        url: `https://terremoti.ingv.it/event/${eventId}`,
        alert: null,
        tsunami: false,
        significance: earthquakeSignificance(magnitude),
        lat,
        lon,
        depth: numberFromText(depthText),
        source: "ingv",
        sourceLabel: author ? `INGV/${author}` : "INGV",
        instrumentalIntensity: eventType && eventType !== "earthquake" ? 0 : undefined
      };
    })
    .filter(isDefined);
}

async function fetchTaiwanCwaEarthquakes(signal?: AbortSignal): Promise<EarthquakeEvent[]> {
  const url = new URL(TAIWAN_CWA_EARTHQUAKES);
  url.searchParams.set("$top", "200");
  url.searchParams.set("$orderby", "@iot.id desc");
  url.searchParams.set("$filter", "substringof('號地震',name)");
  url.searchParams.set("$select", "@iot.id,name,description,properties");
  url.searchParams.set("$expand", "Locations($select=location,name),Datastreams($top=1;$select=phenomenonTime)");

  const data = await fetchJsonViaText<{
    value?: Array<{
      "@iot.id"?: string | number;
      "@iot.selfLink"?: string;
      name?: string;
      description?: string;
      properties?: {
        depth?: number | string | null;
        authority?: string;
        magnitude?: number | string | null;
      };
      Locations?: Array<{
        name?: string;
        location?: { coordinates?: [number, number] };
      }>;
      Datastreams?: Array<{
        phenomenonTime?: string;
      }>;
    }>;
  }>(url.toString(), signal);

  return (data.value ?? [])
    .map((thing): EarthquakeEvent | undefined => {
      const coordinates = thing.Locations?.[0]?.location?.coordinates;
      const phenomenonTime = thing.Datastreams?.[0]?.phenomenonTime?.split("/")[0];
      const time = parseProviderTime(phenomenonTime);
      const magnitude = numberFromText(thing.properties?.magnitude);
      if (!coordinates || !Number.isFinite(time)) return undefined;
      if (Date.now() - time > EARTHQUAKE_LOOKBACK_MS) return undefined;

      const id = thing["@iot.id"] ?? `${phenomenonTime}:${coordinates[1]}:${coordinates[0]}`;
      return {
        id: `taiwan-cwa-${id}`,
        magnitude,
        place: thing.description ?? thing.name ?? "Taiwan region",
        time,
        updated: time,
        url: thing["@iot.selfLink"] ?? "https://ci.taiwan.gov.tw/dsp/Views/_EN/dataset/earthquake.aspx",
        alert: null,
        tsunami: false,
        significance: earthquakeSignificance(magnitude),
        lon: coordinates[0],
        lat: coordinates[1],
        depth: numberFromText(thing.properties?.depth),
        source: "taiwan-cwa",
        sourceLabel: "Taiwan CWA"
      };
    })
    .filter(isDefined);
}

async function withTimeoutSignal<T>(
  signal: AbortSignal | undefined,
  timeoutMs: number,
  task: (signal: AbortSignal) => Promise<T>
) {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });

  try {
    return await task(controller.signal);
  } finally {
    globalThis.clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

async function withPromiseTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof globalThis.setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = globalThis.setTimeout(() => reject(new Error("Request timed out")), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout !== undefined) globalThis.clearTimeout(timeout);
  }
}

function dedupeEarthquakes(events: EarthquakeEvent[]) {
  const merged: EarthquakeEvent[] = [];
  events
    .filter((event) => Number.isFinite(event.lat) && Number.isFinite(event.lon) && Number.isFinite(event.time))
    .sort((a, b) => b.time - a.time)
    .forEach((event) => {
      const matchIndex = merged.findIndex((candidate) => isSameEarthquake(candidate, event));
      if (matchIndex === -1) {
        merged.push(event);
        return;
      }

      merged[matchIndex] = mergeEarthquakeEvents(merged[matchIndex], event);
    });

  return merged;
}

function isSameEarthquake(a: EarthquakeEvent, b: EarthquakeEvent) {
  const timeWindow = Math.abs(a.time - b.time) <= 10 * 60 * 1000;
  if (!timeWindow) return false;
  const magnitudeGap = a.magnitude !== undefined && b.magnitude !== undefined ? Math.abs(a.magnitude - b.magnitude) : 0;
  if (magnitudeGap > 0.9) return false;
  const distance = distanceKm(a.lat, a.lon, b.lat, b.lon);
  const maxDistance = Math.max(70, ((a.magnitude ?? b.magnitude ?? 0) >= 6 ? 140 : 90));
  return distance <= maxDistance;
}

function mergeEarthquakeEvents(current: EarthquakeEvent, next: EarthquakeEvent): EarthquakeEvent {
  const preferred = earthquakeEventPriority(next) >= earthquakeEventPriority(current) ? next : current;
  const other = preferred === next ? current : next;

  return {
    ...preferred,
    id: preferred.id,
    updated: Math.max(current.updated, next.updated),
    alert: preferred.alert ?? other.alert,
    tsunami: current.tsunami || next.tsunami,
    significance: Math.max(current.significance, next.significance),
    depth: preferred.depth ?? other.depth,
    feltReports: maxDefined(current.feltReports, next.feltReports),
    feltIntensity: maxDefined(current.feltIntensity, next.feltIntensity),
    instrumentalIntensity: maxDefined(current.instrumentalIntensity, next.instrumentalIntensity),
    sourceLabel: mergeSourceLabels(current.sourceLabel, next.sourceLabel),
    source: mergeSourceLabels(current.source, next.source)
  };
}

function earthquakeEventPriority(event: EarthquakeEvent) {
  return event.source?.split(", ").reduce((max, source) => Math.max(max, earthquakeSourcePriority[source] ?? 0), 0) ?? 0;
}

function mergeSourceLabels(a?: string, b?: string) {
  return [...new Set([...(a?.split(", ") ?? []), ...(b?.split(", ") ?? [])].filter(Boolean))].join(", ");
}

function maxDefined(a?: number, b?: number) {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.max(a, b);
}

function earthquakeSignificance(magnitude?: number, intensity?: number, bonus = 0) {
  return Math.round((magnitude ?? 0) * 100 + (intensity ?? 0) * 15 + bonus);
}

function parseBmkgCoordinates(value?: string) {
  if (!value) return undefined;
  const [latText, lonText] = value.split(",");
  const lat = Number(latText);
  const lon = Number(lonText);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : undefined;
}

function parseMmiFromText(value?: string) {
  if (!value) return undefined;
  const match = value.match(/(?:MMI\s+([IVXLCDM]+)|([IVXLCDM]+)\s+MMI)/i);
  return match ? romanToNumber(match[1] ?? match[2]) : undefined;
}

function parseProviderTime(value?: string) {
  if (!value) return NaN;
  const normalized = value
    .trim()
    .replace(/\.(\d{3})\d+/, ".$1");
  return Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized) ? normalized : `${normalized}Z`);
}

function romanToNumber(value: string) {
  const digits: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  return value.toUpperCase().split("").reduce((total, char, index, chars) => {
    const current = digits[char] ?? 0;
    const next = digits[chars[index + 1]] ?? 0;
    return total + (current < next ? -current : current);
  }, 0);
}

function distanceKm(latA: number, lonA: number, latB: number, lonB: number) {
  const rad = Math.PI / 180;
  const dLat = (latB - latA) * rad;
  const dLon = (lonB - lonA) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(latA * rad) * Math.cos(latB * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function numberOrUndefined(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export async function fetchRainViewer(signal?: AbortSignal): Promise<RainViewerState> {
  const data = await fetchJson<{
    generated: number;
    host: string;
    radar?: { past?: Array<{ time: number; path: string }>; nowcast?: Array<{ time: number; path: string }> };
  }>(RAINVIEWER, signal);

  return {
    generated: data.generated,
    host: data.host,
    past: data.radar?.past ?? [],
    nowcast: data.radar?.nowcast ?? []
  };
}

function firstTextByLocalName(element: Element, localName: string) {
  const match = Array.from(element.getElementsByTagName("*")).find((child) => child.localName.toLowerCase() === localName.toLowerCase());
  return match?.textContent?.trim();
}

function numberFromText(value?: string | number | null) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

interface WarningProvider {
  id: string;
  fetchWarnings: (signal?: AbortSignal) => Promise<GdacsAlert[]>;
}

const warningProviders: WarningProvider[] = [
  { id: "gdacs", fetchWarnings: fetchGdacsRssAlerts },
  { id: "smhi", fetchWarnings: fetchSmhiWarnings },
  { id: "nws", fetchWarnings: fetchNwsWarnings },
  { id: "met-norway", fetchWarnings: fetchMetNorwayWarnings },
  { id: "dwd", fetchWarnings: fetchDwdWarnings },
  { id: "hko", fetchWarnings: fetchHkoWarnings },
  { id: "jma", fetchWarnings: fetchJmaWarnings },
  { id: "inmet", fetchWarnings: fetchInmetWarnings }
];

export async function fetchGdacsAlerts(signal?: AbortSignal): Promise<GdacsAlert[]> {
  const retainedCache = readRetainedEvents<GdacsAlert>(WARNING_EVENTS_CACHE_KEY);
  const retainedAlerts = retainRecentEvents(retainedCache?.events ?? [], alertRetentionTime, retainedCache?.fetchedAt);
  const results = await Promise.allSettled(warningProviders.map((provider) => provider.fetchWarnings(signal)));
  const alerts = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const fulfilled = results.some((result) => result.status === "fulfilled");

  if (alerts.length > 0 || fulfilled) {
    const retained = retainRecentEvents(
      dedupeAlerts([...alerts, ...retainedAlerts]),
      alertRetentionTime,
      retainedCache?.fetchedAt
    ).sort(sortAlertsByDate);
    writeRetainedEvents(WARNING_EVENTS_CACHE_KEY, retained);
    return retained;
  }

  if (retainedAlerts.length > 0) return retainedAlerts.sort(sortAlertsByDate);

  const reason = results.find((result) => result.status === "rejected")?.reason;
  throw reason instanceof Error ? reason : new Error("Unable to refresh weather warnings");
}

function dedupeAlerts(alerts: GdacsAlert[]) {
  const seen = new Set<string>();
  return alerts.filter((alert) => {
    const key = `${alert.source ?? "unknown"}:${alert.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sortAlertsByDate(left: GdacsAlert, right: GdacsAlert) {
  return alertTime(right) - alertTime(left);
}

function alertTime(alert: GdacsAlert) {
  const value = alert.startsAt ?? alert.date ?? alert.endsAt;
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function alertRetentionTime(alert: GdacsAlert) {
  const times = [alert.endsAt, alert.startsAt, alert.date]
    .map((value) => value ? new Date(value).getTime() : NaN)
    .filter((time) => Number.isFinite(time));
  return times.length > 0 ? Math.max(...times) : undefined;
}

async function fetchGdacsRssAlerts(signal?: AbortSignal): Promise<GdacsAlert[]> {
  const text = await fetchText(GDACS_RSS, signal);
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const items = Array.from(doc.getElementsByTagName("item"));

  return items.slice(0, 80).map((item, index) => {
    const title = item.getElementsByTagName("title")[0]?.textContent?.trim() ?? "GDACS alert";
    const link = item.getElementsByTagName("link")[0]?.textContent?.trim() ?? "https://www.gdacs.org/";
    const date = item.getElementsByTagName("pubDate")[0]?.textContent?.trim();
    const description = item.getElementsByTagName("description")[0]?.textContent?.trim();
    const lat = numberFromText(firstTextByLocalName(item, "lat"));
    const lon = numberFromText(firstTextByLocalName(item, "long") ?? firstTextByLocalName(item, "lon"));
    const alertLevel = firstTextByLocalName(item, "alertlevel") ?? title.match(/\b(Red|Orange|Green)\b/i)?.[1];
    const eventType = firstTextByLocalName(item, "eventtype") ?? title.split(" ")[0];

    return {
      id: `${link}-${index}`,
      title,
      link,
      source: "gdacs",
      sourceLabel: "GDACS",
      sourceLanguage: "en",
      date,
      description,
      lat,
      lon,
      alertLevel,
      eventType
    };
  });
}

interface SmhiWarning {
  id: number;
  event?: LocalizedWarningText & {
    mhoClassification?: LocalizedWarningText;
  };
  warningAreas?: SmhiWarningArea[];
}

interface SmhiWarningArea {
  id: number;
  approximateStart?: string;
  approximateEnd?: string;
  published?: string;
  areaName?: LocalizedWarningText;
  warningLevel?: LocalizedWarningText;
  eventDescription?: LocalizedWarningText;
  affectedAreas?: Array<{ sv?: string; en?: string }>;
  descriptions?: Array<{ title?: LocalizedWarningText; text?: LocalizedWarningText }>;
  area?: {
    geometry?: GdacsAlert["geometry"];
  };
}

interface LocalizedWarningText {
  sv?: string;
  en?: string;
  code?: string;
}

async function fetchSmhiWarnings(signal?: AbortSignal): Promise<GdacsAlert[]> {
  const data = JSON.parse(await fetchText(SMHI_WARNINGS, signal)) as SmhiWarning[];
  return data.flatMap((warning) =>
    (warning.warningAreas ?? []).map((area) => {
      const title = localized(area.eventDescription) ?? localized(warning.event) ?? "SMHI weather warning";
      const level = localized(area.warningLevel);
      const areaName = localized(area.areaName);
      const description = warningDescription(area);

      return {
        id: `smhi-${warning.id}-${area.id}`,
        title,
        link: "https://www.smhi.se/vader/varningar-och-risker/varningar-och-meddelanden",
        source: "smhi",
        sourceLabel: "SMHI",
        sourceLanguage: "en",
        date: area.published,
        startsAt: area.approximateStart,
        endsAt: area.approximateEnd,
        description,
        eventType: localized(warning.event?.mhoClassification) ?? localized(warning.event),
        alertLevel: level,
        levelCode: area.warningLevel?.code,
        areaName,
        geometry: area.area?.geometry
      } satisfies GdacsAlert;
    })
  );
}

interface GeoJsonWarningFeature {
  id?: string;
  geometry?: GdacsAlert["geometry"] | null;
  properties?: Record<string, unknown>;
}

interface GeoJsonWarningCollection {
  features?: GeoJsonWarningFeature[];
}

async function fetchJsonText<T>(url: string, signal?: AbortSignal): Promise<T> {
  return JSON.parse(await fetchText(url, signal)) as T;
}

async function fetchNwsWarnings(signal?: AbortSignal): Promise<GdacsAlert[]> {
  const data = await fetchJsonText<GeoJsonWarningCollection>(NWS_ALERTS, signal);
  return (data.features ?? []).slice(0, 500).map((feature, index) => {
    const properties = feature.properties ?? {};
    const id = stringValue(properties.id) ?? stringValue(properties["@id"]) ?? feature.id ?? `nws-${index}`;
    const event = stringValue(properties.event);
    const headline = stringValue(properties.headline);
    const severity = stringValue(properties.severity);
    const certainty = stringValue(properties.certainty);
    const urgency = stringValue(properties.urgency);
    const description = [stringValue(properties.description), stringValue(properties.instruction)].filter(Boolean).join("\n\n") || undefined;

    return {
      id,
      title: headline ?? event ?? "NOAA/NWS weather alert",
      link: stringValue(properties["@id"]) ?? "https://www.weather.gov/alerts",
      source: "nws",
      sourceLabel: "NOAA/NWS",
      sourceLanguage: "en",
      date: stringValue(properties.sent),
      startsAt: stringValue(properties.onset) ?? stringValue(properties.effective),
      endsAt: stringValue(properties.ends) ?? stringValue(properties.expires),
      description,
      eventType: event,
      alertLevel: [severity, urgency, certainty].filter(Boolean).join(" / ") || severity,
      levelCode: severity,
      areaName: stringValue(properties.areaDesc),
      geometry: isGeometry(feature.geometry) ? feature.geometry : undefined
    } satisfies GdacsAlert;
  });
}

async function fetchMetNorwayWarnings(signal?: AbortSignal): Promise<GdacsAlert[]> {
  const data = await fetchJsonText<GeoJsonWarningCollection>(MET_NORWAY_ALERTS, signal);
  return (data.features ?? []).map((feature, index) => {
    const properties = feature.properties ?? {};
    const title = stringValue(properties.title) ?? stringValue(properties.eventAwarenessName) ?? "MET Norway weather warning";
    const dates = title.match(/\d{4}-\d{2}-\d{2}T[\d:.+-]+/g) ?? [];
    const color = stringValue(properties.riskMatrixColor) ?? metAwarenessColor(stringValue(properties.awareness_level));
    const description = [
      stringValue(properties.description),
      stringValue(properties.consequences),
      stringValue(properties.instruction)
    ].filter(Boolean).join("\n\n") || undefined;

    return {
      id: stringValue(properties.id) ?? `met-norway-${index}`,
      title,
      link: stringValue(properties.web) ?? "https://www.met.no/vaer-og-klima/ekstremvaervarsler-og-andre-farevarsler",
      source: "met-norway",
      sourceLabel: "MET Norway",
      sourceLanguage: "no",
      startsAt: dates[0],
      endsAt: dates[1],
      description,
      eventType: stringValue(properties.eventAwarenessName) ?? stringValue(properties.event) ?? stringValue(properties.awareness_type),
      alertLevel: [color, stringValue(properties.severity), stringValue(properties.awarenessSeriousness)].filter(Boolean).join(" / "),
      levelCode: color ?? stringValue(properties.severity),
      areaName: stringValue(properties.area),
      geometry: isGeometry(feature.geometry) ? feature.geometry : undefined
    } satisfies GdacsAlert;
  });
}

interface DwdWarningPayload {
  time?: number;
  warnings?: Record<string, DwdWarning[]>;
  vorabInformation?: Record<string, DwdWarning[]>;
}

interface DwdWarning {
  identifier?: string;
  event?: string;
  headline?: string;
  description?: string;
  instruction?: string;
  level?: number;
  type?: number;
  start?: number;
  end?: number;
  regionName?: string;
  state?: string;
}

async function fetchDwdWarnings(signal?: AbortSignal): Promise<GdacsAlert[]> {
  const text = await fetchText(DWD_WARNINGS, signal);
  const data = parseDwdWarnings(text);
  const warnings = [
    ...Object.entries(data.warnings ?? {}).flatMap(([regionId, entries]) => entries.map((entry) => ({ regionId, entry, preliminary: false }))),
    ...Object.entries(data.vorabInformation ?? {}).flatMap(([regionId, entries]) => entries.map((entry) => ({ regionId, entry, preliminary: true })))
  ];

  return warnings.slice(0, 400).map(({ regionId, entry, preliminary }, index) => {
    const point = dwdPoint(entry.state);
    const level = dwdLevel(entry.level);
    return {
      id: `dwd-${regionId}-${entry.identifier ?? entry.start ?? index}`,
      title: entry.headline ?? entry.event ?? "DWD weather warning",
      link: "https://www.dwd.de/DE/wetter/warnungen_gemeinden/warnWetter_node.html",
      source: "dwd",
      sourceLabel: "DWD",
      sourceLanguage: "de",
      date: dwdDate(data.time),
      startsAt: dwdDate(entry.start),
      endsAt: dwdDate(entry.end),
      description: [entry.description, entry.instruction].filter(Boolean).join("\n\n") || undefined,
      eventType: entry.event ?? (preliminary ? "Preliminary weather information" : undefined),
      alertLevel: level.label,
      levelCode: level.code,
      areaName: entry.regionName ?? entry.state ?? regionId,
      lat: point.lat,
      lon: point.lon
    } satisfies GdacsAlert;
  });
}

interface HkoWarningSummary {
  name?: string;
  code?: string;
  actionCode?: string;
  issueTime?: string;
  expireTime?: string;
  updateTime?: string;
}

interface HkoWarningInfo {
  details?: Array<{
    contents?: string[];
    warningStatementCode?: string;
    updateTime?: string;
  }>;
}

async function fetchHkoWarnings(signal?: AbortSignal): Promise<GdacsAlert[]> {
  const [summary, info] = await Promise.all([
    fetchJsonText<Record<string, HkoWarningSummary>>(HKO_WARNING_SUMMARY, signal),
    fetchJsonText<HkoWarningInfo>(HKO_WARNING_INFO, signal).catch(() => undefined)
  ]);
  const detailsByCode = new Map((info?.details ?? []).map((detail) => [detail.warningStatementCode, detail]));

  return Object.entries(summary).map(([key, warning]) => {
    const code = warning.code ?? key;
    const detail = detailsByCode.get(code);
    const level = hkoLevel(code, warning.name);

    return {
      id: `hko-${code}-${warning.updateTime ?? warning.issueTime ?? key}`,
      title: warning.name ?? "Hong Kong Observatory weather warning",
      link: "https://www.hko.gov.hk/en/wxinfo/dailywx/wxwarntoday.htm",
      source: "hko",
      sourceLabel: "Hong Kong Observatory",
      sourceLanguage: "en",
      date: detail?.updateTime ?? warning.updateTime ?? warning.issueTime,
      startsAt: warning.issueTime,
      endsAt: warning.expireTime,
      description: detail?.contents?.join("\n") ?? warning.actionCode,
      eventType: code,
      alertLevel: level.label,
      levelCode: level.code,
      areaName: "Hong Kong",
      lat: 22.3193,
      lon: 114.1694
    } satisfies GdacsAlert;
  });
}

interface JmaWarningMapItem {
  reportDatetime?: string;
  areaTypes?: Array<{
    areas?: Array<{
      code?: string;
      warnings?: Array<{ code?: string; status?: string }>;
    }>;
  }>;
}

interface JmaAreaMetadata {
  offices?: Record<string, { enName?: string; name?: string; children?: string[]; parent?: string }>;
  class10s?: Record<string, { enName?: string; name?: string; parent?: string }>;
  class15s?: Record<string, { enName?: string; name?: string; parent?: string }>;
  class20s?: Record<string, { enName?: string; name?: string; parent?: string }>;
}

let jmaAreaMetadataPromise: Promise<JmaAreaMetadata> | undefined;

async function fetchJmaWarnings(signal?: AbortSignal): Promise<GdacsAlert[]> {
  const [items, metadata] = await Promise.all([fetchJsonText<JmaWarningMapItem[]>(JMA_WARNING_MAP, signal), fetchJmaAreaMetadata(signal)]);

  return items.flatMap((item, itemIndex) => {
    const active = new Map<string, { code: string; statuses: Set<string>; areas: Set<string>; firstAreaCode?: string }>();
    (item.areaTypes ?? []).forEach((areaType) => {
      (areaType.areas ?? []).forEach((area) => {
        const areaCode = area.code;
        (area.warnings ?? []).forEach((warning) => {
          if (!warning.code || isJmaInactiveStatus(warning.status)) return;
          const entry = active.get(warning.code) ?? { code: warning.code, statuses: new Set(), areas: new Set(), firstAreaCode: areaCode };
          if (warning.status) entry.statuses.add(warning.status);
          if (areaCode) entry.areas.add(jmaAreaName(areaCode, metadata));
          if (!entry.firstAreaCode) entry.firstAreaCode = areaCode;
          active.set(warning.code, entry);
        });
      });
    });

    return Array.from(active.values()).map((entry) => {
      const warningName = jmaWarningName(entry.code);
      const point = jmaPoint(entry.firstAreaCode);
      const areaNames = Array.from(entry.areas).slice(0, 5);
      const areaNote = entry.areas.size > areaNames.length ? `${areaNames.join(", ")} and ${entry.areas.size - areaNames.length} more` : areaNames.join(", ");
      const level = jmaLevel(entry.code);

      return {
        id: `jma-${itemIndex}-${entry.code}-${entry.firstAreaCode ?? "area"}`,
        title: `${warningName} - ${areaNames[0] ?? "Japan"}`,
        link: "https://www.jma.go.jp/bosai/warning/",
        source: "jma",
        sourceLabel: "Japan Meteorological Agency",
        sourceLanguage: "ja",
        date: item.reportDatetime,
        description: [`Status: ${Array.from(entry.statuses).join(", ") || "Active"}`, areaNote ? `Areas: ${areaNote}` : undefined].filter(Boolean).join("\n"),
        eventType: warningName,
        alertLevel: level.label,
        levelCode: level.code,
        areaName: areaNames[0] ?? "Japan",
        lat: point.lat,
        lon: point.lon
      } satisfies GdacsAlert;
    });
  });
}

async function fetchJmaAreaMetadata(signal?: AbortSignal) {
  jmaAreaMetadataPromise ??= fetchJsonText<JmaAreaMetadata>(JMA_AREA_METADATA, signal);
  return jmaAreaMetadataPromise;
}

async function fetchInmetWarnings(signal?: AbortSignal): Promise<GdacsAlert[]> {
  const data = await fetchJsonText<unknown>(INMET_ACTIVE_WARNINGS, signal);
  const items = normalizeInmetItems(data);

  return items.slice(0, 300).map((item, index) => {
    const state = stringValue(item.sigla_uf) ?? stringValue(item.uf) ?? stringValue(item.estado);
    const point = brazilPoint(state);
    const levelText = stringValue(item.severidade) ?? stringValue(item.nivel) ?? stringValue(item.risco);
    const level = inmetLevel(levelText);

    return {
      id: `inmet-${stringValue(item.id) ?? stringValue(item.codigo) ?? index}`,
      title: stringValue(item.titulo) ?? stringValue(item.evento) ?? stringValue(item.descricao) ?? "INMET weather alert",
      link: "https://alert-as.inmet.gov.br/cv/?lang=en",
      source: "inmet",
      sourceLabel: "INMET Brazil",
      sourceLanguage: "pt",
      date: stringValue(item.data_publicacao) ?? stringValue(item.publicado_em),
      startsAt: stringValue(item.data_inicio) ?? stringValue(item.inicio),
      endsAt: stringValue(item.data_fim) ?? stringValue(item.fim),
      description: stringValue(item.descricao) ?? stringValue(item.instrucoes) ?? stringValue(item.recomendacoes),
      eventType: stringValue(item.evento) ?? stringValue(item.tipo),
      alertLevel: level.label,
      levelCode: level.code,
      areaName: [stringValue(item.area), stringValue(item.municipio), state].filter(Boolean).join(", ") || "Brazil",
      lat: numberValue(item.lat) ?? numberValue(item.latitude) ?? point.lat,
      lon: numberValue(item.lon) ?? numberValue(item.lng) ?? numberValue(item.longitude) ?? point.lon,
      geometry: isGeometry(item.geometry) ? item.geometry : undefined
    } satisfies GdacsAlert;
  });
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function titleCase(value: string) {
  return value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function isGeometry(value: unknown): value is NonNullable<GdacsAlert["geometry"]> {
  if (!value || typeof value !== "object") return false;
  const type = (value as { type?: unknown }).type;
  return typeof type === "string" && ["Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon", "GeometryCollection"].includes(type);
}

function metAwarenessColor(value?: string) {
  return value?.split(";").map((part) => part.trim()).find((part) => /^(?:red|orange|yellow|green)$/i.test(part));
}

function parseDwdWarnings(text: string): DwdWarningPayload {
  const trimmed = text.trim();
  const json = trimmed.startsWith("warnWetter.loadWarnings(")
    ? trimmed.replace(/^warnWetter\.loadWarnings\(/, "").replace(/\);?$/, "")
    : trimmed;
  return JSON.parse(json) as DwdWarningPayload;
}

const GERMANY_POINT = { lat: 51.1657, lon: 10.4515 };
const DWD_STATE_POINTS: Record<string, { lat: number; lon: number }> = {
  BB: { lat: 52.4125, lon: 12.5316 },
  BE: { lat: 52.52, lon: 13.405 },
  BW: { lat: 48.6616, lon: 9.3501 },
  BY: { lat: 48.7904, lon: 11.4979 },
  HB: { lat: 53.0793, lon: 8.8017 },
  HE: { lat: 50.6521, lon: 9.1624 },
  HH: { lat: 53.5511, lon: 9.9937 },
  MV: { lat: 53.6127, lon: 12.4296 },
  NI: { lat: 52.6367, lon: 9.8451 },
  NW: { lat: 51.4332, lon: 7.6616 },
  RP: { lat: 50.1183, lon: 7.309 },
  SH: { lat: 54.2194, lon: 9.6961 },
  SL: { lat: 49.3964, lon: 7.023 },
  SN: { lat: 51.1045, lon: 13.2017 },
  ST: { lat: 51.9503, lon: 11.6923 },
  TH: { lat: 50.9848, lon: 11.0299 }
};

function dwdPoint(state?: string) {
  const key = state?.toUpperCase();
  return key ? DWD_STATE_POINTS[key] ?? GERMANY_POINT : GERMANY_POINT;
}

function dwdLevel(level?: number) {
  if ((level ?? 0) >= 4) return { label: "Extreme", code: "red" };
  if ((level ?? 0) >= 3) return { label: "Severe", code: "orange" };
  if ((level ?? 0) >= 2) return { label: "Moderate", code: "yellow" };
  return { label: "Information", code: "green" };
}

function dwdDate(value?: number) {
  if (!Number.isFinite(value)) return undefined;
  const milliseconds = (value ?? 0) < 1_000_000_000_000 ? (value ?? 0) * 1000 : value ?? 0;
  return new Date(milliseconds).toISOString();
}

function hkoLevel(code?: string, name?: string) {
  const text = `${code ?? ""} ${name ?? ""}`.toLowerCase();
  if (text.includes("black") || text.includes("hurricane") || text.includes("no. 10") || text.includes("no.10")) {
    return { label: "Extreme", code: "red" };
  }
  if (text.includes("red") || text.includes("no. 8") || text.includes("no.8") || text.includes("no. 9") || text.includes("no.9")) {
    return { label: "Severe", code: "orange" };
  }
  if (text.includes("amber") || text.includes("yellow") || text.includes("thunderstorm")) {
    return { label: "Advisory", code: "yellow" };
  }
  return { label: "Warning", code: "orange" };
}

function isJmaInactiveStatus(status?: string) {
  return !status || status.includes("\u89e3\u9664") || status.includes("\u306a\u3057");
}

const JMA_WARNING_NAMES: Record<string, string> = {
  "02": "Snowstorm warning",
  "03": "Heavy rain warning",
  "04": "Flood warning",
  "05": "Storm warning",
  "06": "Heavy snow warning",
  "07": "High wave warning",
  "08": "Storm surge warning",
  "10": "Heavy rain advisory",
  "12": "Heavy snow advisory",
  "13": "Snowstorm advisory",
  "14": "Thunderstorm advisory",
  "15": "Strong wind advisory",
  "16": "High wave advisory",
  "17": "Snowmelt advisory",
  "18": "Flood advisory",
  "19": "Storm surge advisory",
  "20": "Dense fog advisory",
  "21": "Dry air advisory",
  "22": "Avalanche advisory",
  "23": "Low temperature advisory",
  "24": "Frost advisory",
  "25": "Ice accretion advisory",
  "26": "Snow accretion advisory",
  "32": "Heavy snow emergency warning",
  "33": "Heavy rain emergency warning",
  "35": "Storm emergency warning",
  "36": "Snowstorm emergency warning",
  "37": "High wave emergency warning",
  "38": "Storm surge emergency warning"
};

function jmaWarningName(code: string) {
  return JMA_WARNING_NAMES[code.padStart(2, "0")] ?? `JMA warning ${code}`;
}

function jmaLevel(code: string) {
  const normalized = code.padStart(2, "0");
  if (["32", "33", "35", "36", "37", "38"].includes(normalized)) return { label: "Emergency", code: "red" };
  if (["02", "03", "04", "05", "06", "07", "08"].includes(normalized)) return { label: "Warning", code: "orange" };
  return { label: "Advisory", code: "yellow" };
}

const JMA_POINTS: Record<string, { lat: number; lon: number }> = {
  "011": { lat: 45.25, lon: 141.85 },
  "012": { lat: 43.77, lon: 142.36 },
  "013": { lat: 44.02, lon: 144.27 },
  "014030": { lat: 42.92, lon: 143.2 },
  "014100": { lat: 43.25, lon: 144.39 },
  "015": { lat: 42.72, lon: 141.61 },
  "016": { lat: 43.06, lon: 141.35 },
  "017": { lat: 41.78, lon: 140.74 },
  "02": { lat: 40.82, lon: 140.75 },
  "03": { lat: 39.7, lon: 141.15 },
  "04": { lat: 38.27, lon: 140.87 },
  "05": { lat: 39.72, lon: 140.1 },
  "06": { lat: 38.24, lon: 140.36 },
  "07": { lat: 37.75, lon: 140.47 },
  "08": { lat: 36.34, lon: 140.45 },
  "09": { lat: 36.57, lon: 139.88 },
  "10": { lat: 36.39, lon: 139.06 },
  "11": { lat: 35.86, lon: 139.65 },
  "12": { lat: 35.6, lon: 140.12 },
  "13": { lat: 35.68, lon: 139.76 },
  "14": { lat: 35.45, lon: 139.64 },
  "15": { lat: 37.9, lon: 139.02 },
  "16": { lat: 36.7, lon: 137.21 },
  "17": { lat: 36.59, lon: 136.63 },
  "18": { lat: 36.07, lon: 136.22 },
  "19": { lat: 35.66, lon: 138.57 },
  "20": { lat: 36.65, lon: 138.18 },
  "21": { lat: 35.39, lon: 136.72 },
  "22": { lat: 34.98, lon: 138.38 },
  "23": { lat: 35.18, lon: 136.91 },
  "24": { lat: 34.73, lon: 136.51 },
  "25": { lat: 35.0, lon: 135.87 },
  "26": { lat: 35.02, lon: 135.76 },
  "27": { lat: 34.69, lon: 135.5 },
  "28": { lat: 34.69, lon: 135.18 },
  "29": { lat: 34.69, lon: 135.83 },
  "30": { lat: 34.23, lon: 135.17 },
  "31": { lat: 35.5, lon: 134.24 },
  "32": { lat: 35.47, lon: 133.05 },
  "33": { lat: 34.66, lon: 133.93 },
  "34": { lat: 34.39, lon: 132.46 },
  "35": { lat: 34.19, lon: 131.47 },
  "36": { lat: 34.07, lon: 134.56 },
  "37": { lat: 34.34, lon: 134.04 },
  "38": { lat: 33.84, lon: 132.77 },
  "39": { lat: 33.56, lon: 133.53 },
  "40": { lat: 33.59, lon: 130.4 },
  "41": { lat: 33.25, lon: 130.3 },
  "42": { lat: 32.75, lon: 129.87 },
  "43": { lat: 32.79, lon: 130.74 },
  "44": { lat: 33.24, lon: 131.61 },
  "45": { lat: 31.91, lon: 131.42 },
  "460040": { lat: 28.38, lon: 129.49 },
  "46": { lat: 31.6, lon: 130.56 },
  "471": { lat: 26.21, lon: 127.68 },
  "472": { lat: 25.85, lon: 131.24 },
  "473": { lat: 24.8, lon: 125.28 },
  "474": { lat: 24.34, lon: 124.16 },
  "47": { lat: 26.21, lon: 127.68 }
};

function jmaPoint(areaCode?: string) {
  if (!areaCode) return { lat: 36.2, lon: 138.25 };
  const candidates = [areaCode, areaCode.slice(0, 6), areaCode.slice(0, 3), areaCode.slice(0, 2)];
  return candidates.map((candidate) => JMA_POINTS[candidate]).find(Boolean) ?? { lat: 36.2, lon: 138.25 };
}

function jmaAreaName(code: string, metadata: JmaAreaMetadata) {
  const entry = metadata.class20s?.[code] ?? metadata.class15s?.[code] ?? metadata.class10s?.[code] ?? metadata.offices?.[code];
  if (entry) return entry.enName ?? entry.name ?? code;
  return code;
}

function normalizeInmetItems(data: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(data)) return data.filter(isRecord);
  if (!isRecord(data)) return [];
  const object = data as Record<string, unknown>;
  const direct = object.data ?? object.avisos ?? object.alerts ?? object.items;
  if (Array.isArray(direct)) return direct.filter(isRecord);
  return Object.values(object).flatMap((value) => Array.isArray(value) ? value.filter(isRecord) : isRecord(value) ? [value] : []);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const BRAZIL_POINT = { lat: -14.235, lon: -51.9253 };
const BRAZIL_STATE_POINTS: Record<string, { lat: number; lon: number }> = {
  AC: { lat: -9.02, lon: -70.81 },
  AL: { lat: -9.62, lon: -36.82 },
  AM: { lat: -3.47, lon: -65.1 },
  AP: { lat: 1.41, lon: -51.77 },
  BA: { lat: -12.58, lon: -41.7 },
  CE: { lat: -5.2, lon: -39.53 },
  DF: { lat: -15.79, lon: -47.86 },
  ES: { lat: -19.19, lon: -40.34 },
  GO: { lat: -15.98, lon: -49.86 },
  MA: { lat: -5.42, lon: -45.44 },
  MG: { lat: -18.51, lon: -44.56 },
  MS: { lat: -20.51, lon: -54.54 },
  MT: { lat: -12.64, lon: -55.42 },
  PA: { lat: -3.79, lon: -52.48 },
  PB: { lat: -7.24, lon: -36.78 },
  PE: { lat: -8.28, lon: -35.07 },
  PI: { lat: -6.6, lon: -42.28 },
  PR: { lat: -24.89, lon: -51.55 },
  RJ: { lat: -22.25, lon: -42.66 },
  RN: { lat: -5.81, lon: -36.59 },
  RO: { lat: -10.83, lon: -63.34 },
  RR: { lat: 1.99, lon: -61.33 },
  RS: { lat: -30.03, lon: -51.23 },
  SC: { lat: -27.33, lon: -49.44 },
  SE: { lat: -10.57, lon: -37.45 },
  SP: { lat: -22.19, lon: -48.79 },
  TO: { lat: -10.25, lon: -48.25 }
};

function brazilPoint(state?: string) {
  const key = state?.toUpperCase();
  return key ? BRAZIL_STATE_POINTS[key] ?? BRAZIL_POINT : BRAZIL_POINT;
}

function inmetLevel(level?: string) {
  const normalized = (level ?? "").toLowerCase();
  if (normalized.includes("grande") || normalized.includes("extremo") || normalized.includes("extreme")) return { label: level ?? "Extreme", code: "red" };
  if (normalized.includes("perigo") || normalized.includes("danger")) return { label: level ?? "Danger", code: "orange" };
  if (normalized.includes("potencial") || normalized.includes("potential")) return { label: level ?? "Potential danger", code: "yellow" };
  return { label: level ?? "Alert", code: "yellow" };
}

function localized(value?: LocalizedWarningText) {
  return value?.en ?? value?.sv ?? value?.code;
}

function warningDescription(area: SmhiWarningArea) {
  const incident =
    area.descriptions?.find((description) => description.title?.code === "INCIDENT") ??
    area.descriptions?.find((description) => description.text?.en || description.text?.sv);
  return localized(incident?.text);
}

function maxInNext(hours: number, times: string[], values: number[]) {
  const now = Date.now();
  const cutoff = now + hours * 60 * 60 * 1000;
  return values.reduce<number | undefined>((max, value, index) => {
    const time = new Date(times[index]).getTime();
    if (Number.isNaN(time) || time < now || time > cutoff) return max;
    return max === undefined ? value : Math.max(max, value);
  }, undefined);
}

function includesCodeInNext(hours: number, times: string[], codes: number[], matcher: (code: number) => boolean) {
  const now = Date.now();
  const cutoff = now + hours * 60 * 60 * 1000;
  return codes.find((code, index) => {
    const time = new Date(times[index]).getTime();
    return !Number.isNaN(time) && time >= now && time <= cutoff && matcher(code);
  });
}

const localSignalCopy = {
  en: {
    severeGusts: "Severe gusts",
    strongGusts: "Strong gusts",
    gustsNear: "Gusts near",
    heavyPrecipitation: "Heavy precipitation",
    peakHourlyAmountNear: "Peak hourly amount near",
    wetConditions: "Wet conditions",
    precipitationChanceAhead: "precipitation chance ahead",
    thunderstormRisk: "Thunderstorm risk",
    snowNearby: "Snow nearby",
    snowfallReportedNow: "Snowfall reported now",
    dangerousHeat: "Dangerous heat",
    severeCold: "Severe cold",
    feelsLike: "Feels like"
  },
  sv: {
    severeGusts: "Mycket hårda vindbyar",
    strongGusts: "Hårda vindbyar",
    gustsNear: "Vindbyar nära",
    heavyPrecipitation: "Kraftig nederbörd",
    peakHourlyAmountNear: "Högsta timmängd nära",
    wetConditions: "Blöta förhållanden",
    precipitationChanceAhead: "nederbördsrisk framåt",
    thunderstormRisk: "Risk för åska",
    snowNearby: "Snö i närheten",
    snowfallReportedNow: "Snöfall rapporteras nu",
    dangerousHeat: "Farlig värme",
    severeCold: "Sträng kyla",
    feelsLike: "Känns som"
  },
  de: {
    severeGusts: "Schwere Böen",
    strongGusts: "Starke Böen",
    gustsNear: "Böen nahe",
    heavyPrecipitation: "Starker Niederschlag",
    peakHourlyAmountNear: "Höchste Stundenmenge nahe",
    wetConditions: "Nasse Bedingungen",
    precipitationChanceAhead: "Niederschlagswahrscheinlichkeit voraus",
    thunderstormRisk: "Gewitterrisiko",
    snowNearby: "Schnee in der Nähe",
    snowfallReportedNow: "Schneefall jetzt gemeldet",
    dangerousHeat: "Gefährliche Hitze",
    severeCold: "Strenge Kälte",
    feelsLike: "Gefühlt"
  },
  fr: {
    severeGusts: "Rafales violentes",
    strongGusts: "Fortes rafales",
    gustsNear: "Rafales proches de",
    heavyPrecipitation: "Fortes précipitations",
    peakHourlyAmountNear: "Pic horaire proche de",
    wetConditions: "Conditions humides",
    precipitationChanceAhead: "probabilité de précipitation à venir",
    thunderstormRisk: "Risque d'orage",
    snowNearby: "Neige proche",
    snowfallReportedNow: "Chute de neige signalée maintenant",
    dangerousHeat: "Chaleur dangereuse",
    severeCold: "Froid intense",
    feelsLike: "Ressenti"
  },
  es: {
    severeGusts: "Ráfagas severas",
    strongGusts: "Ráfagas fuertes",
    gustsNear: "Ráfagas cerca de",
    heavyPrecipitation: "Precipitación intensa",
    peakHourlyAmountNear: "Pico horario cerca de",
    wetConditions: "Condiciones húmedas",
    precipitationChanceAhead: "probabilidad de precipitación próxima",
    thunderstormRisk: "Riesgo de tormenta",
    snowNearby: "Nieve cercana",
    snowfallReportedNow: "Nevada reportada ahora",
    dangerousHeat: "Calor peligroso",
    severeCold: "Frío severo",
    feelsLike: "Sensación"
  },
  it: {
    severeGusts: "Raffiche severe",
    strongGusts: "Raffiche forti",
    gustsNear: "Raffiche vicino a",
    heavyPrecipitation: "Precipitazioni intense",
    peakHourlyAmountNear: "Picco orario vicino a",
    wetConditions: "Condizioni bagnate",
    precipitationChanceAhead: "probabilità di precipitazione in arrivo",
    thunderstormRisk: "Rischio temporali",
    snowNearby: "Neve vicina",
    snowfallReportedNow: "Nevicata segnalata ora",
    dangerousHeat: "Caldo pericoloso",
    severeCold: "Freddo intenso",
    feelsLike: "Percepita"
  },
  ja: {
    severeGusts: "非常に強い突風",
    strongGusts: "強い突風",
    gustsNear: "突風 約",
    heavyPrecipitation: "強い降水",
    peakHourlyAmountNear: "最大1時間量 約",
    wetConditions: "湿った状況",
    precipitationChanceAhead: "今後の降水確率",
    thunderstormRisk: "雷雨リスク",
    snowNearby: "近くで雪",
    snowfallReportedNow: "現在降雪あり",
    dangerousHeat: "危険な暑さ",
    severeCold: "厳しい寒さ",
    feelsLike: "体感"
  },
  zh: {
    severeGusts: "严重阵风",
    strongGusts: "强阵风",
    gustsNear: "阵风接近",
    heavyPrecipitation: "强降水",
    peakHourlyAmountNear: "最大小时量接近",
    wetConditions: "潮湿状况",
    precipitationChanceAhead: "未来降水概率",
    thunderstormRisk: "雷暴风险",
    snowNearby: "附近有雪",
    snowfallReportedNow: "当前报告降雪",
    dangerousHeat: "危险高温",
    severeCold: "严寒",
    feelsLike: "体感"
  }
};

function localSignalText(language?: string) {
  return language && language in localSignalCopy ? localSignalCopy[language as keyof typeof localSignalCopy] : localSignalCopy.en;
}

function pushSignal(signals: LocalSignal[], id: string, title: string, detail: string, severity: Severity) {
  signals.push({ id, title, detail, severity });
}

export function deriveLocalSignals(weather?: LocalWeather, units: { temperatureUnit?: TemperatureUnit; windUnit?: WindUnit; rainUnit?: RainUnit; language?: string } = {}): LocalSignal[] {
  if (!weather) return [];

  const text = localSignalText(units.language);
  const signals: LocalSignal[] = [];
  const current = weather.current;
  const nextWind = maxInNext(18, weather.hourly.time, weather.hourly.wind_gusts_10m);
  const nextPrecip = maxInNext(18, weather.hourly.time, weather.hourly.precipitation);
  const nextPop = maxInNext(18, weather.hourly.time, weather.hourly.precipitation_probability);
  const nextUv = maxInNext(18, weather.hourly.time, weather.hourly.uv_index);
  const stormCode = includesCodeInNext(18, weather.hourly.time, weather.hourly.weather_code, (code) => code >= 95);
  const snowCode = includesCodeInNext(18, weather.hourly.time, weather.hourly.weather_code, (code) => [71, 73, 75, 77, 85, 86].includes(code));

  if (current.wind_gusts_10m >= 80 || (nextWind ?? 0) >= 80) {
    pushSignal(signals, "wind-danger", text.severeGusts, `${text.gustsNear} ${formatWind(Math.max(current.wind_gusts_10m, nextWind ?? 0), units.windUnit)}`, "danger");
  } else if (current.wind_gusts_10m >= 55 || (nextWind ?? 0) >= 55) {
    pushSignal(signals, "wind-watch", text.strongGusts, `${text.gustsNear} ${formatWind(Math.max(current.wind_gusts_10m, nextWind ?? 0), units.windUnit)}`, "warning");
  }

  if (current.precipitation >= 8 || (nextPrecip ?? 0) >= 8) {
    pushSignal(signals, "rain-danger", text.heavyPrecipitation, `${text.peakHourlyAmountNear} ${formatRain(Math.max(current.precipitation, nextPrecip ?? 0), units.rainUnit)}`, "danger");
  } else if (current.precipitation >= 3 || (nextPrecip ?? 0) >= 3 || (nextPop ?? 0) >= 80) {
    pushSignal(signals, "rain-watch", text.wetConditions, `${Math.round(nextPop ?? 0)}% ${text.precipitationChanceAhead}`, "watch");
  }

  if (stormCode) {
    pushSignal(signals, "storm", text.thunderstormRisk, weatherCodeLabel(stormCode, units.language), "warning");
  }

  if (current.snowfall > 0 || snowCode) {
    pushSignal(signals, "snow", text.snowNearby, snowCode ? weatherCodeLabel(snowCode, units.language) : text.snowfallReportedNow, "watch");
  }

  if (current.apparent_temperature >= 38) {
    pushSignal(signals, "heat", text.dangerousHeat, `${text.feelsLike} ${formatTemperature(current.apparent_temperature, units.temperatureUnit)}`, "danger");
  } else if (current.apparent_temperature <= -15) {
    pushSignal(signals, "cold", text.severeCold, `${text.feelsLike} ${formatTemperature(current.apparent_temperature, units.temperatureUnit)}`, "warning");
  }

  if (current.visibility <= 1000) {
    pushSignal(signals, "visibility", "Low visibility", `${Math.round(current.visibility)} m`, "warning");
  }

  if ((nextUv ?? current.uv_index) >= 8) {
    pushSignal(signals, "uv", "High UV", `UV index ${Math.round(nextUv ?? current.uv_index)}`, "watch");
  }

  if ((weather.airQuality?.us_aqi ?? 0) >= 151) {
    pushSignal(signals, "aqi-danger", "Poor air quality", `US AQI ${Math.round(weather.airQuality?.us_aqi ?? 0)}`, "warning");
  } else if ((weather.airQuality?.us_aqi ?? 0) >= 101) {
    pushSignal(signals, "aqi-watch", "Sensitive air quality", `US AQI ${Math.round(weather.airQuality?.us_aqi ?? 0)}`, "watch");
  }

  return signals;
}
