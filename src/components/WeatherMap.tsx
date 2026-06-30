import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "@maplibre/maplibre-gl-leaflet";
import type { Geometry } from "geojson";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { EarthquakeEvent, GdacsAlert, LocalWeather, PrimaryLayer, RainFrame, RainViewerState, WeatherGridPoint } from "../types";
import { temperatureRgb, weatherCodeLabel } from "../utils/weatherCodes";

interface WeatherMapProps {
  activeLayer: PrimaryLayer;
  showEarthquakes: boolean;
  showTimezones: boolean;
  showWarnings: boolean;
  showDayNight: boolean;
  showHomeMarker: boolean;
  dayNightTimestamp: number;
  weatherGrid: WeatherGridPoint[];
  earthquakes: EarthquakeEvent[];
  warnings: GdacsAlert[];
  rainViewer?: RainViewerState;
  mapLanguage: string;
  appLanguage: string;
  homeFocusRequest?: number;
  selectedLocation?: {
    latitude: number;
    longitude: number;
    name: string;
    label?: string;
    weather?: LocalWeather["current"];
    airQuality?: LocalWeather["airQuality"];
    fetchedAt?: string;
    weatherStatus?: string;
  };
}

const MAX_MERCATOR_LAT = 85.05112878;
const LONGITUDE_WRAP_LIMIT = 1_000_000;
const WORLD_COPY_OFFSETS = [-720, -360, 0, 360, 720];
const OPENFREEMAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const HOME_MARKER_ICON = `<span aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><path d="M9 22V12h6v10"></path></svg></span>`;
const SURFACE_GRID_STEP = 10;
const SURFACE_GRID_MIN_LAT = -80;
const SURFACE_GRID_MAX_LAT = 80;
const SURFACE_RASTER_MAX_PIXELS = 520_000;
const WARNING_TRANSLATION_CACHE_PREFIX = "weather-watch:warning-translation:v1";
const WORLD_BOUNDS: L.LatLngBoundsExpression = [
  [-MAX_MERCATOR_LAT, -LONGITUDE_WRAP_LIMIT],
  [MAX_MERCATOR_LAT, LONGITUDE_WRAP_LIMIT]
];

function popupTable(rows: Array<[string, string | number | undefined]>) {
  return `<div class="map-popup">${rows
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([label, value]) => `<div><strong>${label}</strong><span>${value}</span></div>`)
    .join("")}</div>`;
}

function homeLocationPopup(location: NonNullable<WeatherMapProps["selectedLocation"]>) {
  const current = location.weather;
  return popupTable([
    ["Home", location.name],
    ["Location", location.label],
    ["Condition", current ? weatherCodeLabel(current.weather_code) : location.weatherStatus ?? "Weather updating"],
    ["Temperature", current ? `${Math.round(current.temperature_2m)}\u00b0C` : undefined],
    ["Feels like", current ? `${Math.round(current.apparent_temperature)}\u00b0C` : undefined],
    ["Wind", current ? `${Math.round(current.wind_speed_10m)} km/h` : undefined],
    ["Gust", current ? `${Math.round(current.wind_gusts_10m)} km/h` : undefined],
    ["Rain", current ? `${current.precipitation.toFixed(1)} mm` : undefined],
    ["Humidity", current ? `${Math.round(current.relative_humidity_2m)}%` : undefined],
    ["Pressure", current ? `${Math.round(current.pressure_msl)} hPa` : undefined],
    ["Cloud cover", current ? `${Math.round(current.cloud_cover)}%` : undefined],
    ["Visibility", current ? `${Math.round(current.visibility / 1000)} km` : undefined],
    ["UV index", current ? current.uv_index.toFixed(1) : undefined],
    ["AQI", location.airQuality?.us_aqi !== undefined ? Math.round(location.airQuality.us_aqi) : undefined],
    ["Updated", location.fetchedAt ? new Date(location.fetchedAt).toLocaleTimeString() : undefined]
  ]);
}

function localizedNameExpression(language: string) {
  const fields =
    language === "en"
      ? ["name:en", "name_en", "name:latin", "name_latin", "name", "name:nonlatin", "name_nonlatin"]
      : [
          `name:${language}`,
          `name_${language}`,
          "name:en",
          "name_en",
          "name:latin",
          "name_latin",
          "name",
          "name:nonlatin",
          "name_nonlatin"
        ];

  return ["coalesce", ...fields.map((field) => ["get", field])];
}

function isNameTextField(value: unknown) {
  return JSON.stringify(value)?.includes("name") ?? false;
}

function applyBaseMapLanguage(map: MapLibreMap, language: string) {
  const apply = () => {
    const layers = map.getStyle().layers ?? [];
    layers.forEach((layer) => {
      const layout = "layout" in layer ? (layer.layout as Record<string, unknown> | undefined) : undefined;
      const textField = layout?.["text-field"];
      if (layer.type !== "symbol" || !isNameTextField(textField)) return;

      try {
        map.setLayoutProperty(layer.id, "text-field", localizedNameExpression(language));
      } catch {
        // Some style layers can briefly be unavailable while MapLibre swaps style data.
      }
    });
  };

  if (map.isStyleLoaded()) {
    apply();
    return;
  }

  map.once("load", apply);
  map.once("styledata", apply);
}

function makeTemperatureLayer(points: WeatherGridPoint[], includeLocalTime = false) {
  const surfaceGrid = makeSurfaceGrid(points);

  interface TemperatureLayerInternal extends L.Layer {
    _canvas?: HTMLCanvasElement;
    _tooltip?: HTMLDivElement;
    _weatherMap?: L.Map;
    _hideHover: () => void;
    _moveHover: (event: L.LeafletMouseEvent) => void;
    _reset: () => void;
  }

  const CanvasLayer = L.Layer.extend({
    onAdd(this: TemperatureLayerInternal, map: L.Map) {
      this._weatherMap = map;
      this._canvas = L.DomUtil.create("canvas", "temperature-canvas") as HTMLCanvasElement;
      this._canvas.style.pointerEvents = "none";
      this._tooltip = L.DomUtil.create("div", "map-hover-tooltip temperature") as HTMLDivElement;
      map.getPanes().overlayPane.appendChild(this._canvas);
      map.getPanes().tooltipPane.appendChild(this._tooltip);
      map.on("moveend zoomend resize", (this as unknown as { _reset: () => void })._reset, this);
      map.on("mousemove", (this as unknown as { _moveHover: (event: L.LeafletMouseEvent) => void })._moveHover, this);
      map.on("mouseout movestart zoomstart", (this as unknown as { _hideHover: () => void })._hideHover, this);
      (this as unknown as { _reset: () => void })._reset();
    },
    onRemove(this: TemperatureLayerInternal) {
      if (this._canvas?.parentNode) this._canvas.parentNode.removeChild(this._canvas);
      if (this._tooltip?.parentNode) this._tooltip.parentNode.removeChild(this._tooltip);
      this._weatherMap?.off("moveend zoomend resize", (this as unknown as { _reset: () => void })._reset, this);
      this._weatherMap?.off("mousemove", (this as unknown as { _moveHover: (event: L.LeafletMouseEvent) => void })._moveHover, this);
      this._weatherMap?.off("mouseout movestart zoomstart", (this as unknown as { _hideHover: () => void })._hideHover, this);
    },
    _hideHover(this: TemperatureLayerInternal) {
      if (this._tooltip) this._tooltip.classList.remove("visible");
    },
    _moveHover(this: TemperatureLayerInternal, event: L.LeafletMouseEvent) {
      if (!this._weatherMap || !this._tooltip || surfaceGrid.size === 0) return;
      const map = this._weatherMap;
      const sample = interpolatedSurfaceSample(surfaceGrid, event.latlng.lat, event.latlng.lng);
      if (!sample) {
        this._hideHover();
        return;
      }

      positionHoverReadout(map, event, this._tooltip);
      this._tooltip.innerHTML = `<strong>${Math.round(sample.temperature)}\u00b0C</strong>${includeLocalTime ? `<span>${localTimeSummary(event.latlng.lat, event.latlng.lng, Date.now())}</span>` : ""}<em>${event.latlng.lat.toFixed(1)}°, ${normalizeLongitude(event.latlng.lng).toFixed(1)}°</em>`;
      showHoverReadout(this._tooltip);
    },
    _reset(this: TemperatureLayerInternal) {
      if (!this._weatherMap || !this._canvas) return;
      const map = this._weatherMap;
      const canvas = this._canvas;
      const size = map.getSize();
      const topLeft = map.containerPointToLayerPoint([0, 0]);
      const scale = surfaceRasterScale(size, map.getZoom());
      const width = Math.max(1, Math.ceil(size.x * scale));
      const height = Math.max(1, Math.ceil(size.y * scale));
      L.DomUtil.setPosition(canvas, topLeft);
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = `${size.x}px`;
      canvas.style.height = `${size.y}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.imageSmoothingEnabled = true;
      ctx.clearRect(0, 0, width, height);

      if (surfaceGrid.size === 0) return;

      const image = ctx.createImageData(width, height);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const latLng = map.containerPointToLatLng([(x + 0.5) / scale, (y + 0.5) / scale]);
          const sample = interpolatedSurfaceSample(surfaceGrid, latLng.lat, latLng.lng);
          const temp = sample?.temperature ?? 0;
          const rgb = temperatureRgb(temp);
          const index = (y * width + x) * 4;
          image.data[index] = rgb[0];
          image.data[index + 1] = rgb[1];
          image.data[index + 2] = rgb[2];
          image.data[index + 3] = 116;
        }
      }

      ctx.putImageData(image, 0, 0);
    }
  });

  return new CanvasLayer();
}

interface SurfaceSample {
  temperature: number;
  weatherCode: number;
  windSpeed: number;
  windGust: number;
  precipitation: number;
  pressure: number;
  cloudCover: number;
}

function makeSurfaceGrid(points: WeatherGridPoint[]) {
  const grid = new Map<string, SurfaceSample>();
  points.forEach((point) => {
    grid.set(surfaceGridKey(point.lat, point.lon), {
      temperature: point.temperature,
      weatherCode: point.weatherCode,
      windSpeed: point.windSpeed,
      windGust: point.windGust,
      precipitation: point.precipitation,
      pressure: point.pressure,
      cloudCover: point.cloudCover ?? 0
    });
  });
  return grid;
}

function surfaceGridKey(lat: number, lon: number) {
  return `${Math.round(lat)}:${Math.round(normalizeLongitude(lon))}`;
}

function surfaceRasterScale(size: L.Point, zoom: number) {
  const desired = Math.max(0.42, Math.min(0.76, 0.36 + zoom * 0.045));
  const maxScale = Math.sqrt(SURFACE_RASTER_MAX_PIXELS / Math.max(1, size.x * size.y));
  return Math.max(0.36, Math.min(desired, maxScale));
}

function gridCell(lat: number, lon: number) {
  const clampedLat = Math.max(SURFACE_GRID_MIN_LAT, Math.min(SURFACE_GRID_MAX_LAT, lat));
  const normalizedLon = normalizeLongitude(lon);
  const south =
    clampedLat >= SURFACE_GRID_MAX_LAT
      ? SURFACE_GRID_MAX_LAT - SURFACE_GRID_STEP
      : Math.floor(clampedLat / SURFACE_GRID_STEP) * SURFACE_GRID_STEP;
  const north = Math.min(SURFACE_GRID_MAX_LAT, south + SURFACE_GRID_STEP);
  const latRatio = north === south ? 0 : (clampedLat - south) / (north - south);

  const shiftedLon = normalizedLon + 180;
  const west = -180 + Math.floor(shiftedLon / SURFACE_GRID_STEP) * SURFACE_GRID_STEP;
  const east = west + SURFACE_GRID_STEP >= 180 ? -180 : west + SURFACE_GRID_STEP;
  const lonRatio = (shiftedLon - Math.floor(shiftedLon / SURFACE_GRID_STEP) * SURFACE_GRID_STEP) / SURFACE_GRID_STEP;

  return { south, north, west, east, latRatio, lonRatio };
}

function interpolatedSurfaceSample(grid: Map<string, SurfaceSample>, lat: number, lon: number): SurfaceSample | undefined {
  const { south, north, west, east, latRatio, lonRatio } = gridCell(lat, lon);
  const southwest = readSurfaceGrid(grid, south, west);
  const southeast = readSurfaceGrid(grid, south, east);
  const northwest = readSurfaceGrid(grid, north, west);
  const northeast = readSurfaceGrid(grid, north, east);

  if (!southwest || !southeast || !northwest || !northeast) return nearestSurfaceSample(grid, lat, lon);

  const interpolate = (key: keyof Omit<SurfaceSample, "weatherCode">) => {
    const southValue = lerp(southwest[key], southeast[key], lonRatio);
    const northValue = lerp(northwest[key], northeast[key], lonRatio);
    return lerp(southValue, northValue, latRatio);
  };

  return {
    temperature: interpolate("temperature"),
    weatherCode: nearestSurfaceSample(grid, lat, lon)?.weatherCode ?? southwest.weatherCode,
    windSpeed: interpolate("windSpeed"),
    windGust: interpolate("windGust"),
    precipitation: interpolate("precipitation"),
    pressure: interpolate("pressure"),
    cloudCover: interpolate("cloudCover")
  };
}

function readSurfaceGrid(grid: Map<string, SurfaceSample>, lat: number, lon: number) {
  return grid.get(surfaceGridKey(lat, lon));
}

function nearestSurfaceSample(grid: Map<string, SurfaceSample>, lat: number, lon: number) {
  return nearestSurfacePoint(grid, lat, lon)?.sample;
}

function nearestSurfacePoint(grid: Map<string, SurfaceSample>, lat: number, lon: number) {
  const nearestLat = Math.max(
    SURFACE_GRID_MIN_LAT,
    Math.min(SURFACE_GRID_MAX_LAT, Math.round(lat / SURFACE_GRID_STEP) * SURFACE_GRID_STEP)
  );
  const normalizedLon = normalizeLongitude(lon);
  const nearestLon = normalizeLongitude(Math.round(normalizedLon / SURFACE_GRID_STEP) * SURFACE_GRID_STEP);
  const sample = readSurfaceGrid(grid, nearestLat, nearestLon);
  if (!sample) return undefined;

  const visibleLon = nearestLon + Math.round((lon - nearestLon) / 360) * 360;
  return { lat: nearestLat, lon: visibleLon, sample };
}

function lerp(start: number, end: number, ratio: number) {
  return start + (end - start) * ratio;
}

function positionHoverReadout(map: L.Map, event: L.LeafletMouseEvent, tooltip: HTMLDivElement) {
  const offsetX = event.containerPoint.x > map.getSize().x - 190 ? -172 : 16;
  const tooltipPoint = map.containerPointToLayerPoint(event.containerPoint.add([offsetX, -18]));
  L.DomUtil.setPosition(tooltip, tooltipPoint);
}

function showHoverReadout(tooltip: HTMLDivElement) {
  tooltip.classList.add("visible");
}

function hideHoverReadout(tooltip?: HTMLDivElement) {
  tooltip?.classList.remove("visible");
}

function localTimeSummary(lat: number, lon: number, timestamp: number) {
  const local = localTimeInfo(lon, timestamp);
  return `${local.time} ${local.offsetLabel} · ${localLightLabel(lat, lon, timestamp)}`;
}

function localTimeHoverContent(lat: number, lon: number, timestamp: number) {
  const local = localTimeInfo(lon, timestamp);
  return `<strong>${local.time}</strong><span>${local.offsetLabel} · ${localLightLabel(lat, lon, timestamp)}</span><em>${lat.toFixed(1)}°, ${normalizeLongitude(lon).toFixed(1)}°</em>`;
}

function localTimeInfo(lon: number, timestamp: number) {
  const offsetMinutes = Math.round(normalizeLongitude(lon) / 15) * 60;
  const local = new Date(timestamp + offsetMinutes * 60_000);
  const hours = `${local.getUTCHours()}`.padStart(2, "0");
  const minutes = `${local.getUTCMinutes()}`.padStart(2, "0");
  return {
    time: `${hours}:${minutes}`,
    offsetLabel: formatUtcOffset(offsetMinutes)
  };
}

function formatUtcOffset(offsetMinutes: number) {
  if (offsetMinutes === 0) return "UTC";
  const sign = offsetMinutes > 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;
  return `UTC${sign}${hours}${minutes ? `:${`${minutes}`.padStart(2, "0")}` : ""}`;
}

function localLightLabel(lat: number, lon: number, timestamp: number) {
  const altitude = solarAltitude(lat, normalizeLongitude(lon), solarPosition(timestamp));
  if (altitude > 0) return "Day";
  if (altitude > -6) return "Twilight";
  return "Night";
}

function makeLocalTimeHoverLayer() {
  interface LocalTimeLayerInternal extends L.Layer {
    _tooltip?: HTMLDivElement;
    _weatherMap?: L.Map;
    _hideHover: () => void;
    _moveHover: (event: L.LeafletMouseEvent) => void;
  }

  const LocalTimeLayer = L.Layer.extend({
    onAdd(this: LocalTimeLayerInternal, map: L.Map) {
      this._weatherMap = map;
      this._tooltip = L.DomUtil.create("div", "map-hover-tooltip local-time") as HTMLDivElement;
      map.getPanes().tooltipPane.appendChild(this._tooltip);
      map.on("mousemove", this._moveHover, this);
      map.on("mouseout movestart zoomstart", this._hideHover, this);
    },
    onRemove(this: LocalTimeLayerInternal) {
      if (this._tooltip?.parentNode) this._tooltip.parentNode.removeChild(this._tooltip);
      this._weatherMap?.off("mousemove", this._moveHover, this);
      this._weatherMap?.off("mouseout movestart zoomstart", this._hideHover, this);
    },
    _hideHover(this: LocalTimeLayerInternal) {
      hideHoverReadout(this._tooltip);
    },
    _moveHover(this: LocalTimeLayerInternal, event: L.LeafletMouseEvent) {
      if (!this._weatherMap || !this._tooltip) return;
      positionHoverReadout(this._weatherMap, event, this._tooltip);
      this._tooltip.innerHTML = localTimeHoverContent(event.latlng.lat, event.latlng.lng, Date.now());
      showHoverReadout(this._tooltip);
    }
  });

  return new LocalTimeLayer();
}

interface RadarPixelSample {
  weatherType: string;
  rainfall: string;
  intensity: string;
  confidence: string;
}

function makeRainRadarLayer(rainViewer: RainViewerState, frame: RainFrame, includeLocalTime = false) {
  const tileLayer = L.tileLayer(`${rainViewer.host}${frame.path}/512/{z}/{x}/{y}/2/1_1.png`, {
    opacity: 0.78,
    maxNativeZoom: 7,
    maxZoom: 9,
    noWrap: false,
    keepBuffer: 4,
    crossOrigin: true,
    attribution: 'Weather data by <a href="https://www.rainviewer.com/" target="_blank" rel="noreferrer">RainViewer</a>'
  });

  interface RainRadarLayerInternal extends L.Layer {
    _tileLayer?: L.TileLayer;
    _tooltip?: HTMLDivElement;
    _weatherMap?: L.Map;
    _tileCache?: Map<string, Promise<ImageData | undefined>>;
    _hoverSerial?: number;
    _hideHover: () => void;
    _moveHover: (event: L.LeafletMouseEvent) => void;
  }

  const RainRadarLayer = L.Layer.extend({
    onAdd(this: RainRadarLayerInternal, map: L.Map) {
      this._weatherMap = map;
      this._tileLayer = tileLayer.addTo(map);
      this._tileCache = new Map();
      this._hoverSerial = 0;
      this._tooltip = L.DomUtil.create("div", "map-hover-tooltip radar") as HTMLDivElement;
      map.getPanes().tooltipPane.appendChild(this._tooltip);
      map.on("mousemove", this._moveHover, this);
      map.on("mouseout movestart zoomstart", this._hideHover, this);
    },
    onRemove(this: RainRadarLayerInternal) {
      if (this._tileLayer && this._weatherMap) this._weatherMap.removeLayer(this._tileLayer);
      if (this._tooltip?.parentNode) this._tooltip.parentNode.removeChild(this._tooltip);
      this._weatherMap?.off("mousemove", this._moveHover, this);
      this._weatherMap?.off("mouseout movestart zoomstart", this._hideHover, this);
      this._tileCache?.clear();
    },
    _hideHover(this: RainRadarLayerInternal) {
      this._hoverSerial = (this._hoverSerial ?? 0) + 1;
      hideHoverReadout(this._tooltip);
    },
    _moveHover(this: RainRadarLayerInternal, event: L.LeafletMouseEvent) {
      if (!this._weatherMap || !this._tooltip) return;
      const lookup = radarTileLookup(this._weatherMap, rainViewer, frame, event.latlng);
      const serial = (this._hoverSerial ?? 0) + 1;
      this._hoverSerial = serial;
      positionHoverReadout(this._weatherMap, event, this._tooltip);
      this._tooltip.innerHTML = radarHoverContent(undefined, frame, event.latlng.lat, event.latlng.lng, includeLocalTime ? Date.now() : undefined);
      showHoverReadout(this._tooltip);

      void sampleRadarTile(lookup, this._tileCache ?? new Map()).then((sample) => {
        if (this._hoverSerial !== serial || !this._tooltip || !this._weatherMap) return;
        positionHoverReadout(this._weatherMap, event, this._tooltip);
        this._tooltip.innerHTML = radarHoverContent(sample, frame, event.latlng.lat, event.latlng.lng, includeLocalTime ? Date.now() : undefined);
        showHoverReadout(this._tooltip);
      });
    }
  });

  return new RainRadarLayer();
}

function radarTileLookup(map: L.Map, rainViewer: RainViewerState, frame: RainFrame, latLng: L.LatLng) {
  const z = Math.max(0, Math.min(7, Math.floor(map.getZoom())));
  const tileCount = 2 ** z;
  const lat = Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, latLng.lat));
  const lon = normalizeLongitude(latLng.lng);
  const xFloat = ((lon + 180) / 360) * tileCount;
  const latRad = (lat * Math.PI) / 180;
  const yFloat = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * tileCount;
  const rawX = Math.floor(xFloat);
  const x = ((rawX % tileCount) + tileCount) % tileCount;
  const y = Math.max(0, Math.min(tileCount - 1, Math.floor(yFloat)));
  const pixelX = Math.max(0, Math.min(511, Math.floor((xFloat - rawX) * 512)));
  const pixelY = Math.max(0, Math.min(511, Math.floor((yFloat - y) * 512)));
  const url = `${rainViewer.host}${frame.path}/512/${z}/${x}/${y}/2/1_1.png`;
  return { url, pixelX, pixelY };
}

async function sampleRadarTile(
  lookup: ReturnType<typeof radarTileLookup>,
  cache: Map<string, Promise<ImageData | undefined>>
): Promise<RadarPixelSample | null> {
  if (!cache.has(lookup.url)) {
    if (cache.size > 72) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey) cache.delete(oldestKey);
    }
    cache.set(lookup.url, loadRadarImageData(lookup.url));
  }

  const image = await cache.get(lookup.url);
  if (!image) return null;

  const index = (lookup.pixelY * image.width + lookup.pixelX) * 4;
  return classifyRadarPixel(image.data[index], image.data[index + 1], image.data[index + 2], image.data[index + 3]);
}

function loadRadarImageData(url: string): Promise<ImageData | undefined> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth || 512;
      canvas.height = image.naturalHeight || 512;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        resolve(undefined);
        return;
      }
      try {
        ctx.drawImage(image, 0, 0);
        resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
      } catch {
        resolve(undefined);
      }
    };
    image.onerror = () => resolve(undefined);
    image.src = url;
  });
}

function classifyRadarPixel(red: number, green: number, blue: number, alpha: number): RadarPixelSample {
  if (alpha < 18 || red + green + blue < 28) {
    return {
      weatherType: "No rain detected",
      rainfall: "0 mm/h",
      intensity: "Dry",
      confidence: "Radar pixel is transparent"
    };
  }

  const { hue, saturation, value } = rgbToHsv(red, green, blue);
  if (saturation < 0.18 && value < 0.55) {
    return {
      weatherType: "No clear return",
      rainfall: "0-0.2 mm/h",
      intensity: "Trace",
      confidence: "Low radar color"
    };
  }

  if (hue >= 250 && hue <= 330) {
    return { weatherType: "Intense precipitation", rainfall: "30+ mm/h", intensity: "Extreme", confidence: "Estimated from tile color" };
  }

  if (hue < 22 || hue > 345) {
    return { weatherType: "Very heavy rain", rainfall: "18-30 mm/h", intensity: "Severe", confidence: "Estimated from tile color" };
  }

  if (hue < 45) {
    return { weatherType: "Heavy rain", rainfall: "8-18 mm/h", intensity: "Heavy", confidence: "Estimated from tile color" };
  }

  if (hue < 70) {
    return { weatherType: "Moderate rain", rainfall: "3-8 mm/h", intensity: "Moderate", confidence: "Estimated from tile color" };
  }

  if (hue < 170) {
    return { weatherType: "Rain", rainfall: "1-3 mm/h", intensity: "Light", confidence: "Estimated from tile color" };
  }

  if (blue > red + 35 && blue > green + 10) {
    return { weatherType: "Light rain or snow", rainfall: "0.2-1 mm/h", intensity: "Light", confidence: "Estimated from tile color" };
  }

  return { weatherType: "Precipitation", rainfall: "0.2-2 mm/h", intensity: "Light", confidence: "Estimated from tile color" };
}

function rgbToHsv(red: number, green: number, blue: number) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;

  if (delta !== 0) {
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    if (max === g) hue = 60 * ((b - r) / delta + 2);
    if (max === b) hue = 60 * ((r - g) / delta + 4);
  }

  if (hue < 0) hue += 360;
  return {
    hue,
    saturation: max === 0 ? 0 : delta / max,
    value: max
  };
}

function radarHoverContent(sample: RadarPixelSample | null | undefined, frame: RainFrame, lat: number, lon: number, timestamp?: number) {
  const frameTime = new Date(frame.time * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const localTimeRow = timestamp !== undefined ? `<span>Local time</span><b>${localTimeSummary(lat, lon, timestamp)}</b>` : "";
  if (!sample) {
    const title = sample === null ? "Radar sample unavailable" : "Reading radar";
    const note = sample === null ? "Provider tile could not be sampled" : `${lat.toFixed(1)}°, ${normalizeLongitude(lon).toFixed(1)}°`;
    return `<strong>${title}</strong><div class="hover-metrics">
      <span>Rainfall</span><b>--</b>
      <span>Frame</span><b>${frameTime}</b>
      ${localTimeRow}
    </div><em>${note}</em>`;
  }

  return `<strong>${sample.weatherType}</strong><div class="hover-metrics">
    <span>Rainfall</span><b>${sample.rainfall}</b>
    <span>Intensity</span><b>${sample.intensity}</b>
    <span>Frame</span><b>${frameTime}</b>
    ${localTimeRow}
  </div><em>${sample.confidence} at ${lat.toFixed(1)}°, ${normalizeLongitude(lon).toFixed(1)}°</em>`;
}

function makeTimezoneLayer() {
  const group = L.layerGroup();
  WORLD_COPY_OFFSETS.forEach((copyOffset) => {
    for (let lon = -180; lon <= 180; lon += 15) {
      const offset = lon === 180 ? 12 : Math.round(lon / 15);
      const label = offset === 0 ? "UTC" : `UTC${offset > 0 ? "+" : ""}${offset}`;
      const weight = lon === 0 || Math.abs(lon) === 180 ? 2 : 1;
      const color = lon === 0 ? "#f7d56f" : Math.abs(lon) === 180 ? "#e36f6f" : "#f6f7fb";
      const wrappedLon = lon + copyOffset;
      L.polyline(
        [
          [-82, wrappedLon],
          [82, wrappedLon]
        ],
        {
          color,
          weight,
          opacity: lon === 0 || Math.abs(lon) === 180 ? 0.72 : 0.28,
          dashArray: lon === 0 || Math.abs(lon) === 180 ? undefined : "5 10",
          interactive: false
        }
      ).addTo(group);
      L.marker([73, wrappedLon], {
        icon: L.divIcon({
          className: "timezone-label",
          html: `<span>${label}</span>`,
          iconSize: [58, 22],
          iconAnchor: [29, 11]
        }),
        interactive: false
      }).addTo(group);
    }

    L.polyline(
      [
        [0, -180 + copyOffset],
        [0, 180 + copyOffset]
      ],
      { color: "#f6f7fb", weight: 1, opacity: 0.35, interactive: false }
    ).addTo(group);
  });

  return group;
}

function normalizeLongitude(lon: number) {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

function solarPosition(timestamp: number) {
  const rad = Math.PI / 180;
  const day = timestamp / 86400000 - 0.5 + 2440588 - 2451545;
  const meanAnomaly = rad * (357.5291 + 0.98560028 * day);
  const equation =
    rad *
    (1.9148 * Math.sin(meanAnomaly) +
      0.02 * Math.sin(2 * meanAnomaly) +
      0.0003 * Math.sin(3 * meanAnomaly));
  const perihelion = rad * 102.9372;
  const eclipticLongitude = meanAnomaly + equation + perihelion + Math.PI;
  const obliquity = rad * 23.4397;
  const declination = Math.asin(Math.sin(eclipticLongitude) * Math.sin(obliquity));
  const rightAscension = Math.atan2(Math.sin(eclipticLongitude) * Math.cos(obliquity), Math.cos(eclipticLongitude));
  const sidereal = rad * (280.16 + 360.9856235 * day);
  const subsolarLongitude = normalizeLongitude(((rightAscension - sidereal) / rad));

  return {
    declination,
    subsolarLongitude
  };
}

function makeTerminatorSegments(timestamp: number) {
  const { declination, subsolarLongitude } = solarPosition(timestamp);
  const rad = Math.PI / 180;
  const segments: L.LatLngExpression[][] = [[]];
  const tanDeclination = Math.tan(declination);

  if (Math.abs(tanDeclination) < 0.01) {
    const west = normalizeLongitude(subsolarLongitude - 90);
    const east = normalizeLongitude(subsolarLongitude + 90);
    return [
      [
        [-85, west],
        [85, west]
      ],
      [
        [-85, east],
        [85, east]
      ]
    ] as L.LatLngExpression[][];
  }

  for (let lon = -180; lon <= 180; lon += 1.5) {
    const hourAngle = (lon - subsolarLongitude) * rad;
    const lat = Math.atan(-Math.cos(hourAngle) / tanDeclination) / rad;
    const clamped = Math.max(-85, Math.min(85, lat));
    const current = segments[segments.length - 1];
    const previous = current[current.length - 1] as [number, number] | undefined;

    if (previous && Math.abs(previous[0] - clamped) > 80) {
      segments.push([]);
    }

    segments[segments.length - 1].push([clamped, lon]);
  }

  return segments.filter((segment) => segment.length > 1);
}

function makeDayNightLayer(timestamp: number) {
  interface DayNightLayerInternal extends L.Layer {
    _canvas?: HTMLCanvasElement;
    _weatherMap?: L.Map;
    _reset: () => void;
  }

  const position = solarPosition(timestamp);
  const NightMaskLayer = L.Layer.extend({
    onAdd(this: DayNightLayerInternal, map: L.Map) {
      this._weatherMap = map;
      this._canvas = L.DomUtil.create("canvas", "day-night-canvas") as HTMLCanvasElement;
      this._canvas.style.pointerEvents = "none";
      map.getPanes().overlayPane.appendChild(this._canvas);
      map.on("moveend zoomend resize", this._reset, this);
      this._reset();
    },
    onRemove(this: DayNightLayerInternal) {
      if (this._canvas?.parentNode) this._canvas.parentNode.removeChild(this._canvas);
      this._weatherMap?.off("moveend zoomend resize", this._reset, this);
    },
    _reset(this: DayNightLayerInternal) {
      if (!this._weatherMap || !this._canvas) return;
      const map = this._weatherMap;
      const canvas = this._canvas;
      const size = map.getSize();
      const topLeft = map.containerPointToLayerPoint([0, 0]);
      const sampleScale = 0.5;
      const width = Math.max(1, Math.ceil(size.x * sampleScale));
      const height = Math.max(1, Math.ceil(size.y * sampleScale));

      L.DomUtil.setPosition(canvas, topLeft);
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = `${size.x}px`;
      canvas.style.height = `${size.y}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const image = ctx.createImageData(width, height);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const containerPoint = [(x + 0.5) / sampleScale, (y + 0.5) / sampleScale] as L.PointExpression;
          const latLng = map.containerPointToLatLng(containerPoint);
          const altitude = solarAltitude(latLng.lat, normalizeLongitude(latLng.lng), position);
          const darkness = smoothstep(0, 16, -altitude);
          if (darkness <= 0) continue;

          const index = (y * width + x) * 4;
          image.data[index] = 4;
          image.data[index + 1] = 8;
          image.data[index + 2] = 18;
          image.data[index + 3] = Math.round(178 * darkness);
        }
      }

      ctx.putImageData(image, 0, 0);
    }
  });

  return new NightMaskLayer();
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function solarAltitude(lat: number, lon: number, position: ReturnType<typeof solarPosition>) {
  const rad = Math.PI / 180;
  const latitude = Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, lat)) * rad;
  const hourAngle = normalizeLongitude(lon - position.subsolarLongitude) * rad;
  const altitude = Math.asin(
    Math.sin(latitude) * Math.sin(position.declination) +
      Math.cos(latitude) * Math.cos(position.declination) * Math.cos(hourAngle)
  );
  return (altitude * 180) / Math.PI;
}

function makeEarthquakeLayer(earthquakes: EarthquakeEvent[]) {
  const group = L.layerGroup();

  earthquakes.forEach((quake) => {
    const magnitude = quake.magnitude ?? 0;
    const color = quake.tsunami || quake.alert === "red" ? "#ef4444" : magnitude >= 5 ? "#f59e0b" : "#38bdf8";
    WORLD_COPY_OFFSETS.forEach((copyOffset) => {
      L.circleMarker([quake.lat, quake.lon + copyOffset], {
        radius: Math.max(4, magnitude * 2.4),
        color: "#0f172a",
        weight: 1,
        fillColor: color,
        fillOpacity: 0.86,
        opacity: 0.95
      })
        .bindPopup(
          popupTable([
            ["Actual magnitude", quake.magnitude !== undefined ? quake.magnitude.toFixed(1) : "Unavailable"],
            ["Place", quake.place],
            ["Depth", quake.depth !== undefined ? `${quake.depth.toFixed(1)} km` : "Unavailable"],
            ["Perceived shaking", quake.feltIntensity !== undefined ? `${quake.feltIntensity.toFixed(1)} CDI` : undefined],
            [
              "Estimated shaking",
              quake.instrumentalIntensity !== undefined ? `${quake.instrumentalIntensity.toFixed(1)} MMI` : undefined
            ],
            ["Felt reports", quake.feltReports !== undefined ? Math.round(quake.feltReports).toLocaleString() : undefined],
            ["Time", new Date(quake.time).toLocaleString()],
            ["Tsunami", quake.tsunami ? "Yes" : "No"],
            ["Source", escapeHtml(quake.sourceLabel ?? "Earthquake feed")],
            ["Details", `<a href="${quake.url}" target="_blank" rel="noreferrer">Open report</a>`]
          ])
        )
        .addTo(group);
    });
  });

  return group;
}

interface SeismicHoverTarget {
  quake: EarthquakeEvent;
  lat: number;
  lon: number;
  radius: number;
}

function makeSeismicActivityLayer(earthquakes: EarthquakeEvent[], includeLocalTime = false) {
  const group = L.layerGroup();
  const now = Date.now();
  const targets: SeismicHoverTarget[] = [];

  earthquakes.forEach((quake) => {
    const magnitude = quake.magnitude ?? 2.5;
    const ageHours = Math.max(0, (now - quake.time) / 3_600_000);
    const ageFade = Math.max(0.32, 1 - ageHours / 32);
    const radius = seismicMovementRadiusMeters(magnitude);
    const color = quake.tsunami || quake.alert === "red" ? "#ef4444" : magnitude >= 5 ? "#f59e0b" : "#8b5cf6";

    WORLD_COPY_OFFSETS.forEach((copyOffset) => {
      L.circle([quake.lat, quake.lon + copyOffset], {
        radius,
        interactive: false,
        stroke: false,
        fillColor: color,
        fillOpacity: Math.min(0.2, (0.055 + magnitude * 0.018) * ageFade)
      }).addTo(group);
      targets.push({ quake, lat: quake.lat, lon: quake.lon + copyOffset, radius });
    });
  });

  interface SeismicActivityLayerInternal extends L.Layer {
    _group?: L.LayerGroup;
    _tooltip?: HTMLDivElement;
    _weatherMap?: L.Map;
    _hideHover: () => void;
    _moveHover: (event: L.LeafletMouseEvent) => void;
  }

  const SeismicActivityLayer = L.Layer.extend({
    onAdd(this: SeismicActivityLayerInternal, map: L.Map) {
      this._weatherMap = map;
      this._group = group.addTo(map);
      this._tooltip = L.DomUtil.create("div", "map-hover-tooltip seismic") as HTMLDivElement;
      map.getPanes().tooltipPane.appendChild(this._tooltip);
      map.on("mousemove", this._moveHover, this);
      map.on("movestart zoomstart", this._hideHover, this);
    },
    onRemove(this: SeismicActivityLayerInternal) {
      if (this._group && this._weatherMap) this._weatherMap.removeLayer(this._group);
      if (this._tooltip?.parentNode) this._tooltip.parentNode.removeChild(this._tooltip);
      this._weatherMap?.off("mousemove", this._moveHover, this);
      this._weatherMap?.off("movestart zoomstart", this._hideHover, this);
    },
    _hideHover(this: SeismicActivityLayerInternal) {
      hideHoverReadout(this._tooltip);
    },
    _moveHover(this: SeismicActivityLayerInternal, event: L.LeafletMouseEvent) {
      if (!this._weatherMap || !this._tooltip) return;
      const target = nearestSeismicHoverTarget(this._weatherMap, event.containerPoint, targets);
      if (!target) {
        this._hideHover();
        return;
      }

      positionHoverReadout(this._weatherMap, event, this._tooltip);
      this._tooltip.innerHTML = seismicHoverContent(target.quake, includeLocalTime ? Date.now() : undefined);
      showHoverReadout(this._tooltip);
    }
  });

  return new SeismicActivityLayer();
}

function nearestSeismicHoverTarget(map: L.Map, point: L.Point, targets: SeismicHoverTarget[]) {
  let best: { target: SeismicHoverTarget; score: number } | undefined;

  targets.forEach((target) => {
    const center = map.latLngToContainerPoint([target.lat, target.lon]);
    const radius = seismicHoverRadiusPx(map, target);
    const score = point.distanceTo(center) / radius;
    if (score <= 1 && (!best || score < best.score)) {
      best = { target, score };
    }
  });

  return best?.target;
}

function seismicHoverRadiusPx(map: L.Map, target: SeismicHoverTarget) {
  const centerLatLng = L.latLng(target.lat, target.lon);
  const centerPoint = map.latLngToContainerPoint(centerLatLng);
  const edgeLatLng = map.containerPointToLatLng(centerPoint.add([1, 0]));
  const metersPerPixel = Math.max(1, centerLatLng.distanceTo(edgeLatLng));
  return target.radius / metersPerPixel;
}

function seismicMovementRadiusMeters(magnitude: number) {
  const clampedMagnitude = Math.max(1, Math.min(9, magnitude));
  return Math.max(16_000, Math.min(420_000, 7_000 + clampedMagnitude ** 2.08 * 4_300));
}

function seismicHoverContent(quake: EarthquakeEvent, timestamp?: number) {
  const magnitude = quake.magnitude !== undefined ? `M${quake.magnitude.toFixed(1)}` : "Magnitude unavailable";
  const time = new Date(quake.time).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
  const localTimeRow = timestamp !== undefined ? `<span>Local time</span><b>${localTimeSummary(quake.lat, quake.lon, timestamp)}</b>` : "";
  const alert = quake.tsunami ? "Tsunami signal" : quake.alert ? `${quake.alert} alert` : "No tsunami signal";

  return `<strong>${magnitude} movement</strong><div class="hover-metrics">
    <span>Depth</span><b>${quake.depth !== undefined ? `${quake.depth.toFixed(1)} km` : "--"}</b>
    <span>Felt</span><b>${quake.feltIntensity !== undefined ? `${quake.feltIntensity.toFixed(1)} CDI` : "--"}</b>
    <span>Estimated</span><b>${quake.instrumentalIntensity !== undefined ? `${quake.instrumentalIntensity.toFixed(1)} MMI` : "--"}</b>
    <span>Reports</span><b>${quake.feltReports !== undefined ? Math.round(quake.feltReports).toLocaleString() : "--"}</b>
    <span>Source</span><b>${escapeHtml(quake.sourceLabel ?? "--")}</b>
    <span>Time</span><b>${time}</b>
    ${localTimeRow}
  </div><em>${escapeHtml(alert)} · ${escapeHtml(quake.place)}</em>`;
}

function warningColor(warning: GdacsAlert) {
  const level = `${warning.levelCode ?? warning.alertLevel ?? ""}`.toLowerCase();
  if (level.includes("red") || level.includes("extreme")) return "#ef4444";
  if (level.includes("orange") || level.includes("amber") || level.includes("severe")) return "#f97316";
  if (level.includes("yellow") || level.includes("minor")) return "#facc15";
  if (level.includes("green")) return "#22c55e";
  return "#38bdf8";
}

function warningPopup(warning: GdacsAlert, appLanguage: string) {
  return popupTable([
    ["Alert", warning.title],
    ["Area", warning.areaName],
    ["Level", warning.alertLevel],
    ["Type", warning.eventType],
    ["Starts", warning.startsAt ? new Date(warning.startsAt).toLocaleString() : undefined],
    ["Ends", warning.endsAt ? new Date(warning.endsAt).toLocaleString() : undefined],
    ["Published", warning.date ? new Date(warning.date).toLocaleString() : undefined],
    ["Details", warning.description ? warningDetailHtml(warning, appLanguage) : undefined],
    ["Source", `<a href="${warning.link}" target="_blank" rel="noreferrer">${warning.sourceLabel ?? "Details"}</a>`]
  ]);
}

function warningDetailHtml(warning: GdacsAlert, appLanguage: string) {
  const detail = escapeHtml(truncateText(warning.description ?? "", 180));
  const status = shouldTranslateWarning(warning, appLanguage)
    ? '<em class="warning-translation-status" data-translation-status></em>'
    : "";
  return `<span class="warning-detail-text" data-warning-detail>${detail}</span>${status}`;
}

function bindWarningPopup(layer: L.Layer, warning: GdacsAlert, appLanguage: string) {
  layer.bindPopup(warningPopup(warning, appLanguage));
  layer.on("popupopen", (event) => {
    const popup = (event as L.PopupEvent).popup;
    void translateWarningPopup(popup.getElement(), warning, appLanguage);
  });
  return layer;
}

async function translateWarningPopup(element: HTMLElement | undefined, warning: GdacsAlert, appLanguage: string) {
  if (!element || !warning.description || !shouldTranslateWarning(warning, appLanguage)) return;
  const detail = element.querySelector<HTMLElement>("[data-warning-detail]");
  const status = element.querySelector<HTMLElement>("[data-translation-status]");
  if (!detail) return;

  status && (status.textContent = "Translating...");
  try {
    const translated = await translateWarningText(warning.description, warningSourceLanguage(warning), targetTranslationLanguage(appLanguage));
    if (!document.body.contains(element)) return;
    detail.textContent = truncateText(translated, 180);
    status && (status.textContent = "Translated");
  } catch {
    status && (status.textContent = "Original text");
  }
}

function shouldTranslateWarning(warning: GdacsAlert, appLanguage: string) {
  if (!warning.description) return false;
  const source = warningSourceLanguage(warning);
  const target = targetTranslationLanguage(appLanguage);
  if (!source || !target) return false;
  return source.split("-")[0].toLowerCase() !== target.split("-")[0].toLowerCase();
}

function warningSourceLanguage(warning: GdacsAlert) {
  return warning.sourceLanguage ?? {
    gdacs: "en",
    smhi: "en",
    nws: "en",
    "met-norway": "no",
    dwd: "de",
    hko: "en",
    jma: "ja",
    inmet: "pt"
  }[warning.source ?? ""];
}

function targetTranslationLanguage(appLanguage: string) {
  return appLanguage === "zh" ? "zh-CN" : appLanguage;
}

async function translateWarningText(text: string, sourceLanguage: string | undefined, targetLanguage: string) {
  if (!sourceLanguage) return text;
  const sourceText = text.length > 480 ? `${text.slice(0, 480)}...` : text;
  const cacheKey = warningTranslationCacheKey(sourceText, sourceLanguage, targetLanguage);
  const cached = readWarningTranslationCache(cacheKey);
  if (cached) return cached;

  const url = new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("q", sourceText);
  url.searchParams.set("langpair", `${sourceLanguage}|${targetLanguage}`);
  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`Translation failed with ${response.status}`);
  const data = await response.json() as {
    responseData?: { translatedText?: string };
    responseStatus?: number | string;
  };
  const translated = data.responseData?.translatedText?.trim();
  if (!translated || String(data.responseStatus) !== "200") throw new Error("Translation unavailable");

  writeWarningTranslationCache(cacheKey, translated);
  return translated;
}

function warningTranslationCacheKey(text: string, sourceLanguage: string, targetLanguage: string) {
  return `${WARNING_TRANSLATION_CACHE_PREFIX}:${sourceLanguage}:${targetLanguage}:${hashText(text)}`;
}

function readWarningTranslationCache(key: string) {
  try {
    return localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeWarningTranslationCache(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Translation caching is best-effort.
  }
}

function hashText(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function truncateText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function offsetGeometry(geometry: Geometry, longitudeOffset: number): Geometry {
  if (longitudeOffset === 0) return geometry;
  if (geometry.type === "GeometryCollection") {
    return {
      ...geometry,
      geometries: geometry.geometries.map((child) => offsetGeometry(child, longitudeOffset))
    };
  }

  return {
    ...geometry,
    coordinates: offsetCoordinates(geometry.coordinates, longitudeOffset) as never
  };
}

function offsetCoordinates(coordinates: unknown, longitudeOffset: number): unknown {
  if (Array.isArray(coordinates) && typeof coordinates[0] === "number") {
    const [lon, lat, ...rest] = coordinates as number[];
    return [lon + longitudeOffset, lat, ...rest];
  }

  if (Array.isArray(coordinates)) {
    return coordinates.map((coordinate) => offsetCoordinates(coordinate, longitudeOffset));
  }

  return coordinates;
}

function nearestWrappedLongitude(longitude: number, referenceLongitude: number) {
  return longitude + Math.round((referenceLongitude - longitude) / 360) * 360;
}

export function WeatherMap({
  activeLayer,
  showEarthquakes,
  showTimezones,
  showWarnings,
  showDayNight,
  showHomeMarker,
  dayNightTimestamp,
  weatherGrid,
  earthquakes,
  warnings,
  rainViewer,
  mapLanguage,
  appLanguage,
  homeFocusRequest = 0,
  selectedLocation
}: WeatherMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseLayerRef = useRef<L.MaplibreGL | null>(null);
  const activeLayerRef = useRef<L.Layer | null>(null);
  const earthquakeLayerRef = useRef<L.Layer | null>(null);
  const warningLayerRef = useRef<L.Layer | null>(null);
  const timezoneLayerRef = useRef<L.Layer | null>(null);
  const dayNightLayerRef = useRef<L.Layer | null>(null);
  const localTimeHoverLayerRef = useRef<L.Layer | null>(null);
  const locationLayerRef = useRef<L.Layer | null>(null);
  const lastHomeFocusRequestRef = useRef(0);

  const latestRainFrame = useMemo(() => {
    if (!rainViewer) return undefined;
    const frames = [...rainViewer.past, ...rainViewer.nowcast];
    return frames[frames.length - 1];
  }, [rainViewer]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      worldCopyJump: true,
      minZoom: 2,
      maxZoom: 9,
      zoomControl: false,
      maxBounds: WORLD_BOUNDS,
      maxBoundsViscosity: 0.85
    }).setView([22, 4], 2);

    L.control.zoom({ position: "bottomright" }).addTo(map);
    baseLayerRef.current = L.maplibreGL({
      style: OPENFREEMAP_STYLE_URL,
      interactive: false,
      maxZoom: 9
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const baseMap = baseLayerRef.current?.getMaplibreMap();
    if (!baseMap) return;
    applyBaseMapLanguage(baseMap, mapLanguage);
  }, [mapLanguage]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (activeLayerRef.current) {
      map.removeLayer(activeLayerRef.current);
      activeLayerRef.current = null;
    }

    let nextLayer: L.Layer | undefined;

    if (activeLayer === "temperature") {
      nextLayer = makeTemperatureLayer(weatherGrid, showDayNight);
    }

    if (activeLayer === "radar" && rainViewer && latestRainFrame) {
      nextLayer = makeRainRadarLayer(rainViewer, latestRainFrame, showDayNight);
    }

    if (activeLayer === "seismic") {
      nextLayer = makeSeismicActivityLayer(earthquakes, showDayNight);
    }

    if (nextLayer) {
      nextLayer.addTo(map);
      activeLayerRef.current = nextLayer;
    }
  }, [activeLayer, weatherGrid, rainViewer, latestRainFrame, earthquakes, showDayNight]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (earthquakeLayerRef.current) {
      map.removeLayer(earthquakeLayerRef.current);
      earthquakeLayerRef.current = null;
    }

    if (showEarthquakes) {
      earthquakeLayerRef.current = makeEarthquakeLayer(earthquakes).addTo(map);
    }
  }, [showEarthquakes, earthquakes]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (warningLayerRef.current) {
      map.removeLayer(warningLayerRef.current);
      warningLayerRef.current = null;
    }

    if (!showWarnings) return;

    const group = L.layerGroup();
    warnings
      .forEach((warning) => {
        const color = warningColor(warning);
        WORLD_COPY_OFFSETS.forEach((copyOffset) => {
          if (warning.geometry) {
            bindWarningPopup(L.geoJSON(offsetGeometry(warning.geometry, copyOffset), {
              style: {
                color,
                fillColor: color,
                fillOpacity: 0.2,
                opacity: 0.88,
                weight: 2
              }
            }), warning, appLanguage).addTo(group);
            return;
          }

          if (typeof warning.lat !== "number" || typeof warning.lon !== "number") return;

          bindWarningPopup(L.circleMarker([warning.lat, warning.lon + copyOffset], {
            radius: color === "#ef4444" ? 11 : 8,
            color: "#111827",
            weight: 1,
            fillColor: color,
            fillOpacity: 0.9
          }), warning, appLanguage).addTo(group);
        });
      });

    group.addTo(map);
    warningLayerRef.current = group;
  }, [showWarnings, warnings, appLanguage]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (timezoneLayerRef.current) {
      map.removeLayer(timezoneLayerRef.current);
      timezoneLayerRef.current = null;
    }

    if (showTimezones) {
      timezoneLayerRef.current = makeTimezoneLayer().addTo(map);
    }
  }, [showTimezones]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (dayNightLayerRef.current) {
      map.removeLayer(dayNightLayerRef.current);
      dayNightLayerRef.current = null;
    }

    if (showDayNight) {
      dayNightLayerRef.current = makeDayNightLayer(dayNightTimestamp).addTo(map);
    }
  }, [showDayNight, dayNightTimestamp]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (localTimeHoverLayerRef.current) {
      map.removeLayer(localTimeHoverLayerRef.current);
      localTimeHoverLayerRef.current = null;
    }

    if (showDayNight && activeLayer === "normal") {
      localTimeHoverLayerRef.current = makeLocalTimeHoverLayer().addTo(map);
    }
  }, [showDayNight, activeLayer]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!homeFocusRequest || homeFocusRequest === lastHomeFocusRequestRef.current) return;
    lastHomeFocusRequestRef.current = homeFocusRequest;
    if (!selectedLocation) return;

    const center = map.getCenter();
    const longitude = nearestWrappedLongitude(selectedLocation.longitude, center.lng);
    const zoom = Math.max(map.getZoom(), 7);
    map.flyTo([selectedLocation.latitude, longitude], zoom, {
      duration: 0.85,
      easeLinearity: 0.2
    });
  }, [homeFocusRequest, selectedLocation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (locationLayerRef.current) {
      map.removeLayer(locationLayerRef.current);
      locationLayerRef.current = null;
    }

    if (!selectedLocation || !showHomeMarker) return;

    const group = L.layerGroup();
    WORLD_COPY_OFFSETS.forEach((copyOffset) => {
      L.marker([selectedLocation.latitude, selectedLocation.longitude + copyOffset], {
        title: selectedLocation.name,
        icon: L.divIcon({
          className: "home-marker",
          html: HOME_MARKER_ICON,
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        })
      })
        .bindPopup(homeLocationPopup(selectedLocation))
        .addTo(group);
    });

    group.addTo(map);
    locationLayerRef.current = group;
  }, [selectedLocation, showHomeMarker]);

  return <div className="map-root" ref={containerRef} />;
}
