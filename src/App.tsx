import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  Activity,
  Bell,
  ChevronDown,
  CloudRain,
  Clock3,
  Download,
  ExternalLink,
  Globe2,
  Home,
  LocateFixed,
  Map as MapIcon,
  Moon,
  Plane,
  RefreshCw,
  Route,
  Search,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  Thermometer,
  TriangleAlert,
  Wind,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { WeatherMap } from "./components/WeatherMap";
import {
  deriveLocalSignals,
  fetchAircraftStates,
  fetchAircraftStatesByIds,
  fetchAircraftTrack,
  fetchAviationIncidents,
  fetchEarthquakes,
  fetchGdacsAlerts,
  fetchLocalWeather,
  fetchRainViewer,
  fetchRiskEvents,
  fetchTaiwanCwaRainfall,
  fetchWeatherGridWithMeta,
  getCachedAircraftStates,
  getCachedWeatherGrid,
  searchCities
} from "./services/weatherApi";
import type {
  AircraftState,
  AircraftTrack,
  AviationBounds,
  AviationIncident,
  CityLocation,
  EarthquakeEvent,
  GdacsAlert,
  LocalSignal,
  LocalWeather,
  PrimaryLayer,
  RainFrame,
  RainObservationPoint,
  RainViewerState,
  RiskSignalEvent,
  WeatherGridPoint
} from "./types";
import {
  formatRain,
  formatRainRate,
  formatTemperature,
  formatWind,
  rainIntensityLabel,
  weatherCodeLabel,
  windStrengthLabel
} from "./utils/weatherCodes";
import type { RainUnit, TemperatureUnit, UnitSettings, WindUnit } from "./utils/weatherCodes";

const LOCATION_KEY = "weather-watch:home-location";
const MAP_LANGUAGE_KEY = "weather-watch:map-language";
const APP_LANGUAGE_KEY = "weather-watch:app-language";
const VIEW_SETTINGS_KEY = "weather-watch:view-settings:v1";
const TRACKED_AIRCRAFT_KEY = "weather-watch:tracked-aircraft:v1";
const CWA_TOKEN_KEY = "weather-watch:taiwan-cwa-token:v1";
const LATEST_RELEASE_URL = "https://api.github.com/repos/Retoral/Weather-App/releases/latest";
const RELEASES_PAGE_URL = "https://github.com/Retoral/Weather-App/releases";
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const AIRCRAFT_LIMIT_OPTIONS = [150, 400, 800, 1200, 0] as const;
const REFRESH_LOCK_STALE_MS = 2 * 60 * 1000;
const LIFECYCLE_REFRESH_DEBOUNCE_MS = 10 * 1000;
const LIVE_REFRESH_MS = {
  earthquakes: 60 * 1000,
  radar: 10 * 60 * 1000,
  risk: 60 * 1000,
  aircraft: 60 * 1000,
  aviationIncidents: 10 * 60 * 1000,
  warnings: 60 * 1000,
  localWeather: 10 * 60 * 1000,
  localWeatherFresh: 9 * 60 * 1000,
  dayNight: 60 * 1000,
  focusedEarthquakes: 30 * 1000,
  focusedRadar: 10 * 60 * 1000,
  focusedRisk: 60 * 1000,
  focusedAircraft: 60 * 1000,
  focusedAviationIncidents: 5 * 60 * 1000,
  focusedWarnings: 60 * 1000,
  focusedWeatherGrid: 10 * 60 * 1000,
  activeWeatherFresh: 9 * 60 * 1000,
  backgroundWeatherFresh: 14 * 60 * 1000
};

const TRACKED_AIRCRAFT_TRACK_RETRY_MS = 2 * 60 * 1000;
const KNOWN_AIRPORTS = [
  { code: "ATL", name: "Atlanta Hartsfield-Jackson", lat: 33.6407, lon: -84.4277 },
  { code: "PEK", name: "Beijing Capital", lat: 40.0799, lon: 116.6031 },
  { code: "PVG", name: "Shanghai Pudong", lat: 31.1443, lon: 121.8083 },
  { code: "LAX", name: "Los Angeles", lat: 33.9416, lon: -118.4085 },
  { code: "ORD", name: "Chicago O'Hare", lat: 41.9742, lon: -87.9073 },
  { code: "DFW", name: "Dallas/Fort Worth", lat: 32.8998, lon: -97.0403 },
  { code: "DEN", name: "Denver", lat: 39.8561, lon: -104.6737 },
  { code: "JFK", name: "New York JFK", lat: 40.6413, lon: -73.7781 },
  { code: "SFO", name: "San Francisco", lat: 37.6213, lon: -122.379 },
  { code: "SEA", name: "Seattle-Tacoma", lat: 47.4502, lon: -122.3088 },
  { code: "YYZ", name: "Toronto Pearson", lat: 43.6777, lon: -79.6248 },
  { code: "MEX", name: "Mexico City", lat: 19.4361, lon: -99.0719 },
  { code: "GRU", name: "Sao Paulo Guarulhos", lat: -23.4356, lon: -46.4731 },
  { code: "EZE", name: "Buenos Aires Ezeiza", lat: -34.8222, lon: -58.5358 },
  { code: "LHR", name: "London Heathrow", lat: 51.47, lon: -0.4543 },
  { code: "CDG", name: "Paris Charles de Gaulle", lat: 49.0097, lon: 2.5479 },
  { code: "AMS", name: "Amsterdam Schiphol", lat: 52.3105, lon: 4.7683 },
  { code: "FRA", name: "Frankfurt", lat: 50.0379, lon: 8.5622 },
  { code: "MAD", name: "Madrid Barajas", lat: 40.4983, lon: -3.5676 },
  { code: "FCO", name: "Rome Fiumicino", lat: 41.8003, lon: 12.2389 },
  { code: "ARN", name: "Stockholm Arlanda", lat: 59.6519, lon: 17.9186 },
  { code: "CPH", name: "Copenhagen", lat: 55.618, lon: 12.6561 },
  { code: "OSL", name: "Oslo Gardermoen", lat: 60.1976, lon: 11.1004 },
  { code: "HEL", name: "Helsinki Vantaa", lat: 60.3172, lon: 24.9633 },
  { code: "IST", name: "Istanbul", lat: 41.2753, lon: 28.7519 },
  { code: "DXB", name: "Dubai", lat: 25.2532, lon: 55.3657 },
  { code: "DOH", name: "Doha Hamad", lat: 25.2731, lon: 51.6081 },
  { code: "JNB", name: "Johannesburg OR Tambo", lat: -26.1337, lon: 28.242 },
  { code: "CAI", name: "Cairo", lat: 30.1219, lon: 31.4056 },
  { code: "DEL", name: "Delhi", lat: 28.5562, lon: 77.1 },
  { code: "BOM", name: "Mumbai", lat: 19.0896, lon: 72.8656 },
  { code: "SIN", name: "Singapore Changi", lat: 1.3644, lon: 103.9915 },
  { code: "BKK", name: "Bangkok Suvarnabhumi", lat: 13.69, lon: 100.7501 },
  { code: "HKG", name: "Hong Kong", lat: 22.308, lon: 113.9185 },
  { code: "HND", name: "Tokyo Haneda", lat: 35.5494, lon: 139.7798 },
  { code: "NRT", name: "Tokyo Narita", lat: 35.7719, lon: 140.3929 },
  { code: "ICN", name: "Seoul Incheon", lat: 37.4602, lon: 126.4407 },
  { code: "SYD", name: "Sydney", lat: -33.9399, lon: 151.1753 },
  { code: "MEL", name: "Melbourne", lat: -37.669, lon: 144.841 },
  { code: "AKL", name: "Auckland", lat: -37.0082, lon: 174.785 }
];

const mapViews: Array<{ id: PrimaryLayer; label: string; icon: LucideIcon }> = [
  { id: "normal", label: "Normal", icon: MapIcon },
  { id: "temperature", label: "Temperature", icon: Thermometer },
  { id: "wind", label: "Wind Speed", icon: Wind },
  { id: "radar", label: "Rain Radar", icon: CloudRain },
  { id: "seismic", label: "Seismic Movement", icon: Activity },
  { id: "risk", label: "Risk Signals", icon: ShieldAlert }
];

const mapLanguages = [
  { id: "en", label: "English" },
  { id: "sv", label: "Swedish" },
  { id: "de", label: "German" },
  { id: "fr", label: "French" },
  { id: "es", label: "Spanish" },
  { id: "it", label: "Italian" },
  { id: "ja", label: "Japanese" },
  { id: "zh", label: "Chinese" }
];

const appLanguages = [
  { id: "en", label: "English" },
  { id: "sv", label: "Svenska" },
  { id: "de", label: "Deutsch" },
  { id: "fr", label: "Français" },
  { id: "es", label: "Español" },
  { id: "it", label: "Italiano" },
  { id: "ja", label: "日本語" },
  { id: "zh", label: "中文" }
] as const;

type AppLanguage = (typeof appLanguages)[number]["id"];
type FeedKey = "weather" | "radar" | "earthquakes" | "warnings" | "risk" | "aircraft" | "aviation";
type RefreshLockKey = "weatherGrid" | "earthquakes" | "radar" | "warnings" | "risk" | "aircraft" | "aviationIncidents";
type UpdateCheckState =
  | { status: "idle" | "checking" | "current" | "error"; checkedAt?: number; error?: string }
  | { status: "available"; latestVersion: string; url: string; checkedAt: number };

const temperatureUnitOptions: Array<{ id: TemperatureUnit; label: string }> = [
  { id: "celsius", label: "Celsius (°C)" },
  { id: "fahrenheit", label: "Fahrenheit (°F)" },
  { id: "kelvin", label: "Kelvin (K)" }
];

const windUnitOptions: Array<{ id: WindUnit; label: string }> = [
  { id: "ms", label: "Metric (m/s)" },
  { id: "kmh", label: "Metric (km/h)" },
  { id: "mph", label: "Imperial (mph)" },
  { id: "knots", label: "Sea / aviation (knots)" }
];

const rainUnitOptions: Array<{ id: RainUnit; label: string }> = [
  { id: "mm", label: "Metric (mm)" },
  { id: "in", label: "Imperial (inches)" }
];

const appCopy = {
  en: {
    all: "All",
    appLanguage: "App language",
    aqi: "AQI",
    aircraftLocations: "Airplane locations",
    aircraftTrails: "Airplane trails",
    aircraftDensity: "Aircraft density",
    aircraftOrigin: "Plane origin",
    aircraftSearch: "Aircraft search",
    aircraftSearchPlaceholder: "Flight, model, operator",
    aircraftVisible: "Visible aircraft",
    any: "Any",
    aviation: "Aviation",
    aviationIncidents: "Airplane crashes",
    hideUntrackedAircraft: "Hide untracked",
    noTrackedAircraft: "Track a plane to follow its route",
    trackedAircraft: "Tracked aircraft",
    trackedFlights: "Tracked flights",
    cityRequired: "City required for local updates",
    close: "Close",
    closeSettings: "Close settings",
    conditionLabels: {
      normal: "Normal",
      temperature: "Temperature",
      wind: "Wind Speed",
      radar: "Rain Radar",
      rainForecast: "Rain Forecast",
      seismic: "Seismic Movement",
      risk: "Risk Signals"
    },
    dayNight: "Day/night",
    desktopAlerts: "Desktop alerts",
    earthquakes: "Earthquakes",
    enableAlerts: "Enable alerts",
    fetchingConditions: "Fetching current conditions for your saved city",
    feels: "Feels",
    filters: "Filters",
    gust: "Gust",
    home: "Home",
    homeCity: "Home City",
    homeCitySettings: "Home city settings",
    homeMarker: "Home marker",
    humidity: "Humidity",
    location: "Location",
    mapLanguage: "Map language",
    mapView: "Map view",
    nightMask: "Night mask updates every minute",
    noLocalSignals: "No local anomaly signals right now",
    none: "None",
    quietLocally: "Quiet locally",
    quakes: "Quakes",
    observedEvents: "Observed",
    radarCoverage: "Hover the radar to estimate rainfall from live RainViewer tiles",
    radarExtreme: "Extreme",
    radarHeavy: "Heavy",
    radarLight: "Light",
    radarModerate: "Moderate",
    radarScaleNote: "Estimated from live radar tile color",
    radarScaleTitle: "Rain rate",
    refreshData: "Refresh data",
    refreshLocalWeather: "Refresh local weather",
    refreshing: "Refreshing",
    refreshingLower: "refreshing",
    refreshingWeather: "Refreshing weather",
    retry: "Retry",
    riskCritical: "Critical",
    riskEvents: "Risk events",
    riskHigh: "High",
    riskLegendNote: "Live GDELT conflict, protest, threat, and military reports from roughly the past hour. Heat size follows severity and article volume.",
    riskNearby: "Nearby risk signal",
    riskSignals: "Risk signals",
    riskWatch: "Watch",
    searchCity: "Search city",
    searchLocation: "Search location",
    searching: "Searching...",
    setCity: "Set city",
    setHomeCity: "Set Home City",
    settings: "Settings",
    strong: "Strong",
    strongest: "Strongest",
    seismicActivity: "Seismic movement",
    seismicLegendNote: "Observed multi-source earthquakes from the past week, plus recent M4.5+ events. Glow size scales with magnitude and fades as events age.",
    seismicMild: "Recent quakes",
    seismicSevere: "M5+ strong",
    timeZones: "Time zones",
    tsunamiAlert: "Tsunami/alert",
    unavailable: "unavailable",
    updated: "Updated",
    visibleOverlays: "Visible Overlays",
    warnings: "Warnings",
    weatherUnavailable: "Weather unavailable",
    windBreezy: "Breezy",
    windCalm: "Calm",
    windGale: "Gale",
    windScaleNote: "Interpolated 10 m wind from the live global weather grid",
    windScaleTitle: "Wind speed",
    windStrong: "Strong",
    zoomToHome: "Zoom to home"
  },
  sv: {
    all: "Alla",
    appLanguage: "Appspråk",
    aqi: "AQI",
    aircraftLocations: "Flygplanspositioner",
    aircraftTrails: "Flygplansspår",
    aircraftDensity: "Flygplanstäthet",
    aircraftOrigin: "Planets ursprung",
    aircraftSearch: "Flygplanssök",
    aircraftSearchPlaceholder: "Flyg, modell, operatör",
    aircraftVisible: "Synliga flygplan",
    any: "Alla",
    aviation: "Flyg",
    aviationIncidents: "Flygplanskrascher",
    hideUntrackedAircraft: "Dölj ospårade",
    noTrackedAircraft: "Spåra ett flygplan för att följa rutten",
    trackedAircraft: "Spårade flygplan",
    trackedFlights: "Spårade flyg",
    cityRequired: "Stad krävs för lokala uppdateringar",
    close: "Stäng",
    closeSettings: "Stäng inställningar",
    conditionLabels: {
      normal: "Normal",
      temperature: "Temperatur",
      wind: "Vindhastighet",
      radar: "Regnradar",
      rainForecast: "Regnprognos",
      seismic: "Seismisk rörelse",
      risk: "Risksignaler"
    },
    dayNight: "Dag/natt",
    desktopAlerts: "Skrivbordsvarningar",
    earthquakes: "Jordbävningar",
    enableAlerts: "Aktivera varningar",
    fetchingConditions: "Hämtar aktuella förhållanden för din sparade stad",
    feels: "Känns",
    filters: "Filter",
    gust: "Vindby",
    home: "Hem",
    homeCity: "Hemstad",
    homeCitySettings: "Inställningar för hemstad",
    homeMarker: "Hemmarkör",
    humidity: "Luftfuktighet",
    location: "Plats",
    mapLanguage: "Kartspråk",
    mapView: "Kartvy",
    nightMask: "Nattmask uppdateras varje minut",
    noLocalSignals: "Inga lokala avvikelsesignaler just nu",
    none: "Inga",
    quietLocally: "Lugnt lokalt",
    quakes: "Skalv",
    observedEvents: "Observerade",
    radarCoverage: "Håll musen över radarn för uppskattad nederbörd från RainViewer-plattor",
    radarExtreme: "Extremt",
    radarHeavy: "Kraftigt",
    radarLight: "Lätt",
    radarModerate: "Måttligt",
    radarScaleNote: "Uppskattat från färgen i live-radarplattan",
    radarScaleTitle: "Regnintensitet",
    refreshData: "Uppdatera data",
    refreshLocalWeather: "Uppdatera lokalt väder",
    refreshing: "Uppdaterar",
    refreshingLower: "uppdaterar",
    refreshingWeather: "Uppdaterar väder",
    retry: "Försök igen",
    riskCritical: "Kritisk",
    riskEvents: "Riskhändelser",
    riskHigh: "Hög",
    riskLegendNote: "Live-rapporter från GDELT om konflikt, protest, hot och militär aktivitet från ungefär den senaste timmen. Värmens storlek följer allvarlighet och artikelvolym.",
    riskNearby: "Risksignal nära",
    riskSignals: "Risksignaler",
    riskWatch: "Bevaka",
    searchCity: "Sök stad",
    searchLocation: "Sök plats",
    searching: "Söker...",
    setCity: "Välj stad",
    setHomeCity: "Välj hemstad",
    settings: "Inställningar",
    strong: "Starka",
    strongest: "Starkast",
    seismicActivity: "Seismisk rörelse",
    seismicLegendNote: "Observerade skalv från flera källor den senaste veckan, plus nyliga M4.5+-händelser. Glödens storlek följer magnitud och bleknar med ålder.",
    seismicMild: "Nyliga skalv",
    seismicSevere: "M5+ starka",
    timeZones: "Tidszoner",
    tsunamiAlert: "Tsunami/varning",
    unavailable: "inte tillgängligt",
    updated: "Uppdaterad",
    visibleOverlays: "Synliga lager",
    warnings: "Varningar",
    weatherUnavailable: "Väder ej tillgängligt",
    windBreezy: "Frisk",
    windCalm: "Lugnt",
    windGale: "Kuling",
    windScaleNote: "Interpolerad 10 m-vind från det globala liveväderrutnätet",
    windScaleTitle: "Vindhastighet",
    windStrong: "Stark",
    zoomToHome: "Zooma till hem"
  },
  de: {
    all: "Alle",
    appLanguage: "App-Sprache",
    aqi: "AQI",
    aircraftLocations: "Flugzeugpositionen",
    aircraftTrails: "Flugzeugspuren",
    aircraftDensity: "Flugzeugdichte",
    aircraftOrigin: "Flugzeugherkunft",
    aircraftSearch: "Flugzeugsuche",
    aircraftSearchPlaceholder: "Flug, Modell, Betreiber",
    aircraftVisible: "Sichtbare Flugzeuge",
    any: "Alle",
    aviation: "Luftfahrt",
    aviationIncidents: "Flugzeugabstürze",
    hideUntrackedAircraft: "Unverfolgte ausblenden",
    noTrackedAircraft: "Flugzeug verfolgen, um Route zu sehen",
    trackedAircraft: "Verfolgte Flugzeuge",
    trackedFlights: "Verfolgte Flüge",
    cityRequired: "Stadt für lokale Updates erforderlich",
    close: "Schließen",
    closeSettings: "Einstellungen schließen",
    conditionLabels: {
      normal: "Normal",
      temperature: "Temperatur",
      wind: "Windgeschwindigkeit",
      radar: "Regenradar",
      rainForecast: "Regenprognose",
      seismic: "Seismische Bewegung",
      risk: "Risikosignale"
    },
    dayNight: "Tag/Nacht",
    desktopAlerts: "Desktop-Warnungen",
    earthquakes: "Erdbeben",
    enableAlerts: "Warnungen aktivieren",
    fetchingConditions: "Aktuelle Bedingungen für deine gespeicherte Stadt werden abgerufen",
    feels: "Gefühlt",
    filters: "Filter",
    gust: "Böe",
    home: "Zuhause",
    homeCity: "Heimatstadt",
    homeCitySettings: "Heimatstadt-Einstellungen",
    homeMarker: "Heimatmarkierung",
    humidity: "Luftfeuchte",
    location: "Ort",
    mapLanguage: "Kartensprache",
    mapView: "Kartenansicht",
    nightMask: "Nachtmaske wird jede Minute aktualisiert",
    noLocalSignals: "Derzeit keine lokalen Anomaliesignale",
    none: "Keine",
    quietLocally: "Lokal ruhig",
    quakes: "Beben",
    observedEvents: "Beobachtet",
    radarCoverage: "Bewege die Maus über das Radar, um Niederschlag aus Live-RainViewer-Kacheln zu schätzen",
    radarExtreme: "Extrem",
    radarHeavy: "Stark",
    radarLight: "Leicht",
    radarModerate: "Mäßig",
    radarScaleNote: "Geschätzt aus der Farbe der Live-Radarkachel",
    radarScaleTitle: "Regenrate",
    refreshData: "Daten aktualisieren",
    refreshLocalWeather: "Lokales Wetter aktualisieren",
    refreshing: "Aktualisiert",
    refreshingLower: "aktualisiert",
    refreshingWeather: "Wetter wird aktualisiert",
    retry: "Erneut versuchen",
    riskCritical: "Kritisch",
    riskEvents: "Risikoereignisse",
    riskHigh: "Hoch",
    riskLegendNote: "Live-GDELT-Berichte zu Konflikten, Protesten, Bedrohungen und Militäraktivität aus ungefähr der letzten Stunde. Die Wärmgröße folgt Schweregrad und Artikelvolumen.",
    riskNearby: "Risikosignal in der Nähe",
    riskSignals: "Risikosignale",
    riskWatch: "Beobachten",
    searchCity: "Stadt suchen",
    searchLocation: "Ort suchen",
    searching: "Suche...",
    setCity: "Stadt wählen",
    setHomeCity: "Heimatstadt setzen",
    settings: "Einstellungen",
    strong: "Stark",
    strongest: "Stärkstes",
    seismicActivity: "Seismische Bewegung",
    seismicLegendNote: "Beobachtete Erdbeben aus mehreren Quellen der letzten Woche plus aktuelle M4.5+-Ereignisse. Die Leuchtgröße folgt der Magnitude und verblasst mit dem Alter.",
    seismicMild: "Aktuelle Beben",
    seismicSevere: "M5+ stark",
    timeZones: "Zeitzonen",
    tsunamiAlert: "Tsunami/Warnung",
    unavailable: "nicht verfügbar",
    updated: "Aktualisiert",
    visibleOverlays: "Sichtbare Ebenen",
    warnings: "Warnungen",
    weatherUnavailable: "Wetter nicht verfügbar",
    windBreezy: "Frisch",
    windCalm: "Ruhig",
    windGale: "Sturm",
    windScaleNote: "Interpolierter 10-m-Wind aus dem globalen Live-Wetterraster",
    windScaleTitle: "Windgeschwindigkeit",
    windStrong: "Stark",
    zoomToHome: "Zur Heimat zoomen"
  },
  fr: {
    all: "Tout",
    appLanguage: "Langue de l'app",
    aqi: "IQA",
    aircraftLocations: "Positions avions",
    aircraftTrails: "Trajets avions",
    aircraftDensity: "Densité avions",
    aircraftOrigin: "Origine avion",
    aircraftSearch: "Recherche avion",
    aircraftSearchPlaceholder: "Vol, modèle, opérateur",
    aircraftVisible: "Avions visibles",
    any: "Tous",
    aviation: "Aviation",
    aviationIncidents: "Crashs aériens",
    hideUntrackedAircraft: "Masquer non suivis",
    noTrackedAircraft: "Suivez un avion pour voir sa route",
    trackedAircraft: "Avions suivis",
    trackedFlights: "Vols suivis",
    cityRequired: "Ville requise pour les mises à jour locales",
    close: "Fermer",
    closeSettings: "Fermer les réglages",
    conditionLabels: {
      normal: "Normal",
      temperature: "Température",
      wind: "Vitesse du vent",
      radar: "Radar pluie",
      rainForecast: "Prévision pluie",
      seismic: "Mouvement sismique",
      risk: "Signaux de risque"
    },
    dayNight: "Jour/nuit",
    desktopAlerts: "Alertes bureau",
    earthquakes: "Séismes",
    enableAlerts: "Activer les alertes",
    fetchingConditions: "Récupération des conditions actuelles pour votre ville enregistrée",
    feels: "Ressenti",
    filters: "Filtres",
    gust: "Rafale",
    home: "Domicile",
    homeCity: "Ville domicile",
    homeCitySettings: "Réglages de la ville domicile",
    homeMarker: "Repère domicile",
    humidity: "Humidité",
    location: "Lieu",
    mapLanguage: "Langue de la carte",
    mapView: "Vue carte",
    nightMask: "Masque de nuit mis à jour chaque minute",
    noLocalSignals: "Aucun signal d'anomalie locale pour le moment",
    none: "Aucun",
    quietLocally: "Calme localement",
    quakes: "Séismes",
    observedEvents: "Observés",
    radarCoverage: "Survolez le radar pour estimer les précipitations depuis les tuiles RainViewer en direct",
    radarExtreme: "Extrême",
    radarHeavy: "Forte",
    radarLight: "Faible",
    radarModerate: "Modérée",
    radarScaleNote: "Estimé depuis la couleur de la tuile radar en direct",
    radarScaleTitle: "Intensité pluie",
    refreshData: "Actualiser les données",
    refreshLocalWeather: "Actualiser la météo locale",
    refreshing: "Actualisation",
    refreshingLower: "actualisation",
    refreshingWeather: "Actualisation météo",
    retry: "Réessayer",
    riskCritical: "Critique",
    riskEvents: "Événements risque",
    riskHigh: "Élevé",
    riskLegendNote: "Rapports GDELT en direct sur conflits, protestations, menaces et activité militaire depuis environ la dernière heure. La taille de chaleur suit la gravité et le volume d'articles.",
    riskNearby: "Signal de risque proche",
    riskSignals: "Signaux de risque",
    riskWatch: "Veille",
    searchCity: "Rechercher une ville",
    searchLocation: "Rechercher un lieu",
    searching: "Recherche...",
    setCity: "Choisir la ville",
    setHomeCity: "Définir la ville domicile",
    settings: "Réglages",
    strong: "Forts",
    strongest: "Plus fort",
    seismicActivity: "Mouvement sismique",
    seismicLegendNote: "Séismes observés via plusieurs sources sur la dernière semaine, plus événements M4.5+ récents. La taille de la lueur suit la magnitude et s'estompe avec l'âge.",
    seismicMild: "Séismes récents",
    seismicSevere: "M5+ forts",
    timeZones: "Fuseaux horaires",
    tsunamiAlert: "Tsunami/alerte",
    unavailable: "indisponible",
    updated: "Mis à jour",
    visibleOverlays: "Couches visibles",
    warnings: "Alertes",
    weatherUnavailable: "Météo indisponible",
    windBreezy: "Brise",
    windCalm: "Calme",
    windGale: "Coup de vent",
    windScaleNote: "Vent à 10 m interpolé depuis la grille météo mondiale en direct",
    windScaleTitle: "Vitesse du vent",
    windStrong: "Fort",
    zoomToHome: "Zoomer sur le domicile"
  },
  es: {
    all: "Todo",
    appLanguage: "Idioma de la app",
    aqi: "ICA",
    aircraftLocations: "Ubicación de aviones",
    aircraftTrails: "Rastros de aviones",
    aircraftDensity: "Densidad de aviones",
    aircraftOrigin: "Origen del avión",
    aircraftSearch: "Buscar avión",
    aircraftSearchPlaceholder: "Vuelo, modelo, operador",
    aircraftVisible: "Aviones visibles",
    any: "Cualquiera",
    aviation: "Aviación",
    aviationIncidents: "Accidentes aéreos",
    hideUntrackedAircraft: "Ocultar no seguidos",
    noTrackedAircraft: "Sigue un avión para ver su ruta",
    trackedAircraft: "Aviones seguidos",
    trackedFlights: "Vuelos seguidos",
    cityRequired: "Se requiere una ciudad para actualizaciones locales",
    close: "Cerrar",
    closeSettings: "Cerrar ajustes",
    conditionLabels: {
      normal: "Normal",
      temperature: "Temperatura",
      wind: "Velocidad del viento",
      radar: "Radar de lluvia",
      rainForecast: "Previsión lluvia",
      seismic: "Movimiento sísmico",
      risk: "Señales de riesgo"
    },
    dayNight: "Día/noche",
    desktopAlerts: "Alertas de escritorio",
    earthquakes: "Terremotos",
    enableAlerts: "Activar alertas",
    fetchingConditions: "Obteniendo condiciones actuales para tu ciudad guardada",
    feels: "Sensación",
    filters: "Filtros",
    gust: "Ráfaga",
    home: "Inicio",
    homeCity: "Ciudad local",
    homeCitySettings: "Ajustes de ciudad local",
    homeMarker: "Marcador local",
    humidity: "Humedad",
    location: "Lugar",
    mapLanguage: "Idioma del mapa",
    mapView: "Vista del mapa",
    nightMask: "La máscara nocturna se actualiza cada minuto",
    noLocalSignals: "Sin señales de anomalía local ahora mismo",
    none: "Ninguno",
    quietLocally: "Calma local",
    quakes: "Sismos",
    observedEvents: "Observados",
    radarCoverage: "Pasa el cursor sobre el radar para estimar lluvia desde teselas RainViewer en vivo",
    radarExtreme: "Extrema",
    radarHeavy: "Fuerte",
    radarLight: "Ligera",
    radarModerate: "Moderada",
    radarScaleNote: "Estimado desde el color de la tesela radar en vivo",
    radarScaleTitle: "Intensidad lluvia",
    refreshData: "Actualizar datos",
    refreshLocalWeather: "Actualizar clima local",
    refreshing: "Actualizando",
    refreshingLower: "actualizando",
    refreshingWeather: "Actualizando clima",
    retry: "Reintentar",
    riskCritical: "Crítico",
    riskEvents: "Eventos de riesgo",
    riskHigh: "Alto",
    riskLegendNote: "Reportes GDELT en vivo sobre conflicto, protesta, amenaza y actividad militar de aproximadamente la última hora. El tamaño del calor sigue la gravedad y el volumen de artículos.",
    riskNearby: "Señal de riesgo cercana",
    riskSignals: "Señales de riesgo",
    riskWatch: "Vigilancia",
    searchCity: "Buscar ciudad",
    searchLocation: "Buscar lugar",
    searching: "Buscando...",
    setCity: "Elegir ciudad",
    setHomeCity: "Definir ciudad local",
    settings: "Ajustes",
    strong: "Fuertes",
    strongest: "Más fuerte",
    seismicActivity: "Movimiento sísmico",
    seismicLegendNote: "Terremotos observados desde varias fuentes durante la última semana, más eventos M4.5+ recientes. El brillo escala con la magnitud y se desvanece con la antigüedad.",
    seismicMild: "Sismos recientes",
    seismicSevere: "M5+ fuertes",
    timeZones: "Zonas horarias",
    tsunamiAlert: "Tsunami/alerta",
    unavailable: "no disponible",
    updated: "Actualizado",
    visibleOverlays: "Capas visibles",
    warnings: "Alertas",
    weatherUnavailable: "Clima no disponible",
    windBreezy: "Brisa",
    windCalm: "Calma",
    windGale: "Temporal",
    windScaleNote: "Viento a 10 m interpolado desde la cuadrícula meteorológica global en vivo",
    windScaleTitle: "Velocidad viento",
    windStrong: "Fuerte",
    zoomToHome: "Acercar a inicio"
  },
  it: {
    all: "Tutto",
    appLanguage: "Lingua app",
    aqi: "IQA",
    aircraftLocations: "Posizioni aerei",
    aircraftTrails: "Tracce aerei",
    aircraftDensity: "Densità aerei",
    aircraftOrigin: "Origine aereo",
    aircraftSearch: "Cerca aereo",
    aircraftSearchPlaceholder: "Volo, modello, operatore",
    aircraftVisible: "Aerei visibili",
    any: "Qualsiasi",
    aviation: "Aviazione",
    aviationIncidents: "Incidenti aerei",
    hideUntrackedAircraft: "Nascondi non seguiti",
    noTrackedAircraft: "Segui un aereo per vedere la rotta",
    trackedAircraft: "Aerei seguiti",
    trackedFlights: "Voli seguiti",
    cityRequired: "Città richiesta per gli aggiornamenti locali",
    close: "Chiudi",
    closeSettings: "Chiudi impostazioni",
    conditionLabels: {
      normal: "Normale",
      temperature: "Temperatura",
      wind: "Velocità vento",
      radar: "Radar pioggia",
      rainForecast: "Previsione pioggia",
      seismic: "Movimento sismico",
      risk: "Segnali di rischio"
    },
    dayNight: "Giorno/notte",
    desktopAlerts: "Avvisi desktop",
    earthquakes: "Terremoti",
    enableAlerts: "Attiva avvisi",
    fetchingConditions: "Recupero delle condizioni attuali per la città salvata",
    feels: "Percepita",
    filters: "Filtri",
    gust: "Raffica",
    home: "Casa",
    homeCity: "Città di casa",
    homeCitySettings: "Impostazioni città di casa",
    homeMarker: "Indicatore casa",
    humidity: "Umidità",
    location: "Luogo",
    mapLanguage: "Lingua mappa",
    mapView: "Vista mappa",
    nightMask: "La maschera notte si aggiorna ogni minuto",
    noLocalSignals: "Nessun segnale di anomalia locale al momento",
    none: "Nessuno",
    quietLocally: "Tranquillo localmente",
    quakes: "Scosse",
    observedEvents: "Osservati",
    radarCoverage: "Passa sul radar per stimare la pioggia dalle tessere RainViewer live",
    radarExtreme: "Estrema",
    radarHeavy: "Forte",
    radarLight: "Leggera",
    radarModerate: "Moderata",
    radarScaleNote: "Stimato dal colore della tessera radar live",
    radarScaleTitle: "Intensità pioggia",
    refreshData: "Aggiorna dati",
    refreshLocalWeather: "Aggiorna meteo locale",
    refreshing: "Aggiornamento",
    refreshingLower: "aggiornamento",
    refreshingWeather: "Aggiornamento meteo",
    retry: "Riprova",
    riskCritical: "Critico",
    riskEvents: "Eventi di rischio",
    riskHigh: "Alto",
    riskLegendNote: "Report GDELT live su conflitti, proteste, minacce e attività militare dell'ultima ora circa. La dimensione della mappa segue gravità e volume di articoli.",
    riskNearby: "Segnale di rischio vicino",
    riskSignals: "Segnali di rischio",
    riskWatch: "Osservazione",
    searchCity: "Cerca città",
    searchLocation: "Cerca luogo",
    searching: "Ricerca...",
    setCity: "Scegli città",
    setHomeCity: "Imposta città di casa",
    settings: "Impostazioni",
    strong: "Forti",
    strongest: "Più forte",
    seismicActivity: "Movimento sismico",
    seismicLegendNote: "Terremoti osservati da più fonti nell'ultima settimana, più eventi M4.5+ recenti. La dimensione dell'alone segue la magnitudo e svanisce con il tempo.",
    seismicMild: "Scosse recenti",
    seismicSevere: "M5+ forti",
    timeZones: "Fusi orari",
    tsunamiAlert: "Tsunami/allerta",
    unavailable: "non disponibile",
    updated: "Aggiornato",
    visibleOverlays: "Livelli visibili",
    warnings: "Avvisi",
    weatherUnavailable: "Meteo non disponibile",
    windBreezy: "Brezza",
    windCalm: "Calmo",
    windGale: "Burrasca",
    windScaleNote: "Vento a 10 m interpolato dalla griglia meteo globale live",
    windScaleTitle: "Velocità vento",
    windStrong: "Forte",
    zoomToHome: "Zoom su casa"
  },
  ja: {
    all: "すべて",
    appLanguage: "アプリの言語",
    aqi: "AQI",
    aircraftLocations: "航空機位置",
    aircraftTrails: "航空機の軌跡",
    aircraftDensity: "航空機密度",
    aircraftOrigin: "航空機の出発国",
    aircraftSearch: "航空機検索",
    aircraftSearchPlaceholder: "便名、機種、運航会社",
    aircraftVisible: "表示航空機",
    any: "すべて",
    aviation: "航空",
    aviationIncidents: "航空機事故",
    hideUntrackedAircraft: "未追跡を非表示",
    noTrackedAircraft: "航空機を追跡して経路を表示",
    trackedAircraft: "追跡中の航空機",
    trackedFlights: "追跡中の便",
    cityRequired: "ローカル更新には都市の設定が必要です",
    close: "閉じる",
    closeSettings: "設定を閉じる",
    conditionLabels: {
      normal: "通常",
      temperature: "気温",
      wind: "風速",
      radar: "雨雲レーダー",
      rainForecast: "雨予報",
      seismic: "地震活動",
      risk: "リスク信号"
    },
    dayNight: "昼/夜",
    desktopAlerts: "デスクトップ通知",
    earthquakes: "地震",
    enableAlerts: "通知を有効化",
    fetchingConditions: "保存した都市の現在の状況を取得中",
    feels: "体感",
    filters: "フィルター",
    gust: "突風",
    home: "ホーム",
    homeCity: "ホーム都市",
    homeCitySettings: "ホーム都市設定",
    homeMarker: "ホームマーカー",
    humidity: "湿度",
    location: "場所",
    mapLanguage: "地図の言語",
    mapView: "地図表示",
    nightMask: "夜間マスクは毎分更新",
    noLocalSignals: "現在、ローカル異常シグナルはありません",
    none: "なし",
    quietLocally: "周辺は静穏",
    quakes: "地震",
    observedEvents: "観測",
    radarCoverage: "レーダー上にマウスを置くとRainViewerライブタイルから降水量を推定します",
    radarExtreme: "猛烈",
    radarHeavy: "強い",
    radarLight: "弱い",
    radarModerate: "中程度",
    radarScaleNote: "ライブレーダータイルの色から推定",
    radarScaleTitle: "降水強度",
    refreshData: "データ更新",
    refreshLocalWeather: "ローカル天気を更新",
    refreshing: "更新中",
    refreshingLower: "更新中",
    refreshingWeather: "天気を更新中",
    retry: "再試行",
    riskCritical: "重大",
    riskEvents: "リスク事象",
    riskHigh: "高",
    riskLegendNote: "過去約1時間の紛争、抗議、脅威、軍事活動に関するGDELTライブ報告。ヒートの大きさは深刻度と記事量に応じます。",
    riskNearby: "近くのリスク信号",
    riskSignals: "リスク信号",
    riskWatch: "注意",
    searchCity: "都市を検索",
    searchLocation: "場所を検索",
    searching: "検索中...",
    setCity: "都市を設定",
    setHomeCity: "ホーム都市を設定",
    settings: "設定",
    strong: "強い",
    strongest: "最大",
    seismicActivity: "地震活動",
    seismicLegendNote: "過去1週間に複数ソースで観測された地震と、最近のM4.5以上の地震。光の大きさはマグニチュードに比例し、時間とともに薄くなります。",
    seismicMild: "最近の地震",
    seismicSevere: "M5+ 強い",
    timeZones: "タイムゾーン",
    tsunamiAlert: "津波/警報",
    unavailable: "利用不可",
    updated: "更新",
    visibleOverlays: "表示レイヤー",
    warnings: "警報",
    weatherUnavailable: "天気を利用できません",
    windBreezy: "やや強い",
    windCalm: "穏やか",
    windGale: "強風",
    windScaleNote: "ライブ全球気象グリッドから補間した10m風",
    windScaleTitle: "風速",
    windStrong: "強い",
    zoomToHome: "ホームへズーム"
  },
  zh: {
    all: "全部",
    appLanguage: "应用语言",
    aqi: "AQI",
    aircraftLocations: "飞机位置",
    aircraftTrails: "飞机轨迹",
    aircraftDensity: "飞机密度",
    aircraftOrigin: "飞机来源",
    aircraftSearch: "搜索飞机",
    aircraftSearchPlaceholder: "航班、机型、运营方",
    aircraftVisible: "可见飞机",
    any: "任意",
    aviation: "航空",
    aviationIncidents: "飞机事故",
    hideUntrackedAircraft: "隐藏未跟踪",
    noTrackedAircraft: "跟踪飞机以查看航线",
    trackedAircraft: "已跟踪飞机",
    trackedFlights: "已跟踪航班",
    cityRequired: "需要设置城市才能获取本地更新",
    close: "关闭",
    closeSettings: "关闭设置",
    conditionLabels: {
      normal: "普通",
      temperature: "温度",
      wind: "风速",
      radar: "降雨雷达",
      rainForecast: "降雨预报",
      seismic: "地震活动",
      risk: "风险信号"
    },
    dayNight: "昼/夜",
    desktopAlerts: "桌面提醒",
    earthquakes: "地震",
    enableAlerts: "启用提醒",
    fetchingConditions: "正在获取已保存城市的当前状况",
    feels: "体感",
    filters: "筛选",
    gust: "阵风",
    home: "主页",
    homeCity: "所在城市",
    homeCitySettings: "所在城市设置",
    homeMarker: "主页标记",
    humidity: "湿度",
    location: "地点",
    mapLanguage: "地图语言",
    mapView: "地图视图",
    nightMask: "夜间遮罩每分钟更新",
    noLocalSignals: "当前没有本地异常信号",
    none: "无",
    quietLocally: "本地平静",
    quakes: "地震",
    observedEvents: "观测",
    radarCoverage: "将鼠标悬停在雷达上，可从实时 RainViewer 图块估算降雨",
    radarExtreme: "极端",
    radarHeavy: "强",
    radarLight: "轻",
    radarModerate: "中等",
    radarScaleNote: "根据实时雷达图块颜色估算",
    radarScaleTitle: "降雨强度",
    refreshData: "刷新数据",
    refreshLocalWeather: "刷新本地天气",
    refreshing: "正在刷新",
    refreshingLower: "正在刷新",
    refreshingWeather: "正在刷新天气",
    retry: "重试",
    riskCritical: "危急",
    riskEvents: "风险事件",
    riskHigh: "高",
    riskLegendNote: "来自 GDELT 的近一小时冲突、抗议、威胁和军事活动实时报告。热度大小随严重程度和文章量变化。",
    riskNearby: "附近风险信号",
    riskSignals: "风险信号",
    riskWatch: "关注",
    searchCity: "搜索城市",
    searchLocation: "搜索地点",
    searching: "搜索中...",
    setCity: "设置城市",
    setHomeCity: "设置所在城市",
    settings: "设置",
    strong: "强震",
    strongest: "最强",
    seismicActivity: "地震活动",
    seismicLegendNote: "过去一周多个来源观测到的地震，以及近期 M4.5+ 事件。光晕大小随震级变化，并会随时间淡出。",
    seismicMild: "近期地震",
    seismicSevere: "M5+ 强震",
    timeZones: "时区",
    tsunamiAlert: "海啸/警报",
    unavailable: "不可用",
    updated: "已更新",
    visibleOverlays: "可见图层",
    warnings: "警报",
    weatherUnavailable: "天气不可用",
    windBreezy: "微风",
    windCalm: "平静",
    windGale: "大风",
    windScaleNote: "根据实时全球天气网格插值的 10 米风速",
    windScaleTitle: "风速",
    windStrong: "强",
    zoomToHome: "缩放到主页"
  }
} satisfies Record<AppLanguage, Record<string, unknown>>;

const unitCopy = {
  en: {
    temperatureUnits: "Temperature units",
    windUnits: "Wind units",
    rainUnits: "Rain units",
    now: "Now",
    forecast: "Forecast",
    forecastModel: "Forecast model",
    latestObservedRadar: "Latest observed radar",
    observedRadar: "Observed radar",
    waitingForRadar: "Waiting for radar",
    waitingForRadarFrames: "Waiting for radar frames",
    forecastUnavailable: "Forecast unavailable",
    noCitySet: "No city set",
    checked: "checked"
  },
  sv: {
    temperatureUnits: "Temperaturenheter",
    windUnits: "Vindenheter",
    rainUnits: "Regnenheter",
    now: "Nu",
    forecast: "Prognos",
    forecastModel: "Prognosmodell",
    latestObservedRadar: "Senaste observerade radar",
    observedRadar: "Observerad radar",
    waitingForRadar: "Väntar på radar",
    waitingForRadarFrames: "Väntar på radarbilder",
    forecastUnavailable: "Prognos inte tillgänglig",
    noCitySet: "Ingen stad vald",
    checked: "kontrollerad"
  },
  de: {
    temperatureUnits: "Temperatureinheiten",
    windUnits: "Windeinheiten",
    rainUnits: "Regeneinheiten",
    now: "Jetzt",
    forecast: "Prognose",
    forecastModel: "Prognosemodell",
    latestObservedRadar: "Neuester beobachteter Radar",
    observedRadar: "Beobachteter Radar",
    waitingForRadar: "Warte auf Radar",
    waitingForRadarFrames: "Warte auf Radarbilder",
    forecastUnavailable: "Prognose nicht verfügbar",
    noCitySet: "Keine Stadt gesetzt",
    checked: "geprüft"
  },
  fr: {
    temperatureUnits: "Unités de température",
    windUnits: "Unités de vent",
    rainUnits: "Unités de pluie",
    now: "Maintenant",
    forecast: "Prévision",
    forecastModel: "Modèle prévisionnel",
    latestObservedRadar: "Dernier radar observé",
    observedRadar: "Radar observé",
    waitingForRadar: "En attente du radar",
    waitingForRadarFrames: "En attente des images radar",
    forecastUnavailable: "Prévision indisponible",
    noCitySet: "Aucune ville définie",
    checked: "vérifié"
  },
  es: {
    temperatureUnits: "Unidades de temperatura",
    windUnits: "Unidades de viento",
    rainUnits: "Unidades de lluvia",
    now: "Ahora",
    forecast: "Pronóstico",
    forecastModel: "Modelo de pronóstico",
    latestObservedRadar: "Último radar observado",
    observedRadar: "Radar observado",
    waitingForRadar: "Esperando radar",
    waitingForRadarFrames: "Esperando imágenes de radar",
    forecastUnavailable: "Pronóstico no disponible",
    noCitySet: "Sin ciudad definida",
    checked: "comprobado"
  },
  it: {
    temperatureUnits: "Unità temperatura",
    windUnits: "Unità vento",
    rainUnits: "Unità pioggia",
    now: "Ora",
    forecast: "Previsione",
    forecastModel: "Modello previsionale",
    latestObservedRadar: "Ultimo radar osservato",
    observedRadar: "Radar osservato",
    waitingForRadar: "In attesa del radar",
    waitingForRadarFrames: "In attesa dei frame radar",
    forecastUnavailable: "Previsione non disponibile",
    noCitySet: "Nessuna città impostata",
    checked: "controllato"
  },
  ja: {
    temperatureUnits: "温度単位",
    windUnits: "風速単位",
    rainUnits: "降水単位",
    now: "現在",
    forecast: "予報",
    forecastModel: "予報モデル",
    latestObservedRadar: "最新観測レーダー",
    observedRadar: "観測レーダー",
    waitingForRadar: "レーダー待機中",
    waitingForRadarFrames: "レーダーフレーム待機中",
    forecastUnavailable: "予報を利用できません",
    noCitySet: "都市未設定",
    checked: "確認"
  },
  zh: {
    temperatureUnits: "温度单位",
    windUnits: "风速单位",
    rainUnits: "降雨单位",
    now: "现在",
    forecast: "预报",
    forecastModel: "预报模型",
    latestObservedRadar: "最新观测雷达",
    observedRadar: "观测雷达",
    waitingForRadar: "等待雷达",
    waitingForRadarFrames: "等待雷达帧",
    forecastUnavailable: "预报不可用",
    noCitySet: "未设置城市",
    checked: "已检查"
  }
} satisfies Record<AppLanguage, Record<string, string>>;

const cwaTokenCopy = {
  en: { token: "Taiwan CWA token", placeholder: "Optional OpenData token" },
  sv: { token: "Taiwan CWA-token", placeholder: "Valfri OpenData-token" },
  de: { token: "Taiwan-CWA-Token", placeholder: "Optionaler OpenData-Token" },
  fr: { token: "Jeton CWA Taiwan", placeholder: "Jeton OpenData optionnel" },
  es: { token: "Token CWA Taiwán", placeholder: "Token OpenData opcional" },
  it: { token: "Token CWA Taiwan", placeholder: "Token OpenData opzionale" },
  ja: { token: "台湾 CWA トークン", placeholder: "任意の OpenData トークン" },
  zh: { token: "台湾 CWA 令牌", placeholder: "可选 OpenData 令牌" }
} satisfies Record<AppLanguage, { token: string; placeholder: string }>;

const updateCopy = {
  en: {
    check: "Check for updates",
    checking: "Checking",
    current: "Up to date",
    available: "Update available",
    failed: "Update check failed",
    open: "Open release",
    openLink: "Open source",
    version: "Version"
  },
  sv: {
    check: "Sök uppdateringar",
    checking: "Kontrollerar",
    current: "Uppdaterad",
    available: "Uppdatering finns",
    failed: "Uppdateringskontroll misslyckades",
    open: "Öppna release",
    openLink: "Öppna källa",
    version: "Version"
  },
  de: {
    check: "Nach Updates suchen",
    checking: "Prüfe",
    current: "Aktuell",
    available: "Update verfügbar",
    failed: "Update-Prüfung fehlgeschlagen",
    open: "Release öffnen",
    openLink: "Quelle öffnen",
    version: "Version"
  },
  fr: {
    check: "Rechercher des mises à jour",
    checking: "Vérification",
    current: "À jour",
    available: "Mise à jour disponible",
    failed: "Échec de la vérification",
    open: "Ouvrir la version",
    openLink: "Ouvrir la source",
    version: "Version"
  },
  es: {
    check: "Buscar actualizaciones",
    checking: "Comprobando",
    current: "Actualizado",
    available: "Actualización disponible",
    failed: "Error al comprobar",
    open: "Abrir versión",
    openLink: "Abrir fuente",
    version: "Versión"
  },
  it: {
    check: "Cerca aggiornamenti",
    checking: "Controllo",
    current: "Aggiornata",
    available: "Aggiornamento disponibile",
    failed: "Controllo non riuscito",
    open: "Apri release",
    openLink: "Apri fonte",
    version: "Versione"
  },
  ja: {
    check: "更新を確認",
    checking: "確認中",
    current: "最新",
    available: "更新あり",
    failed: "更新確認に失敗",
    open: "リリースを開く",
    openLink: "ソースを開く",
    version: "バージョン"
  },
  zh: {
    check: "检查更新",
    checking: "正在检查",
    current: "已是最新",
    available: "有新版本",
    failed: "检查更新失败",
    open: "打开发布页",
    openLink: "打开来源",
    version: "版本"
  }
} satisfies Record<AppLanguage, Record<string, string>>;

function loadSavedMapLanguage() {
  return localStorage.getItem(MAP_LANGUAGE_KEY) || "en";
}

function isAppLanguage(language: string | null): language is AppLanguage {
  return appLanguages.some((candidate) => candidate.id === language);
}

function loadSavedAppLanguage(): AppLanguage {
  const language = localStorage.getItem(APP_LANGUAGE_KEY);
  return isAppLanguage(language) ? language : "en";
}

interface SavedViewSettings {
  showWarnings?: boolean;
  showEarthquakes?: boolean;
  showTimezones?: boolean;
  showDayNight?: boolean;
  showHomeMarker?: boolean;
  showAircraftLocations?: boolean;
  showAircraftTrails?: boolean;
  showAviationIncidents?: boolean;
  aircraftLimit?: number;
  aircraftOriginCountry?: string;
  aircraftSearchQuery?: string;
  hideUntrackedAircraft?: boolean;
  temperatureUnit?: TemperatureUnit;
  windUnit?: WindUnit;
  rainUnit?: RainUnit;
}

interface SavedTrackedAircraft {
  ids: string[];
  snapshots: Record<string, AircraftState>;
  tracks: Record<string, AircraftTrack | undefined>;
  dockOpen: boolean;
}

function savedTemperatureUnit(value: unknown): TemperatureUnit | undefined {
  return temperatureUnitOptions.some((option) => option.id === value) ? value as TemperatureUnit : undefined;
}

function savedWindUnit(value: unknown): WindUnit | undefined {
  return windUnitOptions.some((option) => option.id === value) ? value as WindUnit : undefined;
}

function savedRainUnit(value: unknown): RainUnit | undefined {
  return rainUnitOptions.some((option) => option.id === value) ? value as RainUnit : undefined;
}

function loadSavedViewSettings(): SavedViewSettings {
  const raw = localStorage.getItem(VIEW_SETTINGS_KEY);
  if (!raw) return {};

  try {
    const saved = JSON.parse(raw) as SavedViewSettings;
    return {
      showWarnings: typeof saved.showWarnings === "boolean" ? saved.showWarnings : undefined,
      showEarthquakes: typeof saved.showEarthquakes === "boolean" ? saved.showEarthquakes : undefined,
      showTimezones: typeof saved.showTimezones === "boolean" ? saved.showTimezones : undefined,
      showDayNight: typeof saved.showDayNight === "boolean" ? saved.showDayNight : undefined,
      showHomeMarker: typeof saved.showHomeMarker === "boolean" ? saved.showHomeMarker : undefined,
      showAircraftLocations: typeof saved.showAircraftLocations === "boolean" ? saved.showAircraftLocations : undefined,
      showAircraftTrails: typeof saved.showAircraftTrails === "boolean" ? saved.showAircraftTrails : undefined,
      showAviationIncidents: typeof saved.showAviationIncidents === "boolean" ? saved.showAviationIncidents : undefined,
      aircraftLimit: AIRCRAFT_LIMIT_OPTIONS.includes(Number(saved.aircraftLimit) as (typeof AIRCRAFT_LIMIT_OPTIONS)[number])
        ? Number(saved.aircraftLimit)
        : undefined,
      aircraftOriginCountry: typeof saved.aircraftOriginCountry === "string" ? saved.aircraftOriginCountry : undefined,
      aircraftSearchQuery: typeof saved.aircraftSearchQuery === "string" ? saved.aircraftSearchQuery.slice(0, 80) : undefined,
      hideUntrackedAircraft: typeof saved.hideUntrackedAircraft === "boolean" ? saved.hideUntrackedAircraft : undefined,
      temperatureUnit: savedTemperatureUnit(saved.temperatureUnit),
      windUnit: savedWindUnit(saved.windUnit),
      rainUnit: savedRainUnit(saved.rainUnit)
    };
  } catch {
    return {};
  }
}

function saveViewSettings(settings: SavedViewSettings) {
  localStorage.setItem(VIEW_SETTINGS_KEY, JSON.stringify(settings));
}

function loadSavedTrackedAircraft(): SavedTrackedAircraft {
  const raw = localStorage.getItem(TRACKED_AIRCRAFT_KEY);
  if (!raw) return { ids: [], snapshots: {}, tracks: {}, dockOpen: false };

  try {
    const saved = JSON.parse(raw) as Partial<SavedTrackedAircraft>;
    const ids = Array.from(new Set((Array.isArray(saved.ids) ? saved.ids : []).filter((id): id is string => typeof id === "string"))).slice(0, 12);
    const snapshots = saved.snapshots && typeof saved.snapshots === "object" ? saved.snapshots as Record<string, AircraftState> : {};
    const tracks = saved.tracks && typeof saved.tracks === "object" ? saved.tracks as Record<string, AircraftTrack | undefined> : {};
    return {
      ids,
      snapshots: Object.fromEntries(ids.flatMap((id) => snapshots[id] ? [[id, snapshots[id]]] : [])),
      tracks: Object.fromEntries(ids.flatMap((id) => tracks[id] ? [[id, tracks[id]]] : [])),
      dockOpen: saved.dockOpen === true
    };
  } catch {
    return { ids: [], snapshots: {}, tracks: {}, dockOpen: false };
  }
}

function saveTrackedAircraftState(state: SavedTrackedAircraft) {
  const ids = Array.from(new Set(state.ids)).slice(0, 12);
  const snapshots = Object.fromEntries(ids.flatMap((id) => state.snapshots[id] ? [[id, state.snapshots[id]]] : []));
  const tracks = Object.fromEntries(
    ids.flatMap((id) => {
      const track = state.tracks[id];
      if (!track) return [];
      return [
        [
          id,
          {
            ...track,
            path: track.path.slice(-220)
          }
        ]
      ];
    })
  );
  localStorage.setItem(TRACKED_AIRCRAFT_KEY, JSON.stringify({ ids, snapshots, tracks, dockOpen: state.dockOpen }));
}

function loadSavedLocation(): CityLocation | undefined {
  const raw = localStorage.getItem(LOCATION_KEY);
  if (!raw) return undefined;

  try {
    return JSON.parse(raw) as CityLocation;
  } catch {
    return undefined;
  }
}

function saveLocation(location: CityLocation) {
  localStorage.setItem(LOCATION_KEY, JSON.stringify(location));
}

function saveMapLanguage(language: string) {
  localStorage.setItem(MAP_LANGUAGE_KEY, language);
}

function saveAppLanguage(language: AppLanguage) {
  localStorage.setItem(APP_LANGUAGE_KEY, language);
}

function isSafeHttpUrl(url?: string) {
  if (!url) return false;
  try {
    const protocol = new URL(url).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function openExternalUrl(url?: string) {
  if (!isSafeHttpUrl(url)) return false;
  const safeUrl = url as string;

  if (window.weatherWatch?.openExternal) {
    void window.weatherWatch.openExternal(safeUrl).catch(() => {
      window.open(safeUrl, "_blank", "noopener,noreferrer");
    });
  } else {
    window.open(safeUrl, "_blank", "noopener,noreferrer");
  }

  return true;
}

function normalizeVersionTag(tag: string) {
  return tag.trim().replace(/^v/i, "");
}

function compareVersions(left: string, right: string) {
  const leftParts = normalizeVersionTag(left).split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = normalizeVersionTag(right).split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length, 3);
  for (let index = 0; index < length; index += 1) {
    const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

async function fetchLatestReleaseInfo() {
  const text = window.weatherWatch?.fetchText
    ? await window.weatherWatch.fetchText(LATEST_RELEASE_URL)
    : await fetch(LATEST_RELEASE_URL, { headers: { Accept: "application/vnd.github+json" } }).then((response) => {
        if (!response.ok) throw new Error(`Request failed with ${response.status}`);
        return response.text();
      });
  const release = JSON.parse(text) as { tag_name?: string; html_url?: string; name?: string };
  const latestVersion = normalizeVersionTag(release.tag_name || release.name || "");
  if (!latestVersion) throw new Error("Release version was missing");
  return {
    latestVersion,
    url: isSafeHttpUrl(release.html_url) ? release.html_url as string : RELEASES_PAGE_URL
  };
}

function locationLabel(location?: CityLocation, fallback = "No city set") {
  if (!location) return fallback;
  return [location.name, location.admin1, location.country].filter(Boolean).join(", ");
}

function timeAgo(value?: string | number, language: AppLanguage = "en") {
  if (!value) return "--";
  const date = typeof value === "string" ? new Date(value).getTime() : value;
  const seconds = Math.max(0, Math.round((Date.now() - date) / 1000));
  const formatter = new Intl.RelativeTimeFormat(language, { numeric: "always", style: "short" });
  if (seconds < 60) return formatter.format(-seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return formatter.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  return formatter.format(-hours, "hour");
}

function forecastTimeLabel(hourOffset: number, language: AppLanguage = "en") {
  const target = new Date(Date.now() + hourOffset * 60 * 60 * 1000);
  return target.toLocaleString(language, {
    weekday: hourOffset >= 24 ? "short" : undefined,
    hour: "2-digit",
    minute: "2-digit"
  });
}

interface RadarTimelineFrame extends RainFrame {
  kind: "observed" | "forecast";
}

function radarTimelineFrames(rainViewer?: RainViewerState): RadarTimelineFrame[] {
  if (!rainViewer) return [];
  return [
    ...rainViewer.past.map((frame) => ({ ...frame, kind: "observed" as const })),
    ...rainViewer.nowcast.map((frame) => ({ ...frame, kind: "forecast" as const }))
  ];
}

function defaultRadarFrameTime(rainViewer?: RainViewerState) {
  return rainViewer?.past.at(-1)?.time ?? rainViewer?.nowcast[0]?.time;
}

function rainViewerChanged(previous: RainViewerState | undefined, next: RainViewerState) {
  return (
    !previous ||
    previous.generated !== next.generated ||
    defaultRadarFrameTime(previous) !== defaultRadarFrameTime(next) ||
    previous.host !== next.host
  );
}

function rainObservationPointsChanged(previous: RainObservationPoint[], next: RainObservationPoint[]) {
  if (previous.length !== next.length) return true;
  const previousById = new Map(previous.map((point) => [point.id, point]));
  return next.some((point) => {
    const existing = previousById.get(point.id);
    return (
      !existing ||
      existing.observedAt !== point.observedAt ||
      existing.rainfallMm !== point.rainfallMm ||
      existing.past10MinMm !== point.past10MinMm ||
      existing.past1hrMm !== point.past1hrMm
    );
  });
}

function selectedRadarTimelineFrame(rainViewer: RainViewerState | undefined, selectedTime: number | undefined) {
  const frames = radarTimelineFrames(rainViewer);
  const defaultTime = defaultRadarFrameTime(rainViewer);
  return frames.find((frame) => frame.time === selectedTime) ?? frames.find((frame) => frame.time === defaultTime);
}

function radarFrameAbsoluteLabel(frame?: RadarTimelineFrame, language: AppLanguage = "en") {
  if (!frame) return unitCopy[language].waitingForRadar;
  return new Date(frame.time * 1000).toLocaleTimeString(language, {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function radarFrameRelativeLabel(frame: RadarTimelineFrame, latestObservedTime?: number, language: AppLanguage = "en") {
  const ui = unitCopy[language];
  if (!latestObservedTime || frame.time === latestObservedTime) return frame.kind === "forecast" ? ui.forecast : ui.now;
  const minutes = Math.round((frame.time - latestObservedTime) / 60);
  if (minutes === 0) return ui.now;
  return minutes > 0 ? `+${minutes}m` : `${minutes}m`;
}

function radarFrameDetailLabel(frame?: RadarTimelineFrame, latestObservedTime?: number, language: AppLanguage = "en") {
  const ui = unitCopy[language];
  if (!frame) return ui.waitingForRadarFrames;
  const source = frame.kind === "forecast" ? ui.forecast : ui.observedRadar;
  return `${radarFrameRelativeLabel(frame, latestObservedTime, language)} · ${radarFrameAbsoluteLabel(frame, language)} · ${source}`;
}

function notify(title: string, body: string, onClick?: () => void) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const notification = new Notification(title, { body, silent: false });
  if (onClick) {
    notification.onclick = () => {
      window.focus();
      onClick();
      notification.close();
    };
  }
}

function warningSignalSeverity(warning: GdacsAlert): LocalSignal["severity"] {
  const level = `${warning.levelCode ?? warning.alertLevel ?? ""}`.toLowerCase();
  if (level.includes("red") || level.includes("extreme")) return "danger";
  if (level.includes("orange") || level.includes("amber") || level.includes("severe")) return "warning";
  return "watch";
}

function warningCoversLocation(warning: GdacsAlert, location: CityLocation) {
  if (warning.geometry && pointInGeometry(warning.geometry, location.longitude, location.latitude)) return true;
  if (typeof warning.lat !== "number" || typeof warning.lon !== "number") return false;
  return distanceKm(location.latitude, location.longitude, warning.lat, warning.lon) <= 90;
}

function warningToSignal(warning: GdacsAlert): LocalSignal {
  const level = warning.alertLevel ? `${warning.alertLevel} ` : "";
  return {
    id: `warning-${warning.id}`,
    title: `${level}${warning.sourceLabel ?? "Weather"} alert`.trim(),
    detail: [warning.title, warning.areaName].filter(Boolean).join(" - "),
    severity: warningSignalSeverity(warning),
    sourceUrl: warning.link
  };
}

function normalizeDedupeText(value?: string) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\binvolved:\s*.*$/i, "")
    .replace(/\binvolving\b.*?\bnear\b/gi, "near")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function roundedCoordinate(value: number, precision = 10) {
  return Math.round(value * precision) / precision;
}

function riskEventSignalKey(event: RiskSignalEvent) {
  const timeBucket = Math.floor(event.time / (6 * 60 * 60 * 1000));
  return [
    event.sourceLabel,
    event.sourceDomain ?? "",
    event.eventLabel,
    normalizeDedupeText(event.place),
    roundedCoordinate(event.lat),
    roundedCoordinate(event.lon),
    timeBucket
  ].join(":");
}

function riskEventsNearLocation(events: RiskSignalEvent[], location: CityLocation) {
  const nearby = events
    .map((event) => ({
      event,
      distance: distanceKm(location.latitude, location.longitude, event.lat, event.lon)
    }))
    .filter(({ event, distance }) => riskEventPassesLocationProximity(event, location, distance))
    .sort((left, right) => riskSignalSortScore(right.event, right.distance) - riskSignalSortScore(left.event, left.distance));
  const seen = new Set<string>();
  return nearby
    .filter(({ event }) => {
      const key = riskEventSignalKey(event);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(({ event }) => event);
}

function riskEventPassesLocationProximity(event: RiskSignalEvent, location: CityLocation, distance: number) {
  if (distance > 180) return false;
  if (riskEventTextMatchesLocation(event, location)) return true;

  const precision = event.geoType ?? 0;
  if (precision <= 1) return distance <= 70;
  if (precision === 2 || precision === 5) return distance <= 120;

  if (event.country && location.country && normalizeDedupeText(event.country) !== normalizeDedupeText(location.country)) {
    return distance <= 90;
  }

  return true;
}

function riskEventTextMatchesLocation(event: RiskSignalEvent, location: CityLocation) {
  const text = normalizeDedupeText([event.place, event.country, event.title, event.summary].filter(Boolean).join(" "));
  return [location.name, location.admin1, location.country]
    .map((value) => normalizeDedupeText(value))
    .filter((value) => value.length >= 3)
    .some((value) => text.includes(value));
}

function riskSignalSortScore(event: RiskSignalEvent, distance: number) {
  const severity = event.severity === "danger" ? 3 : event.severity === "warning" ? 2 : 1;
  return severity * 120 - distance * 0.35 + Math.log2(event.articles + event.mentions + 1) * 7;
}

function riskEventToSignal(event: RiskSignalEvent, label: string): LocalSignal {
  return {
    id: `risk-${event.id}`,
    title: label,
    detail: [event.summary, event.actors ? `Involved: ${event.actors}` : undefined].filter(Boolean).join(" "),
    severity: event.severity,
    sourceUrl: event.sourceUrl
  };
}

function signalDedupeKey(signal: LocalSignal) {
  const detail = signal.id.startsWith("risk-")
    ? normalizeDedupeText(signal.detail)
    : normalizeDedupeText(signal.detail);
  return [signal.severity, normalizeDedupeText(signal.title), detail].join(":");
}

function dedupeSignals(signals: LocalSignal[]) {
  const seen = new Set<string>();
  return signals.filter((signal) => {
    const key = signalDedupeKey(signal);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function aircraftDisplayScore(plane: AircraftState) {
  return (
    (plane.callsign ? 24 : 0) +
    (plane.velocity ?? 0) / 80 +
    (plane.altitude !== undefined ? 8 : 0) +
    (plane.category !== undefined ? 4 : 0) +
    Math.max(0, 180_000 - (Date.now() - plane.lastContact)) / 20_000
  );
}

function normalizeAircraftFilterText(value?: string | number) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function aircraftMatchesSearch(plane: AircraftState, query: string) {
  const normalizedQuery = normalizeAircraftFilterText(query);
  if (!normalizedQuery) return true;
  const haystack = [
    plane.callsign,
    plane.id,
    plane.registration,
    plane.aircraftModel,
    plane.aircraftType,
    plane.operator,
    plane.originCountry,
    plane.categoryLabel,
    plane.flightStatus
  ].map(normalizeAircraftFilterText).join(" ");
  return normalizedQuery.split(/\s+/).every((token) => haystack.includes(token));
}

function pointInGeometry(geometry: NonNullable<GdacsAlert["geometry"]>, lon: number, lat: number): boolean {
  if (geometry.type === "Polygon") return pointInPolygon(geometry.coordinates, lon, lat);
  if (geometry.type === "MultiPolygon") return geometry.coordinates.some((polygon) => pointInPolygon(polygon, lon, lat));
  if (geometry.type === "GeometryCollection") return geometry.geometries.some((child) => pointInGeometry(child, lon, lat));
  return false;
}

function pointInPolygon(polygon: number[][][], lon: number, lat: number) {
  const [outer, ...holes] = polygon;
  if (!ringContainsPoint(outer, lon, lat)) return false;
  return !holes.some((hole) => ringContainsPoint(hole, lon, lat));
}

function ringContainsPoint(ring: number[][], lon: number, lat: number) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [currentLon, currentLat] = ring[index];
    const [previousLon, previousLat] = ring[previous];
    const intersects = currentLat > lat !== previousLat > lat && lon < ((previousLon - currentLon) * (lat - currentLat)) / (previousLat - currentLat) + currentLon;
    if (intersects) inside = !inside;
  }
  return inside;
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

function nearestKnownAirport(plane: Pick<AircraftState, "lat" | "lon">) {
  return KNOWN_AIRPORTS.reduce<{ airport: (typeof KNOWN_AIRPORTS)[number]; distance: number } | undefined>((nearest, airport) => {
    const distance = distanceKm(plane.lat, plane.lon, airport.lat, airport.lon);
    return !nearest || distance < nearest.distance ? { airport, distance } : nearest;
  }, undefined);
}

function aircraftIsStopped(plane: AircraftState) {
  return plane.onGround === true || (plane.velocity !== undefined && plane.velocity <= 8 && (plane.altitude === undefined || plane.altitude < 450));
}

function aircraftIsProbablyLanded(plane: AircraftState) {
  if (!aircraftIsStopped(plane)) return false;
  const nearest = nearestKnownAirport(plane);
  return !nearest || nearest.distance <= 18;
}

function aircraftStatus(plane?: AircraftState) {
  if (!plane) return { label: "Awaiting live state", warning: false };
  if (!aircraftIsStopped(plane)) return { label: plane.velocity !== undefined ? `${Math.round(plane.velocity)} km/h` : "In flight", warning: false };

  const nearest = nearestKnownAirport(plane);
  if (nearest && nearest.distance <= 18) {
    return { label: `Landed near ${nearest.airport.code}`, detail: nearest.airport.name, warning: false };
  }

  if (nearest && nearest.distance <= 45) {
    return { label: `Stopped near ${nearest.airport.code}`, detail: `${Math.round(nearest.distance)} km from ${nearest.airport.name}`, warning: false };
  }

  return {
    label: "Stopped away from known airport",
    detail: nearest ? `${Math.round(nearest.distance)} km from ${nearest.airport.code}` : "No nearby known airport",
    warning: true
  };
}

function aircraftWithStatus(plane: AircraftState): AircraftState {
  const status = aircraftStatus(plane);
  return {
    ...plane,
    flightStatus: status.label,
    flightStatusDetail: status.detail,
    flightStatusWarning: status.warning
  };
}

function normalizeBearing(bearing: number) {
  return ((bearing % 360) + 360) % 360;
}

function hashLocationId(value: string | number) {
  const text = String(value);
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(31, hash) + text.charCodeAt(index) | 0;
  }
  return hash || -1;
}

function windArrowStyle(direction?: number): CSSProperties {
  const toDirection = typeof direction === "number" ? normalizeBearing(direction + 180) : 0;
  return { "--wind-dir": `${toDirection}deg` } as CSSProperties;
}

function windSummary(speed: number, unit: WindUnit, language: AppLanguage = "en") {
  return `${formatWind(speed, unit)} · ${windStrengthLabel(speed, language)}`;
}

function windReadout(speed: number, direction: number | undefined, unit: WindUnit, language: AppLanguage) {
  return (
    <span className="inline-wind-readout">
      {typeof direction === "number" && (
        <span className="wind-arrow" style={windArrowStyle(direction)} aria-hidden="true">
          ↑
        </span>
      )}
      <span>{windSummary(speed, unit, language)}</span>
    </span>
  );
}

function rainSummary(amount: number, unit: RainUnit) {
  return `${formatRain(amount, unit)} · ${rainIntensityLabel(amount)}`;
}

function localWeatherGridPoint(location: CityLocation | undefined, weather: LocalWeather | undefined, id: string): WeatherGridPoint | undefined {
  const current = weather?.current;
  if (!location || !current) return undefined;
  return {
    id,
    lat: location.latitude,
    lon: location.longitude,
    time: current.time,
    temperature: current.temperature_2m,
    weatherCode: current.weather_code,
    windSpeed: current.wind_speed_10m,
    windGust: current.wind_gusts_10m,
    windDirection: current.wind_direction_10m,
    precipitation: current.precipitation,
    pressure: current.pressure_msl,
    cloudCover: current.cloud_cover
  };
}

function viewportWeatherStep(bounds: AviationBounds | undefined, highResolutionLayer = false) {
  if (!bounds) return undefined;
  const latSpan = Math.abs(bounds.north - bounds.south);
  const rawLonSpan = Math.abs(bounds.east - bounds.west);
  const lonSpan = rawLonSpan > 180 ? 360 - rawLonSpan : rawLonSpan;
  const span = Math.max(latSpan, lonSpan);

  if (highResolutionLayer) {
    if (span <= 12) return 0.35;
    if (span <= 24) return 0.5;
    if (span <= 42) return 1;
    if (span <= 75) return 2.5;
    return 5;
  }

  if (span <= 10) return 0.5;
  if (span <= 28) return 1;
  if (span <= 55) return 2.5;
  if (span <= 85) return 5;
  return 7.5;
}

function viewportWeatherPointLimit(bounds: AviationBounds | undefined, highResolutionLayer: boolean) {
  if (!bounds) return undefined;
  const latSpan = Math.abs(bounds.north - bounds.south);
  const rawLonSpan = Math.abs(bounds.east - bounds.west);
  const lonSpan = rawLonSpan > 180 ? 360 - rawLonSpan : rawLonSpan;
  const span = Math.max(latSpan, lonSpan);

  if (!highResolutionLayer) return 360;
  if (span <= 12) return 1200;
  if (span <= 24) return 1000;
  if (span <= 42) return 820;
  if (span <= 75) return 620;
  return 420;
}

function viewportWeatherBoundsKey(bounds: AviationBounds | undefined) {
  if (!bounds) return "global";
  return [
    bounds.south.toFixed(2),
    bounds.west.toFixed(2),
    bounds.north.toFixed(2),
    bounds.east.toFixed(2)
  ].join(":");
}

function weatherGridPointKey(point: WeatherGridPoint) {
  return `${point.lat.toFixed(3)}:${point.lon.toFixed(3)}`;
}

function weatherGridPointEquals(left: WeatherGridPoint, right: WeatherGridPoint) {
  return (
    left.id === right.id &&
    left.time === right.time &&
    left.temperature === right.temperature &&
    left.weatherCode === right.weatherCode &&
    left.windSpeed === right.windSpeed &&
    left.windGust === right.windGust &&
    left.windDirection === right.windDirection &&
    left.precipitation === right.precipitation &&
    left.precipitationProbability === right.precipitationProbability &&
    left.pressure === right.pressure &&
    left.cloudCover === right.cloudCover
  );
}

function weatherGridPointsEqual(left: WeatherGridPoint[], right: WeatherGridPoint[]) {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  const rightByKey = new Map<string, WeatherGridPoint>();
  right.forEach((point) => rightByKey.set(weatherGridPointKey(point), point));
  return left.every((point) => {
    const match = rightByKey.get(weatherGridPointKey(point));
    return match ? weatherGridPointEquals(point, match) : false;
  });
}

function mergeWeatherGridPoints(current: WeatherGridPoint[], incoming: WeatherGridPoint[], maxPoints = 6000) {
  if (incoming.length === 0) return current;
  const merged = new Map<string, WeatherGridPoint>();
  let changed = false;
  current.forEach((point) => merged.set(weatherGridPointKey(point), point));
  incoming.forEach((point) => {
    const key = weatherGridPointKey(point);
    const existing = merged.get(key);
    if (!existing || !weatherGridPointEquals(existing, point)) changed = true;
    merged.set(key, point);
  });
  if (!changed) return current;
  const points = Array.from(merged.values());
  if (points.length <= maxPoints) return points;
  return points.slice(points.length - maxPoints);
}

function replaceWeatherGridPoints(current: WeatherGridPoint[], incoming: WeatherGridPoint[]) {
  return weatherGridPointsEqual(current, incoming) ? current : incoming;
}

function plusRateLabel(amount: number, unit: RainUnit) {
  const [value, suffix] = formatRainRate(amount, unit).split(" ");
  return suffix ? `${value}+ ${suffix}` : `${value}+`;
}

function plusWindLabel(speed: number, unit: WindUnit) {
  const [value, suffix] = formatWind(speed, unit).split(" ");
  return suffix ? `${value}+ ${suffix}` : `${value}+`;
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia(query);
    const updateMatches = () => setMatches(mediaQuery.matches);
    updateMatches();
    mediaQuery.addEventListener("change", updateMatches);
    return () => mediaQuery.removeEventListener("change", updateMatches);
  }, [query]);

  return matches;
}

export function App() {
  const savedViewSettings = useMemo(() => loadSavedViewSettings(), []);
  const savedTrackedAircraft = useMemo(() => loadSavedTrackedAircraft(), []);
  const [activeLayer, setActiveLayer] = useState<PrimaryLayer>("normal");
  const [showWarnings, setShowWarnings] = useState(savedViewSettings.showWarnings ?? true);
  const [showEarthquakes, setShowEarthquakes] = useState(savedViewSettings.showEarthquakes ?? true);
  const [showTimezones, setShowTimezones] = useState(savedViewSettings.showTimezones ?? false);
  const [showDayNight, setShowDayNight] = useState(savedViewSettings.showDayNight ?? false);
  const [showHomeMarker, setShowHomeMarker] = useState(savedViewSettings.showHomeMarker ?? true);
  const [showAircraftLocations, setShowAircraftLocations] = useState(savedViewSettings.showAircraftLocations ?? savedTrackedAircraft.ids.length > 0);
  const [showAircraftTrails, setShowAircraftTrails] = useState(savedViewSettings.showAircraftTrails ?? savedTrackedAircraft.ids.length > 0);
  const [showAviationIncidents, setShowAviationIncidents] = useState(savedViewSettings.showAviationIncidents ?? false);
  const [aircraftLimit, setAircraftLimit] = useState(savedViewSettings.aircraftLimit ?? 800);
  const [aircraftOriginCountry, setAircraftOriginCountry] = useState(savedViewSettings.aircraftOriginCountry ?? "any");
  const [aircraftSearchQuery, setAircraftSearchQuery] = useState(savedViewSettings.aircraftSearchQuery ?? "");
  const [trackedAircraftIds, setTrackedAircraftIds] = useState<string[]>(savedTrackedAircraft.ids);
  const [hideUntrackedAircraft, setHideUntrackedAircraft] = useState(savedViewSettings.hideUntrackedAircraft ?? false);
  const [trackedDockOpen, setTrackedDockOpen] = useState(savedTrackedAircraft.dockOpen || savedTrackedAircraft.ids.length > 0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mapViewMenuOpen, setMapViewMenuOpen] = useState(false);
  const [placeSearchOpen, setPlaceSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(!loadSavedLocation());
  const [localOpen, setLocalOpen] = useState(false);
  const [homeLocation, setHomeLocation] = useState<CityLocation | undefined>(() => loadSavedLocation());
  const [homeFocusRequest, setHomeFocusRequest] = useState(0);
  const [inspectedLocation, setInspectedLocation] = useState<CityLocation | undefined>();
  const [inspectedFocusRequest, setInspectedFocusRequest] = useState(0);
  const [aircraftFocusRequest, setAircraftFocusRequest] = useState<{ id: string; request: number } | undefined>();
  const [mapLanguage, setMapLanguage] = useState(() => loadSavedMapLanguage());
  const [appLanguage, setAppLanguage] = useState<AppLanguage>(() => loadSavedAppLanguage());
  const [temperatureUnit, setTemperatureUnit] = useState<TemperatureUnit>(savedViewSettings.temperatureUnit ?? "celsius");
  const [windUnit, setWindUnit] = useState<WindUnit>(savedViewSettings.windUnit ?? "ms");
  const [rainUnit, setRainUnit] = useState<RainUnit>(savedViewSettings.rainUnit ?? "mm");
  const [cwaToken, setCwaToken] = useState(() => localStorage.getItem(CWA_TOKEN_KEY) ?? "");
  const [cityQuery, setCityQuery] = useState("");
  const [cityResults, setCityResults] = useState<CityLocation[]>([]);
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<CityLocation[]>([]);
  const [localWeather, setLocalWeather] = useState<LocalWeather | undefined>();
  const [inspectedWeather, setInspectedWeather] = useState<LocalWeather | undefined>();
  const [weatherGrid, setWeatherGrid] = useState<WeatherGridPoint[]>([]);
  const [viewportWeatherGrid, setViewportWeatherGrid] = useState<WeatherGridPoint[]>([]);
  const [earthquakes, setEarthquakes] = useState<EarthquakeEvent[]>([]);
  const [warnings, setWarnings] = useState<GdacsAlert[]>([]);
  const [riskEvents, setRiskEvents] = useState<RiskSignalEvent[]>([]);
  const [aircraft, setAircraft] = useState<AircraftState[]>([]);
  const [trackedAircraftSnapshots, setTrackedAircraftSnapshots] = useState<Record<string, AircraftState>>(savedTrackedAircraft.snapshots);
  const [aircraftTracks, setAircraftTracks] = useState<Record<string, AircraftTrack | undefined>>(savedTrackedAircraft.tracks);
  const [aviationIncidents, setAviationIncidents] = useState<AviationIncident[]>([]);
  const [aviationBounds, setAviationBounds] = useState<AviationBounds | undefined>();
  const [rainViewer, setRainViewer] = useState<RainViewerState | undefined>();
  const [taiwanRainfall, setTaiwanRainfall] = useState<RainObservationPoint[]>([]);
  const [radarFrameTime, setRadarFrameTime] = useState<number | undefined>();
  const [notificationPermission, setNotificationPermission] = useState(() =>
    typeof Notification === "undefined" ? "denied" : Notification.permission
  );
  const [loading, setLoading] = useState({ global: false, local: false, search: false, placeSearch: false, inspected: false });
  const [error, setError] = useState<string | undefined>();
  const [weatherGridError, setWeatherGridError] = useState<string | undefined>();
  const [localError, setLocalError] = useState<string | undefined>();
  const [inspectedError, setInspectedError] = useState<string | undefined>();
  const [updateCheck, setUpdateCheck] = useState<UpdateCheckState>({ status: "idle" });
  const [lastFeedCheck, setLastFeedCheck] = useState<Partial<Record<FeedKey, string>>>({});
  const [lastFeedDataRefresh, setLastFeedDataRefresh] = useState<Partial<Record<FeedKey, string>>>({});
  const [solarTimestamp, setSolarTimestamp] = useState(Date.now());
  const mobileControlPanels = useMediaQuery("(max-width: 620px)");
  const notifiedSignals = useRef<Set<string>>(new Set());
  const notifiedAircraftWarnings = useRef<Set<string>>(new Set());
  const aircraftTrackAttemptedAt = useRef<Record<string, number>>({});
  const homePressTimer = useRef<number | undefined>();
  const homeLongPressTriggered = useRef(false);
  const aviationBoundsRef = useRef<AviationBounds | undefined>();
  const activeLayerStateRef = useRef<PrimaryLayer>(activeLayer);
  const pendingWeatherRefresh = useRef(false);
  const pendingAircraftRefresh = useRef(false);
  const lifecycleRefreshAt = useRef(0);
  const refreshStartedAt = useRef<Partial<Record<RefreshLockKey, number>>>({});
  const mapViewMenuRef = useRef<HTMLDivElement | null>(null);
  const refreshInFlight = useRef({ weatherGrid: false, earthquakes: false, radar: false, warnings: false, risk: false, aircraft: false, aviationIncidents: false });
  const rainViewerRef = useRef<RainViewerState | undefined>();
  const taiwanRainfallRef = useRef<RainObservationPoint[]>([]);
  const cwaTokenRef = useRef(cwaToken);
  const copy = appCopy[appLanguage];
  const updateText = updateCopy[appLanguage];
  const cwaText = cwaTokenCopy[appLanguage];
  const unitSettings = useMemo<UnitSettings>(() => ({ temperatureUnit, windUnit, rainUnit }), [temperatureUnit, windUnit, rainUnit]);

  const weatherSignals = useMemo(() => deriveLocalSignals(localWeather, { ...unitSettings, language: appLanguage }), [localWeather, unitSettings, appLanguage]);
  const inspectedWeatherSignals = useMemo(
    () => deriveLocalSignals(inspectedWeather, { ...unitSettings, language: appLanguage }),
    [inspectedWeather, unitSettings, appLanguage]
  );
  const localWarningSignals = useMemo(
    () => (homeLocation ? warnings.filter((warning) => warningCoversLocation(warning, homeLocation)).slice(0, 4).map(warningToSignal) : []),
    [warnings, homeLocation?.id, homeLocation?.latitude, homeLocation?.longitude]
  );
  const inspectedWarningSignals = useMemo(
    () => (inspectedLocation ? warnings.filter((warning) => warningCoversLocation(warning, inspectedLocation)).slice(0, 4).map(warningToSignal) : []),
    [warnings, inspectedLocation?.id, inspectedLocation?.latitude, inspectedLocation?.longitude]
  );
  const localRiskSignals = useMemo(
    () => (homeLocation ? riskEventsNearLocation(riskEvents, homeLocation).slice(0, 3).map((event) => riskEventToSignal(event, copy.riskNearby)) : []),
    [riskEvents, homeLocation?.id, homeLocation?.latitude, homeLocation?.longitude, copy.riskNearby]
  );
  const inspectedRiskSignals = useMemo(
    () => (inspectedLocation ? riskEventsNearLocation(riskEvents, inspectedLocation).slice(0, 3).map((event) => riskEventToSignal(event, copy.riskNearby)) : []),
    [riskEvents, inspectedLocation?.id, inspectedLocation?.latitude, inspectedLocation?.longitude, copy.riskNearby]
  );
  const localSignals = useMemo(() => dedupeSignals([...localWarningSignals, ...localRiskSignals, ...weatherSignals]), [localWarningSignals, localRiskSignals, weatherSignals]);
  const inspectedSignals = useMemo(
    () => dedupeSignals([...inspectedWarningSignals, ...inspectedRiskSignals, ...inspectedWeatherSignals]),
    [inspectedWarningSignals, inspectedRiskSignals, inspectedWeatherSignals]
  );
  const activeWarnings = warnings.filter((warning) => warning.geometry || typeof warning.lat === "number" && typeof warning.lon === "number");
  const highRiskEvents = riskEvents.filter((event) => event.severity === "danger" || event.severity === "warning");
  const criticalRiskEvents = riskEvents.filter((event) => event.severity === "danger");
  const strongQuakes = earthquakes.filter((quake) => (quake.magnitude ?? 0) >= 4.5);
  const strongestQuake = earthquakes.reduce<EarthquakeEvent | undefined>(
    (strongest, quake) => (quake.magnitude ?? 0) > (strongest?.magnitude ?? 0) ? quake : strongest,
    undefined
  );
  const strongestQuakeLabel = strongestQuake?.magnitude !== undefined ? `M${strongestQuake.magnitude.toFixed(1)}` : "--";
  const aircraftById = useMemo(() => new Map(aircraft.map((plane) => [plane.id, plane])), [aircraft]);
  const visibleAircraft = useMemo(() => {
    const tracked = new Set(trackedAircraftIds);
    const renderLimit = aircraftLimit === 0 ? Number.POSITIVE_INFINITY : aircraftLimit;
    const trackedPlanes = trackedAircraftIds
      .map((id) => aircraftById.get(id) ?? trackedAircraftSnapshots[id])
      .filter((plane): plane is AircraftState => Boolean(plane));
    if (hideUntrackedAircraft) return trackedPlanes.map(aircraftWithStatus);
    const otherPlanes = aircraft
      .filter((plane) => !tracked.has(plane.id))
      .filter((plane) => !aircraftIsProbablyLanded(plane))
      .filter((plane) => aircraftOriginCountry === "any" || plane.originCountry === aircraftOriginCountry)
      .filter((plane) => aircraftMatchesSearch(plane, aircraftSearchQuery))
      .sort((left, right) => aircraftDisplayScore(right) - aircraftDisplayScore(left))
      .slice(0, Math.max(0, renderLimit - trackedPlanes.length));
    return [...trackedPlanes, ...otherPlanes].map(aircraftWithStatus);
  }, [aircraft, aircraftById, aircraftLimit, aircraftOriginCountry, aircraftSearchQuery, hideUntrackedAircraft, trackedAircraftIds, trackedAircraftSnapshots]);
  const aircraftOriginOptions = useMemo(
    () =>
      Array.from(new Set(aircraft.map((plane) => plane.originCountry).filter(Boolean) as string[])).sort((left, right) =>
        left.localeCompare(right, undefined, { sensitivity: "base" })
      ),
    [aircraft]
  );
  const trackedAircraftCards = useMemo(
    () =>
      trackedAircraftIds.map((id) => ({
        id,
        plane: aircraftById.get(id) ?? trackedAircraftSnapshots[id],
        track: aircraftTracks[id]
      })),
    [aircraftById, aircraftTracks, trackedAircraftIds, trackedAircraftSnapshots]
  );
  const homeCurrent = localWeather?.current;
  const inspectedCurrent = inspectedWeather?.current;
  const layerLabel = copy.conditionLabels[activeLayer];
  const unitText = unitCopy[appLanguage];
  const selectedRadarFrame = useMemo(() => selectedRadarTimelineFrame(rainViewer, radarFrameTime), [rainViewer, radarFrameTime]);
  const latestObservedRadarTime = rainViewer?.past.at(-1)?.time;
  const currentWeatherLabel = unitText.now;
  const currentWeatherDetailLabel = forecastTimeLabel(0, appLanguage);
  const radarObservedDetailLabel = radarFrameDetailLabel(selectedRadarFrame, latestObservedRadarTime, appLanguage);
  const temperatureScaleMin = formatTemperature(-30, temperatureUnit);
  const temperatureScaleMax = formatTemperature(50, temperatureUnit);
  const windScaleValues = [0, 15, 35, 60].map((speed) => formatWind(speed, windUnit));
  const windScaleTop = plusWindLabel(90, windUnit);
  const radarScaleValues = [0.2, 1, 3, 8, 18].map((amount) => formatRainRate(amount, rainUnit));
  const radarScaleTop = plusRateLabel(30, rainUnit);
  const liveWeatherPoints = useMemo(
    () =>
      [
        localWeatherGridPoint(homeLocation, localWeather, "live-home"),
        localWeatherGridPoint(inspectedLocation, inspectedWeather, "live-inspected")
      ].filter((point): point is WeatherGridPoint => Boolean(point)),
    [homeLocation, localWeather, inspectedLocation, inspectedWeather]
  );
  const mapLiveWeatherPoints = useMemo(
    () => [...viewportWeatherGrid, ...liveWeatherPoints],
    [viewportWeatherGrid, liveWeatherPoints]
  );
  const mapLanguageLabel = mapLanguages.find((language) => language.id === mapLanguage)?.label ?? "English";
  const appLanguageLabel = appLanguages.find((language) => language.id === appLanguage)?.label ?? "English";
  const activeMapView = mapViews.find((view) => view.id === activeLayer) ?? mapViews[0];
  const ActiveMapViewIcon = activeMapView.icon;
  const localWeatherStatus = localError ? copy.weatherUnavailable : loading.local ? copy.refreshingWeather : copy.refreshingWeather;
  const inspectedWeatherStatus = inspectedError ? copy.weatherUnavailable : loading.inspected ? copy.refreshingWeather : copy.refreshingWeather;
  const homeUpdatedLabel = localWeather?.fetchedAt ? timeAgo(localWeather.fetchedAt, appLanguage) : localError ? copy.unavailable : loading.local ? copy.refreshingLower : "--";
  const inspectedUpdatedLabel = inspectedWeather?.fetchedAt
    ? timeAgo(inspectedWeather.fetchedAt, appLanguage)
    : inspectedError
      ? copy.unavailable
      : loading.inspected
        ? copy.refreshingLower
        : "--";
  const activeFeedKey: FeedKey =
    activeLayer === "radar"
      ? "radar"
      : activeLayer === "temperature" || activeLayer === "wind"
        ? "weather"
        : activeLayer === "seismic"
          ? "earthquakes"
          : activeLayer === "risk"
            ? "risk"
            : "warnings";
  const activeDataRefresh = lastFeedDataRefresh[activeFeedKey];
  const activeFeedChecked = lastFeedCheck[activeFeedKey];
  const activeUpdateLabel = activeDataRefresh
    ? `${copy.updated} ${timeAgo(activeDataRefresh, appLanguage)}${
        activeFeedChecked && activeFeedChecked !== activeDataRefresh ? ` · ${unitText.checked} ${timeAgo(activeFeedChecked, appLanguage)}` : ""
      }`
    : activeFeedChecked
      ? `${unitText.checked} ${timeAgo(activeFeedChecked, appLanguage)}`
      : `${copy.updated} --`;

  function markLiveRefresh(feed: FeedKey, dataChanged = true) {
    const timestamp = new Date().toISOString();
    setLastFeedCheck((state) => ({ ...state, [feed]: timestamp }));
    if (dataChanged) {
      setLastFeedDataRefresh((state) => ({ ...state, [feed]: timestamp }));
    }
  }

  function beginRefreshLock(key: RefreshLockKey) {
    const now = Date.now();
    if (refreshInFlight.current[key]) {
      const startedAt = refreshStartedAt.current[key] ?? now;
      if (now - startedAt < REFRESH_LOCK_STALE_MS) return false;
    }

    refreshInFlight.current[key] = true;
    refreshStartedAt.current[key] = now;
    return true;
  }

  function endRefreshLock(key: RefreshLockKey) {
    refreshInFlight.current[key] = false;
    delete refreshStartedAt.current[key];
  }

  function clearStaleRefreshLocks() {
    const now = Date.now();
    (Object.keys(refreshInFlight.current) as RefreshLockKey[]).forEach((key) => {
      const startedAt = refreshStartedAt.current[key];
      if (!refreshInFlight.current[key] || !startedAt || now - startedAt < REFRESH_LOCK_STALE_MS) return;
      refreshInFlight.current[key] = false;
      delete refreshStartedAt.current[key];
    });
  }

  useEffect(() => {
    aviationBoundsRef.current = aviationBounds;
  }, [aviationBounds]);

  useEffect(() => {
    activeLayerStateRef.current = activeLayer;
  }, [activeLayer]);

  async function refreshWeatherGrid(focused = false, force = false) {
    if (!beginRefreshLock("weatherGrid")) {
      if (focused) pendingWeatherRefresh.current = true;
      return;
    }
    try {
      const currentLayer = activeLayerStateRef.current;
      const currentBounds = aviationBoundsRef.current;
      const requestBoundsKey = viewportWeatherBoundsKey(currentBounds);
      const freshMs = force ? 0 : focused ? LIVE_REFRESH_MS.activeWeatherFresh : LIVE_REFRESH_MS.backgroundWeatherFresh;
      const highResolutionWeatherLayer = currentLayer === "temperature" || currentLayer === "wind";
      const viewportStep = focused ? viewportWeatherStep(currentBounds, highResolutionWeatherLayer) : undefined;
      const viewportMaxPoints = focused ? viewportWeatherPointLimit(currentBounds, highResolutionWeatherLayer) : undefined;
      const cachedGlobalGrid = getCachedWeatherGrid({ maxAgeMs: freshMs });
      if (cachedGlobalGrid?.length) setWeatherGrid((current) => current.length > 0 ? current : cachedGlobalGrid);

      if (focused && currentBounds && viewportStep) {
        const cachedViewportGrid = getCachedWeatherGrid({
          maxAgeMs: freshMs,
          bounds: currentBounds,
          step: viewportStep,
          maxPoints: viewportMaxPoints
        });
        if (cachedViewportGrid?.length) setViewportWeatherGrid((current) => mergeWeatherGridPoints(current, cachedViewportGrid));
      }

      const globalRequest = fetchWeatherGridWithMeta(undefined, { freshMs });
      const viewportRequest =
        focused && currentBounds && viewportStep
          ? fetchWeatherGridWithMeta(undefined, {
              freshMs,
              bounds: currentBounds,
              step: viewportStep,
              maxPoints: viewportMaxPoints
            })
          : undefined;

      const [globalResult, viewportResult] = await Promise.allSettled([
        globalRequest,
        viewportRequest ?? Promise.resolve(undefined)
      ]);

      let checkedWeather = false;
      let fetchedFreshWeather = false;

      if (globalResult.status === "fulfilled" && globalResult.value.points.length) {
        setWeatherGrid((current) => replaceWeatherGridPoints(current, globalResult.value.points));
        checkedWeather = true;
        fetchedFreshWeather ||= !globalResult.value.fromCache;
      }

      const viewportValue = viewportResult.status === "fulfilled" ? viewportResult.value : undefined;
      if (viewportValue?.points.length && requestBoundsKey === viewportWeatherBoundsKey(aviationBoundsRef.current)) {
        setViewportWeatherGrid((current) => mergeWeatherGridPoints(current, viewportValue.points));
        checkedWeather = true;
        fetchedFreshWeather ||= !viewportValue.fromCache;
      }

      if (checkedWeather) {
        setWeatherGridError(undefined);
        markLiveRefresh("weather", fetchedFreshWeather);
      } else if (globalResult.status === "rejected") {
        throw globalResult.reason;
      }
    } catch (err) {
      setWeatherGridError(err instanceof Error ? err.message : "Unable to refresh weather forecast");
      // Keep the last successful global weather layer visible.
    } finally {
      endRefreshLock("weatherGrid");
      if (pendingWeatherRefresh.current) {
        pendingWeatherRefresh.current = false;
        window.setTimeout(() => void refreshWeatherGrid(true), 0);
      }
    }
  }

  async function refreshEarthquakeFeed() {
    if (!beginRefreshLock("earthquakes")) return;
    try {
      setEarthquakes(await fetchEarthquakes());
      markLiveRefresh("earthquakes");
    } catch {
      // Keep the last successful earthquake layer visible.
    } finally {
      endRefreshLock("earthquakes");
    }
  }

  async function loadTaiwanCwaRainfall() {
    const token = cwaTokenRef.current.trim();
    if (!token) return undefined;
    return fetchTaiwanCwaRainfall(token);
  }

  function applyTaiwanCwaRainfall(points: RainObservationPoint[] | undefined) {
    if (!points) return false;
    const changed = rainObservationPointsChanged(taiwanRainfallRef.current, points);
    if (changed) {
      taiwanRainfallRef.current = points;
      setTaiwanRainfall(points);
    }
    return changed;
  }

  async function refreshRadarFeed() {
    if (!beginRefreshLock("radar")) return;
    try {
      const [rainResult, cwaResult] = await Promise.allSettled([
        fetchRainViewer(),
        loadTaiwanCwaRainfall()
      ]);
      let checked = false;
      let changed = false;

      if (rainResult.status === "fulfilled") {
        checked = true;
        changed = rainViewerChanged(rainViewerRef.current, rainResult.value);
        rainViewerRef.current = rainResult.value;
        setRainViewer(rainResult.value);
      }

      if (cwaResult.status === "fulfilled" && cwaResult.value !== undefined) {
        checked = true;
        changed = applyTaiwanCwaRainfall(cwaResult.value) || changed;
      }

      if (!checked) throw rainResult.status === "rejected" ? rainResult.reason : new Error("Unable to refresh radar");
      markLiveRefresh("radar", changed);
    } catch {
      // Keep the last successful radar frame visible.
    } finally {
      endRefreshLock("radar");
    }
  }

  async function refreshWarningFeed() {
    if (!beginRefreshLock("warnings")) return;
    try {
      setWarnings(await fetchGdacsAlerts());
      markLiveRefresh("warnings");
    } catch {
      // Keep the last successful warning layer visible.
    } finally {
      endRefreshLock("warnings");
    }
  }

  async function refreshRiskFeed(force = false) {
    if (!beginRefreshLock("risk")) return;
    try {
      setRiskEvents(await fetchRiskEvents(undefined, { freshMs: force ? 0 : LIVE_REFRESH_MS.risk }));
      markLiveRefresh("risk");
    } catch {
      // Keep the last successful risk layer visible.
    } finally {
      endRefreshLock("risk");
    }
  }

  function rememberTrackedAircraft(planes: AircraftState[]) {
    const tracked = new Set(trackedAircraftIds);
    const trackedPlanes = planes.filter((plane) => tracked.has(plane.id));
    if (trackedPlanes.length === 0) return;
    setTrackedAircraftSnapshots((snapshots) => {
      const next = { ...snapshots };
      trackedPlanes.forEach((plane) => {
        next[plane.id] = { ...next[plane.id], ...plane };
      });
      return next;
    });
  }

  async function refreshTrackedAircraftFeed(force = false) {
    if (trackedAircraftIds.length === 0) return;
    const [trackedStates] = await Promise.all([
      fetchAircraftStatesByIds(trackedAircraftIds, undefined, { freshMs: force ? 0 : LIVE_REFRESH_MS.aircraft }),
      Promise.all(trackedAircraftIds.map((id) => maybeLoadAircraftTrack(id, force)))
    ]);
    rememberTrackedAircraft(trackedStates);
  }

  async function maybeLoadAircraftTrack(id: string, force = false) {
    const now = Date.now();
    if (!force && now - (aircraftTrackAttemptedAt.current[id] ?? 0) < TRACKED_AIRCRAFT_TRACK_RETRY_MS) return;
    aircraftTrackAttemptedAt.current[id] = now;

    const track = await fetchAircraftTrack(id, undefined, { freshMs: force ? 0 : TRACKED_AIRCRAFT_TRACK_RETRY_MS }).catch(() => undefined);
    if (!track) return;
    setAircraftTracks((tracks) => ({ ...tracks, [id]: track }));
  }

  async function refreshAircraftFeed(force = false) {
    if (!beginRefreshLock("aircraft")) {
      pendingAircraftRefresh.current = true;
      return;
    }
    const bounds = aviationBoundsRef.current;
    if (!force) {
      const cachedAircraft = getCachedAircraftStates(bounds);
      if (cachedAircraft.length) {
        setAircraft(cachedAircraft);
        rememberTrackedAircraft(cachedAircraft);
      }
    }
    try {
      const aircraft = await fetchAircraftStates(bounds, undefined, { freshMs: force ? 0 : LIVE_REFRESH_MS.aircraft });
      setAircraft(aircraft);
      rememberTrackedAircraft(aircraft);
      void refreshTrackedAircraftFeed(force);
      markLiveRefresh("aircraft");
    } catch {
      // Keep the last successful aircraft layer visible.
    } finally {
      endRefreshLock("aircraft");
      if (pendingAircraftRefresh.current) {
        pendingAircraftRefresh.current = false;
        window.setTimeout(() => void refreshAircraftFeed(false), 0);
      }
    }
  }

  async function refreshAviationIncidentFeed(force = false) {
    if (!beginRefreshLock("aviationIncidents")) return;
    try {
      setAviationIncidents(await fetchAviationIncidents(undefined, { freshMs: force ? 0 : LIVE_REFRESH_MS.aviationIncidents }));
      markLiveRefresh("aviation");
    } catch {
      // Keep the last successful aviation incident layer visible.
    } finally {
      endRefreshLock("aviationIncidents");
    }
  }

  async function refreshGlobal(force = false) {
    setLoading((state) => ({ ...state, global: true }));
    setError(undefined);
    try {
      const cachedGlobalGrid = getCachedWeatherGrid();
      if (cachedGlobalGrid?.length) setWeatherGrid((current) => current.length > 0 ? current : cachedGlobalGrid);

      const [quakeResult, rainResult, gdacsResult, riskResult, cwaRainResult] = await Promise.allSettled([
        fetchEarthquakes(),
        fetchRainViewer(),
        fetchGdacsAlerts().catch(() => [] as GdacsAlert[]),
        fetchRiskEvents(undefined, { freshMs: force ? 0 : LIVE_REFRESH_MS.risk }).catch(() => [] as RiskSignalEvent[]),
        loadTaiwanCwaRainfall()
      ]);

      if (quakeResult.status === "fulfilled") {
        setEarthquakes(quakeResult.value);
        markLiveRefresh("earthquakes");
      }
      if (rainResult.status === "fulfilled") {
        const changed = rainViewerChanged(rainViewerRef.current, rainResult.value);
        rainViewerRef.current = rainResult.value;
        setRainViewer(rainResult.value);
        markLiveRefresh("radar", changed);
      }
      if (gdacsResult.status === "fulfilled") {
        setWarnings(gdacsResult.value);
        markLiveRefresh("warnings");
      }
      if (riskResult.status === "fulfilled") {
        setRiskEvents(riskResult.value);
        markLiveRefresh("risk");
      }
      if (cwaRainResult.status === "fulfilled" && cwaRainResult.value !== undefined) {
        const changed = applyTaiwanCwaRainfall(cwaRainResult.value);
        if (rainResult.status !== "fulfilled") markLiveRefresh("radar", changed);
      }

      const failedFeeds = [quakeResult, rainResult, gdacsResult, riskResult].filter((result) => result.status === "rejected").length;
      if (failedFeeds === 4) {
        setError("Unable to refresh live map feeds right now");
      }
      if (showAircraftLocations || showAircraftTrails) void refreshAircraftFeed(true);
      if (showAviationIncidents) void refreshAviationIncidentFeed(true);
      setSolarTimestamp(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to refresh global data");
    } finally {
      setLoading((state) => ({ ...state, global: false }));
    }
  }

  async function refreshLocal(location = homeLocation, force = false) {
    if (!location) {
      setLocalWeather(undefined);
      setLocalError(undefined);
      return;
    }
    setLoading((state) => ({ ...state, local: true }));
    setLocalError(undefined);
    try {
      const weather = await fetchLocalWeather(location, undefined, { freshMs: force ? 0 : LIVE_REFRESH_MS.localWeatherFresh });
      setLocalWeather(weather);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Unable to refresh local weather");
    } finally {
      setLoading((state) => ({ ...state, local: false }));
    }
  }

  async function refreshInspected(location = inspectedLocation, force = false) {
    if (!location) {
      setInspectedWeather(undefined);
      setInspectedError(undefined);
      return;
    }
    setLoading((state) => ({ ...state, inspected: true }));
    setInspectedError(undefined);
    try {
      const weather = await fetchLocalWeather(location, undefined, { freshMs: force ? 0 : LIVE_REFRESH_MS.localWeatherFresh });
      setInspectedWeather(weather);
    } catch (err) {
      setInspectedError(err instanceof Error ? err.message : "Unable to refresh local weather");
    } finally {
      setLoading((state) => ({ ...state, inspected: false }));
    }
  }

  function refreshLatestDataNow() {
    const now = Date.now();
    if (now - lifecycleRefreshAt.current < LIFECYCLE_REFRESH_DEBOUNCE_MS) return;
    lifecycleRefreshAt.current = now;
    clearStaleRefreshLocks();
    setSolarTimestamp(now);

    void refreshGlobal(true);
    void refreshWeatherGrid(true, true);
    void refreshLocal(homeLocation, true);
    void refreshInspected(inspectedLocation, true);

    if (showAircraftLocations || showAircraftTrails || trackedAircraftIds.length > 0) {
      void refreshAircraftFeed(true);
      void refreshTrackedAircraftFeed(true);
    }

    if (showAviationIncidents) {
      void refreshAviationIncidentFeed(true);
    }
  }

  useEffect(() => {
    const defaultTime = defaultRadarFrameTime(rainViewer);
    setRadarFrameTime(defaultTime);
  }, [rainViewer]);

  useEffect(() => {
    refreshLatestDataNow();
    const quakeInterval = window.setInterval(() => void refreshEarthquakeFeed(), LIVE_REFRESH_MS.earthquakes);
    const radarInterval = window.setInterval(() => void refreshRadarFeed(), LIVE_REFRESH_MS.radar);
    const warningInterval = window.setInterval(() => void refreshWarningFeed(), LIVE_REFRESH_MS.warnings);
    const riskInterval = window.setInterval(() => void refreshRiskFeed(), LIVE_REFRESH_MS.risk);

    return () => {
      window.clearInterval(quakeInterval);
      window.clearInterval(radarInterval);
      window.clearInterval(warningInterval);
      window.clearInterval(riskInterval);
    };
  }, []);

  useEffect(() => {
    const refreshAfterWake = () => refreshLatestDataNow();
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshAfterWake();
    };
    const refreshAfterPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) refreshAfterWake();
    };
    const unsubscribeSystemResume = window.weatherWatch?.onSystemResume?.(refreshAfterWake);

    window.addEventListener("focus", refreshAfterWake);
    window.addEventListener("online", refreshAfterWake);
    window.addEventListener("pageshow", refreshAfterPageShow);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      unsubscribeSystemResume?.();
      window.removeEventListener("focus", refreshAfterWake);
      window.removeEventListener("online", refreshAfterWake);
      window.removeEventListener("pageshow", refreshAfterPageShow);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [
    homeLocation?.id,
    homeLocation?.latitude,
    homeLocation?.longitude,
    inspectedLocation?.id,
    inspectedLocation?.latitude,
    inspectedLocation?.longitude,
    showAircraftLocations,
    showAircraftTrails,
    showAviationIncidents,
    trackedAircraftIds.join(",")
  ]);

  useEffect(() => {
    if (filtersOpen && mapViewMenuOpen) setMapViewMenuOpen(false);
  }, [filtersOpen, mapViewMenuOpen]);

  useEffect(() => {
    if (!mobileControlPanels || !settingsOpen) return;
    if (filtersOpen) setFiltersOpen(false);
    if (mapViewMenuOpen) setMapViewMenuOpen(false);
  }, [mobileControlPanels, settingsOpen, filtersOpen, mapViewMenuOpen]);

  useEffect(() => {
    if (!mapViewMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (mapViewMenuRef.current?.contains(event.target as Node)) return;
      setMapViewMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMapViewMenuOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mapViewMenuOpen]);

  useEffect(() => {
    const timers: number[] = [];
    const needsWeatherGrid = activeLayer === "temperature" || activeLayer === "wind" || activeLayer === "radar";
    const needsRadar = activeLayer === "radar";
    const needsRisk = activeLayer === "risk";
    const needsEarthquakes = activeLayer === "seismic" || showEarthquakes;
    const needsWarnings = showWarnings;
    const needsAircraft = showAircraftLocations || showAircraftTrails;
    const needsAviationIncidents = showAviationIncidents;

    if (needsWeatherGrid) {
      void refreshWeatherGrid(true);
      timers.push(window.setInterval(() => void refreshWeatherGrid(true), LIVE_REFRESH_MS.focusedWeatherGrid));
    }

    if (needsRadar) {
      void refreshRadarFeed();
      timers.push(window.setInterval(() => void refreshRadarFeed(), LIVE_REFRESH_MS.focusedRadar));
    }

    if (needsEarthquakes) {
      void refreshEarthquakeFeed();
      timers.push(window.setInterval(() => void refreshEarthquakeFeed(), LIVE_REFRESH_MS.focusedEarthquakes));
    }

    if (needsWarnings) {
      void refreshWarningFeed();
      timers.push(window.setInterval(() => void refreshWarningFeed(), LIVE_REFRESH_MS.focusedWarnings));
    }

    if (needsRisk) {
      void refreshRiskFeed();
      timers.push(window.setInterval(() => void refreshRiskFeed(), LIVE_REFRESH_MS.focusedRisk));
    }

    if (needsAircraft) {
      void refreshAircraftFeed();
      void refreshTrackedAircraftFeed();
      timers.push(window.setInterval(() => void refreshAircraftFeed(), LIVE_REFRESH_MS.focusedAircraft));
      timers.push(window.setInterval(() => void refreshTrackedAircraftFeed(), LIVE_REFRESH_MS.focusedAircraft));
    }

    if (needsAviationIncidents) {
      void refreshAviationIncidentFeed();
      timers.push(window.setInterval(() => void refreshAviationIncidentFeed(), LIVE_REFRESH_MS.focusedAviationIncidents));
    }

    return () => {
      timers.forEach((timer) => window.clearInterval(timer));
    };
  }, [activeLayer, showEarthquakes, showWarnings, showAircraftLocations, showAircraftTrails, showAviationIncidents, trackedAircraftIds.join(",")]);

  useEffect(() => {
    if (activeLayer !== "temperature" && activeLayer !== "wind" && activeLayer !== "radar") return;
    const timer = window.setTimeout(() => void refreshWeatherGrid(true), 350);
    return () => window.clearTimeout(timer);
  }, [activeLayer, aviationBounds]);

  useEffect(() => {
    if (!showAircraftLocations && !showAircraftTrails) return;
    const cachedAircraft = getCachedAircraftStates(aviationBounds);
    if (cachedAircraft.length) {
      setAircraft(cachedAircraft);
      rememberTrackedAircraft(cachedAircraft);
    }
    const timer = window.setTimeout(() => void refreshAircraftFeed(false), 500);
    return () => window.clearTimeout(timer);
  }, [aviationBounds, showAircraftLocations, showAircraftTrails]);

  useEffect(() => {
    const timer = window.setInterval(() => setSolarTimestamp(Date.now()), LIVE_REFRESH_MS.dayNight);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    document.documentElement.lang = appLanguage;
  }, [appLanguage]);

  useEffect(() => {
    const trimmedToken = cwaToken.trim();
    cwaTokenRef.current = trimmedToken;
    if (trimmedToken) {
      localStorage.setItem(CWA_TOKEN_KEY, trimmedToken);
      void refreshRadarFeed();
      return;
    }
    localStorage.removeItem(CWA_TOKEN_KEY);
    if (taiwanRainfallRef.current.length > 0) {
      taiwanRainfallRef.current = [];
      setTaiwanRainfall([]);
    }
  }, [cwaToken]);

  useEffect(() => {
    document.title = homeCurrent ? `${formatTemperature(homeCurrent.temperature_2m, temperatureUnit)} · Weather Watch` : "Weather Watch";
  }, [homeCurrent?.temperature_2m, temperatureUnit]);

  useEffect(() => {
    if (!homeLocation || notificationPermission !== "default") return;
    void enableNotifications();
  }, [homeLocation?.id, notificationPermission]);

  useEffect(() => () => {
    if (homePressTimer.current !== undefined) window.clearTimeout(homePressTimer.current);
  }, []);

  useEffect(() => {
    saveViewSettings({
      showWarnings,
      showEarthquakes,
      showTimezones,
      showDayNight,
      showHomeMarker,
      showAircraftLocations,
      showAircraftTrails,
      showAviationIncidents,
      aircraftLimit,
      aircraftOriginCountry,
      aircraftSearchQuery,
      hideUntrackedAircraft,
      temperatureUnit,
      windUnit,
      rainUnit
    });
  }, [
    showWarnings,
    showEarthquakes,
    showTimezones,
    showDayNight,
    showHomeMarker,
    showAircraftLocations,
    showAircraftTrails,
    showAviationIncidents,
    aircraftLimit,
    aircraftOriginCountry,
    aircraftSearchQuery,
    hideUntrackedAircraft,
    temperatureUnit,
    windUnit,
    rainUnit
  ]);

  useEffect(() => {
    saveTrackedAircraftState({
      ids: trackedAircraftIds,
      snapshots: trackedAircraftSnapshots,
      tracks: aircraftTracks,
      dockOpen: trackedDockOpen
    });
  }, [trackedAircraftIds, trackedAircraftSnapshots, aircraftTracks, trackedDockOpen]);

  useEffect(() => {
    void refreshLocal(homeLocation, true);
    const localInterval = window.setInterval(() => void refreshLocal(homeLocation), LIVE_REFRESH_MS.localWeather);
    return () => window.clearInterval(localInterval);
  }, [homeLocation?.id, homeLocation?.latitude, homeLocation?.longitude]);

  useEffect(() => {
    void refreshInspected(inspectedLocation, true);
    const inspectedInterval = window.setInterval(() => void refreshInspected(inspectedLocation), LIVE_REFRESH_MS.localWeather);
    return () => window.clearInterval(inspectedInterval);
  }, [inspectedLocation?.id, inspectedLocation?.latitude, inspectedLocation?.longitude]);

  useEffect(() => {
    if (cityQuery.trim().length < 2) {
      setCityResults([]);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading((state) => ({ ...state, search: true }));
      try {
        setCityResults(await searchCities(cityQuery.trim(), mapLanguage, controller.signal));
      } catch {
        setCityResults([]);
      } finally {
        setLoading((state) => ({ ...state, search: false }));
      }
    }, 220);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [cityQuery, mapLanguage]);

  useEffect(() => {
    if (placeQuery.trim().length < 2) {
      setPlaceResults([]);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading((state) => ({ ...state, placeSearch: true }));
      try {
        setPlaceResults(await searchCities(placeQuery.trim(), mapLanguage, controller.signal));
      } catch {
        setPlaceResults([]);
      } finally {
        setLoading((state) => ({ ...state, placeSearch: false }));
      }
    }, 220);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [placeQuery, mapLanguage]);

  useEffect(() => {
    if (notificationPermission !== "granted") return;

    localSignals
      .filter((signal) => signal.severity === "warning" || signal.severity === "danger")
      .forEach((signal) => {
        const key = `${homeLocation?.id}:${signalDedupeKey(signal)}`;
        if (notifiedSignals.current.has(key)) return;
        notifiedSignals.current.add(key);
        notify(signal.title, `${locationLabel(homeLocation, unitText.noCitySet)}: ${signal.detail}`, () => {
          setLocalOpen(true);
          activateSignal(signal);
        });
      });
  }, [localSignals, notificationPermission, homeLocation?.id, warnings, riskEvents]);

  useEffect(() => {
    void checkForUpdates();
    const interval = window.setInterval(() => void checkForUpdates(), UPDATE_CHECK_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (notificationPermission !== "granted") return;

    trackedAircraftIds.forEach((id) => {
      const plane = aircraftById.get(id) ?? trackedAircraftSnapshots[id];
      const status = aircraftStatus(plane);
      if (!plane || !status.warning) return;
      const key = `${id}:${status.label}:${status.detail ?? ""}`;
      if (notifiedAircraftWarnings.current.has(key)) return;
      notifiedAircraftWarnings.current.add(key);
      notify("Tracked aircraft warning", `${plane.callsign || id.toUpperCase()}: ${status.label}${status.detail ? ` (${status.detail})` : ""}`);
    });
  }, [aircraftById, notificationPermission, trackedAircraftIds, trackedAircraftSnapshots]);

  async function enableNotifications() {
    if (typeof Notification === "undefined") return;
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  }

  async function checkForUpdates() {
    setUpdateCheck((state) => ({ status: "checking", checkedAt: state.checkedAt }));
    try {
      const latest = await fetchLatestReleaseInfo();
      if (compareVersions(latest.latestVersion, __APP_VERSION__) > 0) {
        setUpdateCheck({ status: "available", latestVersion: latest.latestVersion, url: latest.url, checkedAt: Date.now() });
        return;
      }

      setUpdateCheck({ status: "current", checkedAt: Date.now() });
    } catch (err) {
      setUpdateCheck({
        status: "error",
        checkedAt: Date.now(),
        error: err instanceof Error ? err.message : "Unable to check for updates"
      });
    }
  }

  function chooseCity(location: CityLocation) {
    saveLocation(location);
    setHomeLocation(location);
    setLocalWeather(undefined);
    setLocalError(undefined);
    setCityQuery("");
    setCityResults([]);
    setSettingsOpen(false);
    setLocalOpen(true);
    notifiedSignals.current.clear();
  }

  function choosePlace(location: CityLocation) {
    setInspectedLocation(location);
    setInspectedWeather(undefined);
    setInspectedError(undefined);
    setPlaceQuery("");
    setPlaceResults([]);
    setPlaceSearchOpen(false);
    setInspectedFocusRequest((value) => value + 1);
    void refreshInspected(location, true);
  }

  function clearInspectedLocation() {
    setInspectedLocation(undefined);
    setInspectedWeather(undefined);
    setInspectedError(undefined);
    setPlaceQuery("");
    setPlaceResults([]);
  }

  async function toggleTrackedAircraft(id: string) {
    let shouldLoadTrack = false;
    setTrackedAircraftIds((ids) => {
      if (ids.includes(id)) {
        setAircraftTracks((tracks) => {
          const next = { ...tracks };
          delete next[id];
          return next;
        });
        setTrackedAircraftSnapshots((snapshots) => {
          const next = { ...snapshots };
          delete next[id];
          return next;
        });
        delete aircraftTrackAttemptedAt.current[id];
        return ids.filter((trackedId) => trackedId !== id);
      }
      shouldLoadTrack = true;
      return [id, ...ids].slice(0, 12);
    });
    const visiblePlane = aircraftById.get(id);
    if (visiblePlane) {
      setTrackedAircraftSnapshots((snapshots) => ({ ...snapshots, [id]: { ...snapshots[id], ...visiblePlane } }));
    }
    setShowAircraftTrails(true);
    setTrackedDockOpen(true);

    if (shouldLoadTrack) {
      await maybeLoadAircraftTrack(id, true);
      void refreshTrackedAircraftFeed(true);
    }
  }

  function removeTrackedAircraft(id: string) {
    setTrackedAircraftIds((ids) => ids.filter((trackedId) => trackedId !== id));
    setAircraftTracks((tracks) => {
      const next = { ...tracks };
      delete next[id];
      return next;
    });
    setTrackedAircraftSnapshots((snapshots) => {
      const next = { ...snapshots };
      delete next[id];
      return next;
    });
    delete aircraftTrackAttemptedAt.current[id];
  }

  function focusAircraft(plane: AircraftState) {
    setShowAircraftLocations(true);
    setAircraftFocusRequest({ id: plane.id, request: Date.now() });
  }

  function focusSignal(signal: LocalSignal) {
    if (signal.id.startsWith("warning-")) {
      const warning = warnings.find((item) => `warning-${item.id}` === signal.id);
      if (warning && typeof warning.lat === "number" && typeof warning.lon === "number") {
        setShowWarnings(true);
        setInspectedLocation({
          id: -Math.abs(hashLocationId(warning.id)),
          name: warning.title || warning.sourceLabel || copy.warnings,
          admin1: warning.areaName,
          country: warning.sourceLabel,
          latitude: warning.lat,
          longitude: warning.lon
        });
        setInspectedFocusRequest((value) => value + 1);
        return;
      }
    }

    if (signal.id.startsWith("risk-")) {
      const event = riskEvents.find((item) => `risk-${item.id}` === signal.id);
      if (event) {
        setActiveLayer("risk");
        setInspectedLocation({
          id: -Math.abs(hashLocationId(event.id)),
          name: event.title || copy.riskNearby,
          admin1: event.place,
          latitude: event.lat,
          longitude: event.lon
        });
        setInspectedFocusRequest((value) => value + 1);
        return;
      }
    }

    focusHomeLocation();
  }

  function activateSignal(signal: LocalSignal) {
    if (openExternalUrl(signal.sourceUrl)) return;
    focusSignal(signal);
  }

  function startHomePress() {
    homeLongPressTriggered.current = false;
    if (homePressTimer.current !== undefined) window.clearTimeout(homePressTimer.current);
    homePressTimer.current = window.setTimeout(() => {
      homeLongPressTriggered.current = true;
      focusHomeLocation();
    }, 1000);
  }

  function cancelHomePress() {
    if (homePressTimer.current !== undefined) window.clearTimeout(homePressTimer.current);
    homePressTimer.current = undefined;
  }

  function toggleHomePanelFromPress() {
    if (homeLongPressTriggered.current) {
      homeLongPressTriggered.current = false;
      return;
    }
    setLocalOpen((value) => !value);
  }

  function toggleMapViewMenu() {
    setMapViewMenuOpen((open) => {
      const nextOpen = !open;
      if (nextOpen) {
        setFiltersOpen(false);
        if (mobileControlPanels) setSettingsOpen(false);
      }
      return nextOpen;
    });
  }

  function toggleFiltersPanel() {
    setFiltersOpen((open) => {
      const nextOpen = !open;
      if (nextOpen) {
        setMapViewMenuOpen(false);
        if (mobileControlPanels) setSettingsOpen(false);
      }
      return nextOpen;
    });
  }

  function openSettingsPanel() {
    if (mobileControlPanels) {
      setMapViewMenuOpen(false);
      setFiltersOpen(false);
    }
    setSettingsOpen(true);
  }

  function toggleSettingsPanel() {
    setSettingsOpen((open) => {
      const nextOpen = !open;
      if (nextOpen && mobileControlPanels) {
        setMapViewMenuOpen(false);
        setFiltersOpen(false);
      }
      return nextOpen;
    });
  }

  function chooseMapLanguage(language: string) {
    setMapLanguage(language);
    saveMapLanguage(language);
    setCityResults([]);
    setPlaceResults([]);
  }

  function chooseAppLanguage(language: string) {
    if (!isAppLanguage(language)) return;
    setAppLanguage(language);
    saveAppLanguage(language);
  }

  function toggleAllFilters(checked: boolean) {
    setShowEarthquakes(checked);
    setShowWarnings(checked);
    setShowTimezones(checked);
    setShowDayNight(checked);
    setShowHomeMarker(checked);
    setShowAircraftLocations(checked);
    setShowAircraftTrails(checked);
    setShowAviationIncidents(checked);
    if (!checked) {
      setTrackedAircraftIds([]);
      setAircraftTracks({});
      setTrackedAircraftSnapshots({});
      setHideUntrackedAircraft(false);
      setAircraftOriginCountry("any");
      setAircraftSearchQuery("");
    }
  }

  function focusHomeLocation() {
    if (!homeLocation) {
      openSettingsPanel();
      setLocalOpen(true);
      return;
    }

    setShowHomeMarker(true);
    setHomeFocusRequest((value) => value + 1);
  }

  const filterCount = [
    showEarthquakes,
    showWarnings,
    showTimezones,
    showDayNight,
    showHomeMarker,
    showAircraftLocations,
    showAircraftTrails,
    showAviationIncidents
  ].filter(Boolean).length;
  const showPlaceResults = placeSearchOpen && (placeQuery.trim().length >= 2 || loading.placeSearch);
  const controlStackClass = [
    "map-control-stack",
    settingsOpen && (filtersOpen || mapViewMenuOpen) ? "settings-sidecar" : ""
  ].filter(Boolean).join(" ");
  const updateStatusLabel =
    updateCheck.status === "checking" ? updateText.checking :
    updateCheck.status === "available" ? `${updateText.available} ${updateCheck.latestVersion}` :
    updateCheck.status === "current" ? updateText.current :
    updateCheck.status === "error" ? updateText.failed :
    updateText.check;
  const updateStatusTitle =
    updateCheck.status === "available" ? `${updateText.open}: ${updateCheck.latestVersion}` :
    updateCheck.status === "current" ? `${updateText.version} ${__APP_VERSION__}` :
    updateCheck.status === "error" ? `${updateText.failed}${updateCheck.error ? `: ${updateCheck.error}` : ""}` :
    updateText.check;

  return (
    <main className="app-shell">
      <section className="map-stage">
        <WeatherMap
          activeLayer={activeLayer}
          showEarthquakes={showEarthquakes}
          showWarnings={showWarnings}
          showAircraftLocations={showAircraftLocations}
          showAircraftTrails={showAircraftTrails}
          showAviationIncidents={showAviationIncidents}
          showTimezones={showTimezones}
          showDayNight={showDayNight}
          showHomeMarker={showHomeMarker}
          dayNightTimestamp={solarTimestamp}
          weatherGrid={weatherGrid}
          liveWeatherPoints={mapLiveWeatherPoints}
          earthquakes={earthquakes}
          warnings={warnings}
          riskEvents={riskEvents}
          aircraft={visibleAircraft}
          aviationIncidents={aviationIncidents}
          trackedAircraftIds={trackedAircraftIds}
          aircraftTracks={aircraftTracks}
          rainViewer={rainViewer}
          rainObservations={taiwanRainfall}
          rainFrameTime={selectedRadarFrame?.time}
          unitSettings={unitSettings}
          mapLanguage={mapLanguage}
          appLanguage={appLanguage}
          homeFocusRequest={homeFocusRequest}
          inspectedFocusRequest={inspectedFocusRequest}
          aircraftFocusRequest={aircraftFocusRequest}
          onViewportChange={setAviationBounds}
          onToggleAircraftTrack={toggleTrackedAircraft}
          selectedLocation={
            homeLocation
              ? {
                  ...homeLocation,
                  name: homeLocation.name,
                  label: locationLabel(homeLocation, unitText.noCitySet),
                  weather: localWeather?.current,
                  airQuality: localWeather?.airQuality,
                  fetchedAt: localWeather?.fetchedAt,
                  weatherStatus: localWeatherStatus,
                  popupLabel: copy.home
                }
              : undefined
          }
          inspectedLocation={
            inspectedLocation
              ? {
                  ...inspectedLocation,
                  name: inspectedLocation.name,
                  label: locationLabel(inspectedLocation, unitText.noCitySet),
                  weather: inspectedWeather?.current,
                  airQuality: inspectedWeather?.airQuality,
                  fetchedAt: inspectedWeather?.fetchedAt,
                  weatherStatus: inspectedWeatherStatus,
                  popupLabel: copy.location
                }
              : undefined
          }
        />

        <div className={`update-checker ${updateCheck.status}`}>
          <button
            type="button"
            title={updateStatusTitle}
            aria-label={updateStatusTitle}
            onClick={() => {
              if (updateCheck.status === "available") {
                openExternalUrl(updateCheck.url);
                return;
              }
              void checkForUpdates();
            }}
            disabled={updateCheck.status === "checking"}
          >
            {updateCheck.status === "available" ? <Download size={15} /> : updateCheck.status === "checking" ? <RefreshCw size={15} className="spin" /> : <ExternalLink size={15} />}
            <span>{updateStatusLabel}</span>
          </button>
        </div>

        <div className={controlStackClass} ref={mapViewMenuRef}>
          <div className="map-filter-bar">
            <div className={mapViewMenuOpen ? "map-view-control open" : "map-view-control"}>
              <button
                className={mapViewMenuOpen ? "map-view-select active" : "map-view-select"}
                type="button"
                aria-label={copy.mapView}
                aria-haspopup="listbox"
                aria-expanded={mapViewMenuOpen}
                onClick={toggleMapViewMenu}
              >
                <ActiveMapViewIcon size={18} />
                <span className="select-value">{layerLabel}</span>
                <ChevronDown size={16} />
              </button>

              {mapViewMenuOpen && (
                <section className="map-view-menu-panel" role="listbox" aria-label={copy.mapView}>
                  {mapViews.map((view) => {
                    const ViewIcon = view.icon;
                    const selected = activeLayer === view.id;
                    return (
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className={selected ? "active" : ""}
                        onClick={() => {
                          setActiveLayer(view.id);
                          setMapViewMenuOpen(false);
                        }}
                        key={view.id}
                      >
                        <ViewIcon size={16} />
                        <span>{copy.conditionLabels[view.id]}</span>
                      </button>
                    );
                  })}
                </section>
              )}
            </div>

            <button
              className={filtersOpen ? "toolbar-button active" : "toolbar-button"}
              type="button"
              onClick={toggleFiltersPanel}
              aria-expanded={filtersOpen}
            >
              <SlidersHorizontal size={18} />
              {copy.filters}
              <span>{filterCount}</span>
            </button>

            <div className="toolbar-search-wrap">
              <label className="toolbar-search">
                <Search size={17} />
                <input
                  value={placeQuery}
                  onChange={(event) => {
                    setPlaceQuery(event.target.value);
                    setPlaceSearchOpen(true);
                  }}
                  onFocus={() => setPlaceSearchOpen(true)}
                  placeholder={copy.searchLocation}
                  aria-label={copy.searchLocation}
                />
                {placeQuery && (
                  <button type="button" title={copy.close} aria-label={copy.close} onClick={() => {
                    setPlaceQuery("");
                    setPlaceResults([]);
                    setPlaceSearchOpen(false);
                  }}>
                    <X size={14} />
                  </button>
                )}
              </label>

              {showPlaceResults && (
                <section className="floating-panel place-result-panel">
                  <div className="result-list compact-results">
                    {loading.placeSearch && <span className="subtle-line">{copy.searching}</span>}
                    {!loading.placeSearch &&
                      placeResults.map((result) => (
                        <button type="button" key={`${result.id}-${result.latitude}`} onClick={() => choosePlace(result)}>
                          <strong>{result.name}</strong>
                          <span>{[result.admin1, result.country].filter(Boolean).join(", ")}</span>
                        </button>
                      ))}
                  </div>
                </section>
              )}
            </div>

            <button className="toolbar-button icon-only" type="button" title={copy.homeCitySettings} aria-label={copy.homeCitySettings} onClick={toggleSettingsPanel}>
              <Settings size={18} />
            </button>
          </div>

          {filtersOpen && (
            <section className="floating-panel filter-panel">
              <div className="floating-heading">
                <div>
                  <span className="eyebrow">{copy.filters}</span>
                  <h2>{copy.visibleOverlays}</h2>
                </div>
                <div className="mini-actions">
                  <button type="button" onClick={() => toggleAllFilters(true)}>
                    {copy.all}
                  </button>
                  <button type="button" onClick={() => toggleAllFilters(false)}>
                    {copy.none}
                  </button>
                </div>
                <button className="mobile-filter-close" type="button" title={copy.close} aria-label={copy.close} onClick={() => setFiltersOpen(false)}>
                  <X size={20} />
                </button>
              </div>

              <div className="filter-grid">
                <label>
                  <input type="checkbox" checked={showEarthquakes} onChange={(event) => setShowEarthquakes(event.target.checked)} />
                  <Activity size={17} />
                  <span>{copy.earthquakes}</span>
                </label>
                <label>
                  <input type="checkbox" checked={showWarnings} onChange={(event) => setShowWarnings(event.target.checked)} />
                  <TriangleAlert size={17} />
                  <span>{copy.warnings}</span>
                </label>
                <label>
                  <input type="checkbox" checked={showTimezones} onChange={(event) => setShowTimezones(event.target.checked)} />
                  <Clock3 size={17} />
                  <span>{copy.timeZones}</span>
                </label>
                <label>
                  <input type="checkbox" checked={showDayNight} onChange={(event) => setShowDayNight(event.target.checked)} />
                  <Moon size={17} />
                  <span>{copy.dayNight}</span>
                </label>
                <label>
                  <input type="checkbox" checked={showHomeMarker} onChange={(event) => setShowHomeMarker(event.target.checked)} />
                  <Home size={17} />
                  <span>{copy.homeMarker}</span>
                </label>
              </div>

              <div className="filter-category">
                <span className="eyebrow">{copy.aviation}</span>
                <div className="filter-grid">
                  <label>
                    <input type="checkbox" checked={showAircraftLocations} onChange={(event) => setShowAircraftLocations(event.target.checked)} />
                    <Plane size={17} />
                    <span>{copy.aircraftLocations}</span>
                  </label>
                  <label>
                    <input type="checkbox" checked={showAircraftTrails} onChange={(event) => setShowAircraftTrails(event.target.checked)} />
                    <Route size={17} />
                    <span>{copy.aircraftTrails}</span>
                  </label>
                  <label>
                    <input type="checkbox" checked={showAviationIncidents} onChange={(event) => setShowAviationIncidents(event.target.checked)} />
                    <TriangleAlert size={17} />
                    <span>{copy.aviationIncidents}</span>
                  </label>
                  <label>
                    <input type="checkbox" checked={hideUntrackedAircraft} onChange={(event) => setHideUntrackedAircraft(event.target.checked)} />
                    <Plane size={17} />
                    <span>{copy.hideUntrackedAircraft}</span>
                  </label>
                </div>
                <label className="aircraft-search-filter">
                  <span className="settings-select-label">{copy.aircraftSearch}</span>
                  <span className="aircraft-search-input-row">
                    <Search size={15} />
                    <input
                      type="search"
                      value={aircraftSearchQuery}
                      onChange={(event) => setAircraftSearchQuery(event.target.value)}
                      placeholder={copy.aircraftSearchPlaceholder}
                      aria-label={copy.aircraftSearch}
                    />
                    {aircraftSearchQuery ? (
                      <button type="button" onClick={() => setAircraftSearchQuery("")} aria-label={copy.close} title={copy.close}>
                        <X size={14} />
                      </button>
                    ) : null}
                  </span>
                </label>
                <label className="settings-select compact-select">
                  <span className="settings-select-label">{copy.aircraftOrigin}</span>
                  <span className="select-value">{aircraftOriginCountry === "any" ? copy.any : aircraftOriginCountry}</span>
                  <select value={aircraftOriginCountry} onChange={(event) => setAircraftOriginCountry(event.target.value)} aria-label={copy.aircraftOrigin}>
                    <option value="any">{copy.any}</option>
                    {aircraftOriginOptions.map((country) => (
                      <option value={country} key={country}>
                        {country}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={15} />
                </label>
                <label className="settings-select compact-select">
                  <span className="settings-select-label">{copy.aircraftDensity}</span>
                  <span className="select-value">{aircraftLimit === 0 ? copy.all : aircraftLimit}</span>
                  <select value={aircraftLimit} onChange={(event) => setAircraftLimit(Number(event.target.value))} aria-label={copy.aircraftDensity}>
                    <option value={150}>150</option>
                    <option value={400}>400</option>
                    <option value={800}>800</option>
                    <option value={1200}>1200</option>
                    <option value={0}>{copy.all}</option>
                  </select>
                  <ChevronDown size={15} />
                </label>
                <div className="filter-note">
                  {copy.aircraftVisible}: {visibleAircraft.length}/{aircraft.length}
                  {trackedAircraftIds.length > 0 ? ` · ${copy.trackedAircraft}: ${trackedAircraftIds.length}` : ""}
                </div>
              </div>
            </section>
          )}

          {settingsOpen && (
            <section className="floating-panel settings-panel">
              <div className="floating-heading">
                <div>
                  <span className="eyebrow">{copy.settings}</span>
                  <h2>{copy.homeCity}</h2>
                </div>
                <button className="small-icon-button" type="button" title={copy.close} aria-label={copy.closeSettings} onClick={() => setSettingsOpen(false)}>
                  <X size={17} />
                </button>
              </div>

              <label className="search-box">
                <Search size={18} />
                <input value={cityQuery} onChange={(event) => setCityQuery(event.target.value)} placeholder={copy.searchCity} />
              </label>

              <label className="settings-select">
                <span className="settings-select-label">{copy.mapLanguage}</span>
                <span className="select-value">{mapLanguageLabel}</span>
                <select value={mapLanguage} onChange={(event) => chooseMapLanguage(event.target.value)} aria-label={copy.mapLanguage}>
                  {mapLanguages.map((language) => (
                    <option value={language.id} key={language.id}>
                      {language.label}
                    </option>
                  ))}
                </select>
                <ChevronDown size={15} />
              </label>

              <label className="settings-select">
                <span className="settings-select-label">{copy.appLanguage}</span>
                <span className="select-value">{appLanguageLabel}</span>
                <select value={appLanguage} onChange={(event) => chooseAppLanguage(event.target.value)} aria-label={copy.appLanguage}>
                  {appLanguages.map((language) => (
                    <option value={language.id} key={language.id}>
                      {language.label}
                    </option>
                  ))}
                </select>
                <ChevronDown size={15} />
              </label>

              <label className="settings-select">
                <span className="settings-select-label">{unitText.temperatureUnits}</span>
                <span className="select-value">{temperatureUnitOptions.find((option) => option.id === temperatureUnit)?.label}</span>
                <select value={temperatureUnit} onChange={(event) => setTemperatureUnit(event.target.value as TemperatureUnit)} aria-label={unitText.temperatureUnits}>
                  {temperatureUnitOptions.map((option) => (
                    <option value={option.id} key={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown size={15} />
              </label>

              <label className="settings-select">
                <span className="settings-select-label">{unitText.windUnits}</span>
                <span className="select-value">{windUnitOptions.find((option) => option.id === windUnit)?.label}</span>
                <select value={windUnit} onChange={(event) => setWindUnit(event.target.value as WindUnit)} aria-label={unitText.windUnits}>
                  {windUnitOptions.map((option) => (
                    <option value={option.id} key={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown size={15} />
              </label>

              <label className="settings-select">
                <span className="settings-select-label">{unitText.rainUnits}</span>
                <span className="select-value">{rainUnitOptions.find((option) => option.id === rainUnit)?.label}</span>
                <select value={rainUnit} onChange={(event) => setRainUnit(event.target.value as RainUnit)} aria-label={unitText.rainUnits}>
                  {rainUnitOptions.map((option) => (
                    <option value={option.id} key={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown size={15} />
              </label>

              <label className="settings-select text-setting">
                <span className="settings-select-label">{cwaText.token}</span>
                <input
                  value={cwaToken}
                  onChange={(event) => setCwaToken(event.target.value)}
                  placeholder={cwaText.placeholder}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoComplete="off"
                  aria-label={cwaText.token}
                />
              </label>

              <div className="result-list">
                {loading.search && <span className="subtle-line">{copy.searching}</span>}
                {!loading.search &&
                  cityResults.map((result) => (
                    <button type="button" key={`${result.id}-${result.latitude}`} onClick={() => chooseCity(result)}>
                      <strong>{result.name}</strong>
                      <span>{[result.admin1, result.country].filter(Boolean).join(", ")}</span>
                    </button>
                  ))}
              </div>
            </section>
          )}
        </div>

        <section className={trackedDockOpen ? "tracked-flight-dock open" : "tracked-flight-dock"}>
          <button className="tracked-flight-toggle" type="button" onClick={() => setTrackedDockOpen((value) => !value)} aria-expanded={trackedDockOpen}>
            <Plane size={16} />
            <strong>{copy.trackedFlights}</strong>
            <span>{trackedAircraftIds.length}</span>
            <ChevronDown size={15} />
          </button>
          {(trackedDockOpen || trackedAircraftCards.length > 0) && (
            <div className={trackedDockOpen ? "tracked-flight-list" : "tracked-flight-list compact"}>
              {trackedAircraftCards.length === 0 ? (
                <span className="tracked-flight-empty">{copy.noTrackedAircraft}</span>
              ) : (
                trackedAircraftCards.map(({ id, plane, track }) => {
                  const status = aircraftStatus(plane);
                  return (
                    <div className={status.warning ? "tracked-flight-card warning" : "tracked-flight-card"} key={id}>
                      <button className="tracked-flight-focus" type="button" onClick={() => plane && focusAircraft(plane)} disabled={!plane}>
                        <Plane size={16} />
                        <span>
                          <strong>{plane?.callsign || track?.callsign || id.toUpperCase()}</strong>
                          <em>{[plane?.operator, plane?.aircraftModel ?? plane?.aircraftType, plane?.originCountry ?? track?.sourceLabel, status.label].filter(Boolean).join(" · ")}</em>
                        </span>
                      </button>
                      <button
                        className="tracked-flight-remove"
                        type="button"
                        title={copy.close}
                        aria-label={copy.close}
                        onClick={() => removeTrackedAircraft(id)}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </section>

        <div className="location-dock-stack">
          {inspectedLocation && (
            <section className="local-dock inspected-dock open">
              <div className="local-dock-body">
                <div className="local-dock-heading">
                  <div>
                    <span className="eyebrow">{copy.location}</span>
                    <h2>{inspectedLocation.name}</h2>
                    <p>{locationLabel(inspectedLocation, unitText.noCitySet)}</p>
                  </div>
                  <div className="local-dock-actions">
                    <button className="small-icon-button" type="button" title={copy.close} aria-label={copy.close} onClick={clearInspectedLocation}>
                      <X size={17} />
                    </button>
                    <button
                      className="small-icon-button"
                      type="button"
                      title={copy.refreshLocalWeather}
                      aria-label={copy.refreshLocalWeather}
                      onClick={() => void refreshInspected(inspectedLocation, true)}
                    >
                      <RefreshCw size={17} className={loading.inspected ? "spin" : ""} />
                    </button>
                  </div>
                </div>

                {inspectedCurrent ? (
                  <>
                    <div className="current-weather compact-weather">
                      <div>
                        <span className="temp-value">{formatTemperature(inspectedCurrent.temperature_2m, temperatureUnit)}</span>
                        <span className="condition-line">{weatherCodeLabel(inspectedCurrent.weather_code, appLanguage)}</span>
                      </div>
                      <div className="weather-metrics">
                        <span>
                          <Wind size={15} />
                          {windReadout(inspectedCurrent.wind_speed_10m, inspectedCurrent.wind_direction_10m, windUnit, appLanguage)}
                        </span>
                        <span>
                          <CloudRain size={15} />
                          {rainSummary(inspectedCurrent.precipitation, rainUnit)}
                        </span>
                      </div>
                    </div>

                    <div className="metric-row">
                      <div>
                        <span>{copy.feels}</span>
                        <strong>{formatTemperature(inspectedCurrent.apparent_temperature, temperatureUnit)}</strong>
                      </div>
                      <div>
                        <span>{copy.humidity}</span>
                        <strong>{Math.round(inspectedCurrent.relative_humidity_2m)}%</strong>
                      </div>
                      <div>
                        <span>{copy.aqi}</span>
                        <strong>{inspectedWeather?.airQuality?.us_aqi ? Math.round(inspectedWeather.airQuality.us_aqi) : "--"}</strong>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className={inspectedError ? "local-status error" : "local-status"}>
                    <RefreshCw size={17} className={loading.inspected ? "spin" : ""} />
                    <div>
                      <strong>{inspectedError ? copy.weatherUnavailable : copy.refreshingWeather}</strong>
                      <span>{inspectedError ?? copy.fetchingConditions}</span>
                    </div>
                    <button type="button" onClick={() => void refreshInspected(inspectedLocation, true)} disabled={loading.inspected}>
                      {copy.retry}
                    </button>
                  </div>
                )}

                <div className="signal-list">
                  {inspectedSignals.length > 0 ? (
                    inspectedSignals.map((signal) => (
                      <button
                        className={`signal ${signal.severity}${signal.sourceUrl ? " linked" : ""}`}
                        type="button"
                        onClick={() => activateSignal(signal)}
                        title={signal.sourceUrl ? updateText.openLink : undefined}
                        key={signal.id}
                      >
                        <TriangleAlert size={17} />
                        <div>
                          <strong>{signal.title}</strong>
                          <span>{signal.detail}</span>
                        </div>
                        {signal.sourceUrl && <ExternalLink className="signal-link-icon" size={14} />}
                      </button>
                    ))
                  ) : (
                    <div className="signal quiet">
                      <Bell size={17} />
                      <div>
                        <strong>{copy.quietLocally}</strong>
                        <span>{copy.noLocalSignals}</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="panel-footer">
                  <span>{copy.updated} {inspectedUpdatedLabel}</span>
                  <button className="text-button" type="button" onClick={() => {
                    chooseCity(inspectedLocation);
                    clearInspectedLocation();
                  }}>
                    <Home size={14} />
                    {copy.setHomeCity}
                  </button>
                </div>
              </div>
            </section>
          )}

          <section className={localOpen ? "local-dock home-dock open" : "local-dock home-dock"}>
            <div className="local-dock-toggle">
              <button
                className="local-home-focus"
                type="button"
                title={homeLocation ? copy.zoomToHome : copy.setHomeCity}
                aria-label={homeLocation ? copy.zoomToHome : copy.setHomeCity}
                onClick={focusHomeLocation}
              >
                <LocateFixed size={17} />
              </button>
              <button
                className="local-dock-collapse"
                type="button"
                onPointerDown={startHomePress}
                onPointerUp={cancelHomePress}
                onPointerCancel={cancelHomePress}
                onPointerLeave={cancelHomePress}
                onClick={toggleHomePanelFromPress}
                aria-expanded={localOpen}
              >
                <Home size={17} className="mobile-home-button-icon" />
                <span>{homeLocation ? homeLocation.name : copy.setCity}</span>
                <ChevronDown size={16} />
              </button>
            </div>

            {localOpen && (
              <div className="local-dock-body">
                <div className="local-dock-heading">
                  <div>
                    <span className="eyebrow">{copy.home}</span>
                    <h2>{homeLocation ? homeLocation.name : copy.setCity}</h2>
                    <p>{locationLabel(homeLocation, unitText.noCitySet)}</p>
                  </div>
                  <div className="local-dock-actions mobile-home-actions">
                    <button className="small-icon-button mobile-home-close" type="button" title={copy.close} aria-label={copy.close} onClick={() => setLocalOpen(false)}>
                      <X size={17} />
                    </button>
                  </div>
                </div>

                {!homeLocation ? (
                  <button className="primary-action" type="button" onClick={openSettingsPanel}>
                    <LocateFixed size={18} />
                    {copy.setHomeCity}
                  </button>
                ) : homeCurrent ? (
                  <>
                    <div className="current-weather compact-weather">
                      <div>
                        <span className="temp-value">{formatTemperature(homeCurrent.temperature_2m, temperatureUnit)}</span>
                        <span className="condition-line">{weatherCodeLabel(homeCurrent.weather_code, appLanguage)}</span>
                      </div>
                      <div className="weather-metrics">
                        <span>
                          <Wind size={15} />
                          {windReadout(homeCurrent.wind_speed_10m, homeCurrent.wind_direction_10m, windUnit, appLanguage)}
                        </span>
                        <span>
                          <CloudRain size={15} />
                          {rainSummary(homeCurrent.precipitation, rainUnit)}
                        </span>
                      </div>
                    </div>

                    <div className="metric-row">
                      <div>
                        <span>{copy.feels}</span>
                        <strong>{formatTemperature(homeCurrent.apparent_temperature, temperatureUnit)}</strong>
                      </div>
                      <div>
                        <span>{copy.humidity}</span>
                        <strong>{Math.round(homeCurrent.relative_humidity_2m)}%</strong>
                      </div>
                      <div>
                        <span>{copy.aqi}</span>
                        <strong>{localWeather?.airQuality?.us_aqi ? Math.round(localWeather.airQuality.us_aqi) : "--"}</strong>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className={localError ? "local-status error" : "local-status"}>
                    <RefreshCw size={17} className={loading.local ? "spin" : ""} />
                    <div>
                      <strong>{localError ? copy.weatherUnavailable : copy.refreshingWeather}</strong>
                      <span>{localError ?? copy.fetchingConditions}</span>
                    </div>
                  </div>
                )}

                <div className="signal-list">
                  {localSignals.length > 0 ? (
                    localSignals.map((signal) => (
                      <button
                        className={`signal ${signal.severity}${signal.sourceUrl ? " linked" : ""}`}
                        type="button"
                        onClick={() => activateSignal(signal)}
                        title={signal.sourceUrl ? updateText.openLink : undefined}
                        key={signal.id}
                      >
                        <TriangleAlert size={17} />
                        <div>
                          <strong>{signal.title}</strong>
                          <span>{signal.detail}</span>
                        </div>
                        {signal.sourceUrl && <ExternalLink className="signal-link-icon" size={14} />}
                      </button>
                    ))
                  ) : (
                    <div className="signal quiet">
                      <Bell size={17} />
                      <div>
                        <strong>{copy.quietLocally}</strong>
                        <span>{homeLocation ? copy.noLocalSignals : copy.cityRequired}</span>
                      </div>
                    </div>
                  )}
                </div>

              </div>
            )}
          </section>
        </div>

        <div className={`legend${activeLayer === "radar" ? " radar-legend" : activeLayer === "seismic" ? " seismic-legend" : activeLayer === "risk" ? " risk-legend" : ""}`}>
          <div className="legend-title">
            <Globe2 size={15} />
            {layerLabel}
          </div>
          {activeLayer === "temperature" && (
            <div className="temp-scale">
              <span>{temperatureScaleMin}</span>
              <div />
              <span>{temperatureScaleMax}</span>
            </div>
          )}
          {activeLayer === "wind" && (
            <div className="wind-scale">
              <div className="wind-scale-heading">
                <span>{copy.windScaleTitle}</span>
                <b>{currentWeatherLabel}</b>
              </div>
              <div className="wind-gradient" />
              <div className="wind-scale-values" aria-hidden="true">
                {windScaleValues.map((value) => (
                  <span key={value}>{value}</span>
                ))}
                <span>{windScaleTop}</span>
              </div>
              <div className="wind-scale-labels">
                <span>{copy.windCalm}</span>
                <span>{copy.windBreezy}</span>
                <span>{copy.windStrong}</span>
                <span>{copy.windGale}</span>
              </div>
              <p>{currentWeatherDetailLabel} · {copy.windScaleNote}</p>
            </div>
          )}
          {showEarthquakes && activeLayer !== "seismic" && (
            <div className="dot-legend">
              <span className="dot blue" />
              M2.5
              <span className="dot amber" />
              M5+
              <span className="dot red" />
              {copy.tsunamiAlert}
            </div>
          )}
          {activeLayer === "seismic" && (
            <div className="seismic-scale">
              <div>
                <span className="seismic-dot mild" />
                <span>{copy.seismicMild}</span>
              </div>
              <div>
                <span className="seismic-dot severe" />
                <span>{copy.seismicSevere}</span>
              </div>
              <div>
                <span className="seismic-dot alert" />
                <span>{copy.tsunamiAlert}</span>
              </div>
              <p>{copy.seismicLegendNote}</p>
            </div>
          )}
          {activeLayer === "risk" && (
            <div className="risk-scale">
              <div>
                <span className="risk-dot watch" />
                <span>{copy.riskWatch}</span>
              </div>
              <div>
                <span className="risk-dot warning" />
                <span>{copy.riskHigh}</span>
              </div>
              <div>
                <span className="risk-dot danger" />
                <span>{copy.riskCritical}</span>
              </div>
              <p>{copy.riskLegendNote}</p>
            </div>
          )}
          {activeLayer === "radar" && (
            <div className="radar-scale">
              <div className="radar-scale-heading">
                <span>{copy.radarScaleTitle}</span>
                <b>{currentWeatherLabel}</b>
              </div>
              <div className="radar-gradient" />
              <div className="radar-scale-values" aria-hidden="true">
                {radarScaleValues.map((value) => (
                  <span key={value}>{value}</span>
                ))}
                <span>{radarScaleTop}</span>
              </div>
              <div className="radar-scale-labels">
                <span>{copy.radarLight}</span>
                <span>{copy.radarModerate}</span>
                <span>{copy.radarHeavy}</span>
                <span>{copy.radarExtreme}</span>
              </div>
              <p>{radarObservedDetailLabel}</p>
            </div>
          )}
          {showDayNight && <span>{copy.nightMask}</span>}
        </div>

        {error && <div className="error-box">{error}</div>}
      </section>
    </main>
  );
}
