import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Bell,
  BellRing,
  ChevronDown,
  CloudRain,
  Clock3,
  Globe2,
  Home,
  LocateFixed,
  Map as MapIcon,
  Moon,
  RefreshCw,
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
  fetchEarthquakes,
  fetchGdacsAlerts,
  fetchLocalWeather,
  fetchRainViewer,
  fetchRiskEvents,
  fetchWeatherGrid,
  searchCities
} from "./services/weatherApi";
import type { CityLocation, EarthquakeEvent, GdacsAlert, LocalSignal, LocalWeather, PrimaryLayer, RainViewerState, RiskSignalEvent, WeatherGridPoint } from "./types";
import { formatTemperature, formatWind, weatherCodeLabel } from "./utils/weatherCodes";

const LOCATION_KEY = "weather-watch:home-location";
const MAP_LANGUAGE_KEY = "weather-watch:map-language";
const APP_LANGUAGE_KEY = "weather-watch:app-language";
const LIVE_REFRESH_MS = {
  earthquakes: 60 * 1000,
  radar: 60 * 1000,
  risk: 60 * 1000,
  warnings: 60 * 1000,
  globalWeather: 60 * 1000,
  localWeather: 60 * 1000,
  localWeatherFresh: 55 * 1000,
  dayNight: 60 * 1000,
  focusedEarthquakes: 30 * 1000,
  focusedRadar: 60 * 1000,
  focusedRisk: 60 * 1000,
  focusedWarnings: 60 * 1000,
  focusedWeatherGrid: 60 * 1000,
  activeWeatherFresh: 55 * 1000,
  backgroundWeatherFresh: 55 * 1000
};

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

const appCopy = {
  en: {
    all: "All",
    appLanguage: "App language",
    aqi: "AQI",
    cityRequired: "City required for local updates",
    close: "Close",
    closeSettings: "Close settings",
    conditionLabels: {
      normal: "Normal",
      temperature: "Temperature",
      wind: "Wind Speed",
      radar: "Rain Radar",
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
    seismicLegendNote: "Observed multi-source M2.5+ earthquakes from the past day. Glow size scales with magnitude and fades as events age.",
    seismicMild: "Recent M2.5+",
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
    cityRequired: "Stad krävs för lokala uppdateringar",
    close: "Stäng",
    closeSettings: "Stäng inställningar",
    conditionLabels: {
      normal: "Normal",
      temperature: "Temperatur",
      wind: "Vindhastighet",
      radar: "Regnradar",
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
    seismicLegendNote: "Observerade M2.5+-skalv från flera källor det senaste dygnet. Glödens storlek följer magnitud och bleknar med ålder.",
    seismicMild: "Nyliga M2.5+",
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
    cityRequired: "Stadt für lokale Updates erforderlich",
    close: "Schließen",
    closeSettings: "Einstellungen schließen",
    conditionLabels: {
      normal: "Normal",
      temperature: "Temperatur",
      wind: "Windgeschwindigkeit",
      radar: "Regenradar",
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
    seismicLegendNote: "Beobachtete M2.5+-Erdbeben aus mehreren Quellen der letzten 24 Stunden. Die Leuchtgröße folgt der Magnitude und verblasst mit dem Alter.",
    seismicMild: "Aktuelle M2.5+",
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
    cityRequired: "Ville requise pour les mises à jour locales",
    close: "Fermer",
    closeSettings: "Fermer les réglages",
    conditionLabels: {
      normal: "Normal",
      temperature: "Température",
      wind: "Vitesse du vent",
      radar: "Radar pluie",
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
    seismicLegendNote: "Séismes M2.5+ observés via plusieurs sources sur les dernières 24 heures. La taille de la lueur suit la magnitude et s'estompe avec l'âge.",
    seismicMild: "M2.5+ récents",
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
    cityRequired: "Se requiere una ciudad para actualizaciones locales",
    close: "Cerrar",
    closeSettings: "Cerrar ajustes",
    conditionLabels: {
      normal: "Normal",
      temperature: "Temperatura",
      wind: "Velocidad del viento",
      radar: "Radar de lluvia",
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
    seismicLegendNote: "Terremotos M2.5+ observados desde varias fuentes durante el último día. El brillo escala con la magnitud y se desvanece con la antigüedad.",
    seismicMild: "M2.5+ recientes",
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
    cityRequired: "Città richiesta per gli aggiornamenti locali",
    close: "Chiudi",
    closeSettings: "Chiudi impostazioni",
    conditionLabels: {
      normal: "Normale",
      temperature: "Temperatura",
      wind: "Velocità vento",
      radar: "Radar pioggia",
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
    seismicLegendNote: "Terremoti M2.5+ osservati da più fonti nell'ultimo giorno. La dimensione dell'alone segue la magnitudo e svanisce con il tempo.",
    seismicMild: "M2.5+ recenti",
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
    cityRequired: "ローカル更新には都市の設定が必要です",
    close: "閉じる",
    closeSettings: "設定を閉じる",
    conditionLabels: {
      normal: "通常",
      temperature: "気温",
      wind: "風速",
      radar: "雨雲レーダー",
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
    seismicLegendNote: "過去1日に複数ソースで観測されたM2.5以上の地震。光の大きさはマグニチュードに比例し、時間とともに薄くなります。",
    seismicMild: "最近のM2.5+",
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
    cityRequired: "需要设置城市才能获取本地更新",
    close: "关闭",
    closeSettings: "关闭设置",
    conditionLabels: {
      normal: "普通",
      temperature: "温度",
      wind: "风速",
      radar: "降雨雷达",
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
    seismicLegendNote: "过去一天多个来源观测到的 M2.5+ 地震。光晕大小随震级变化，并会随时间淡出。",
    seismicMild: "近期 M2.5+",
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

function locationLabel(location?: CityLocation) {
  if (!location) return "No city set";
  return [location.name, location.admin1, location.country].filter(Boolean).join(", ");
}

function timeAgo(value?: string | number) {
  if (!value) return "--";
  const date = typeof value === "string" ? new Date(value).getTime() : value;
  const seconds = Math.max(0, Math.round((Date.now() - date) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

function notify(title: string, body: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  new Notification(title, { body, silent: false });
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
    severity: warningSignalSeverity(warning)
  };
}

function riskEventsNearLocation(events: RiskSignalEvent[], location: CityLocation) {
  return events
    .map((event) => ({
      event,
      distance: distanceKm(location.latitude, location.longitude, event.lat, event.lon)
    }))
    .filter(({ distance }) => distance <= 180)
    .sort((left, right) => riskSignalSortScore(right.event, right.distance) - riskSignalSortScore(left.event, left.distance))
    .map(({ event }) => event);
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
    severity: event.severity
  };
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

export function App() {
  const [activeLayer, setActiveLayer] = useState<PrimaryLayer>("normal");
  const [showWarnings, setShowWarnings] = useState(true);
  const [showEarthquakes, setShowEarthquakes] = useState(true);
  const [showTimezones, setShowTimezones] = useState(false);
  const [showDayNight, setShowDayNight] = useState(false);
  const [showHomeMarker, setShowHomeMarker] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [placeSearchOpen, setPlaceSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(!loadSavedLocation());
  const [localOpen, setLocalOpen] = useState(false);
  const [homeLocation, setHomeLocation] = useState<CityLocation | undefined>(() => loadSavedLocation());
  const [homeFocusRequest, setHomeFocusRequest] = useState(0);
  const [inspectedLocation, setInspectedLocation] = useState<CityLocation | undefined>();
  const [inspectedFocusRequest, setInspectedFocusRequest] = useState(0);
  const [mapLanguage, setMapLanguage] = useState(() => loadSavedMapLanguage());
  const [appLanguage, setAppLanguage] = useState<AppLanguage>(() => loadSavedAppLanguage());
  const [cityQuery, setCityQuery] = useState("");
  const [cityResults, setCityResults] = useState<CityLocation[]>([]);
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<CityLocation[]>([]);
  const [localWeather, setLocalWeather] = useState<LocalWeather | undefined>();
  const [inspectedWeather, setInspectedWeather] = useState<LocalWeather | undefined>();
  const [weatherGrid, setWeatherGrid] = useState<WeatherGridPoint[]>([]);
  const [earthquakes, setEarthquakes] = useState<EarthquakeEvent[]>([]);
  const [warnings, setWarnings] = useState<GdacsAlert[]>([]);
  const [riskEvents, setRiskEvents] = useState<RiskSignalEvent[]>([]);
  const [rainViewer, setRainViewer] = useState<RainViewerState | undefined>();
  const [notificationPermission, setNotificationPermission] = useState(() =>
    typeof Notification === "undefined" ? "denied" : Notification.permission
  );
  const [loading, setLoading] = useState({ global: false, local: false, search: false, placeSearch: false, inspected: false });
  const [error, setError] = useState<string | undefined>();
  const [localError, setLocalError] = useState<string | undefined>();
  const [inspectedError, setInspectedError] = useState<string | undefined>();
  const [lastGlobalRefresh, setLastGlobalRefresh] = useState<string | undefined>();
  const [solarTimestamp, setSolarTimestamp] = useState(Date.now());
  const notifiedSignals = useRef<Set<string>>(new Set());
  const refreshInFlight = useRef({ weatherGrid: false, earthquakes: false, radar: false, warnings: false, risk: false });
  const copy = appCopy[appLanguage];

  const weatherSignals = useMemo(() => deriveLocalSignals(localWeather), [localWeather]);
  const inspectedWeatherSignals = useMemo(() => deriveLocalSignals(inspectedWeather), [inspectedWeather]);
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
  const localSignals = useMemo(() => [...localWarningSignals, ...localRiskSignals, ...weatherSignals], [localWarningSignals, localRiskSignals, weatherSignals]);
  const inspectedSignals = useMemo(
    () => [...inspectedWarningSignals, ...inspectedRiskSignals, ...inspectedWeatherSignals],
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
  const homeCurrent = localWeather?.current;
  const inspectedCurrent = inspectedWeather?.current;
  const layerLabel = copy.conditionLabels[activeLayer];
  const mapLanguageLabel = mapLanguages.find((language) => language.id === mapLanguage)?.label ?? "English";
  const appLanguageLabel = appLanguages.find((language) => language.id === appLanguage)?.label ?? "English";
  const localWeatherStatus = localError ? copy.weatherUnavailable : loading.local ? copy.refreshingWeather : "Weather updating";
  const inspectedWeatherStatus = inspectedError ? copy.weatherUnavailable : loading.inspected ? copy.refreshingWeather : "Weather updating";
  const homeUpdatedLabel = localWeather?.fetchedAt ? timeAgo(localWeather.fetchedAt) : localError ? copy.unavailable : loading.local ? copy.refreshingLower : "--";
  const inspectedUpdatedLabel = inspectedWeather?.fetchedAt
    ? timeAgo(inspectedWeather.fetchedAt)
    : inspectedError
      ? copy.unavailable
      : loading.inspected
        ? copy.refreshingLower
        : "--";

  function markLiveRefresh() {
    setLastGlobalRefresh(new Date().toISOString());
  }

  async function refreshWeatherGrid(focused = false, force = false) {
    if (refreshInFlight.current.weatherGrid) return;
    refreshInFlight.current.weatherGrid = true;
    try {
      setWeatherGrid(await fetchWeatherGrid(undefined, {
        freshMs: force ? 0 : focused ? LIVE_REFRESH_MS.activeWeatherFresh : LIVE_REFRESH_MS.backgroundWeatherFresh
      }));
      markLiveRefresh();
    } catch {
      // Keep the last successful global weather layer visible.
    } finally {
      refreshInFlight.current.weatherGrid = false;
    }
  }

  async function refreshEarthquakeFeed() {
    if (refreshInFlight.current.earthquakes) return;
    refreshInFlight.current.earthquakes = true;
    try {
      setEarthquakes(await fetchEarthquakes());
      markLiveRefresh();
    } catch {
      // Keep the last successful earthquake layer visible.
    } finally {
      refreshInFlight.current.earthquakes = false;
    }
  }

  async function refreshRadarFeed() {
    if (refreshInFlight.current.radar) return;
    refreshInFlight.current.radar = true;
    try {
      setRainViewer(await fetchRainViewer());
      markLiveRefresh();
    } catch {
      // Keep the last successful radar frame visible.
    } finally {
      refreshInFlight.current.radar = false;
    }
  }

  async function refreshWarningFeed() {
    if (refreshInFlight.current.warnings) return;
    refreshInFlight.current.warnings = true;
    try {
      setWarnings(await fetchGdacsAlerts());
      markLiveRefresh();
    } catch {
      // Keep the last successful warning layer visible.
    } finally {
      refreshInFlight.current.warnings = false;
    }
  }

  async function refreshRiskFeed(force = false) {
    if (refreshInFlight.current.risk) return;
    refreshInFlight.current.risk = true;
    try {
      setRiskEvents(await fetchRiskEvents(undefined, { freshMs: force ? 0 : LIVE_REFRESH_MS.risk }));
      markLiveRefresh();
    } catch {
      // Keep the last successful risk layer visible.
    } finally {
      refreshInFlight.current.risk = false;
    }
  }

  async function refreshGlobal(force = false) {
    setLoading((state) => ({ ...state, global: true }));
    setError(undefined);
    try {
      const [gridResult, quakeResult, rainResult, gdacsResult, riskResult] = await Promise.allSettled([
        fetchWeatherGrid(undefined, { freshMs: force ? 0 : LIVE_REFRESH_MS.backgroundWeatherFresh }),
        fetchEarthquakes(),
        fetchRainViewer(),
        fetchGdacsAlerts().catch(() => [] as GdacsAlert[]),
        fetchRiskEvents(undefined, { freshMs: force ? 0 : LIVE_REFRESH_MS.risk }).catch(() => [] as RiskSignalEvent[])
      ]);

      if (gridResult.status === "fulfilled") setWeatherGrid(gridResult.value);
      if (quakeResult.status === "fulfilled") setEarthquakes(quakeResult.value);
      if (rainResult.status === "fulfilled") setRainViewer(rainResult.value);
      if (gdacsResult.status === "fulfilled") setWarnings(gdacsResult.value);
      if (riskResult.status === "fulfilled") setRiskEvents(riskResult.value);

      const failedFeeds = [gridResult, quakeResult, rainResult, gdacsResult, riskResult].filter((result) => result.status === "rejected").length;
      if (failedFeeds === 5) {
        setError("Unable to refresh live map feeds right now");
      }

      if (failedFeeds < 5) {
        markLiveRefresh();
      }
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

  useEffect(() => {
    void refreshGlobal(true);
    const weatherInterval = window.setInterval(() => void refreshWeatherGrid(), LIVE_REFRESH_MS.globalWeather);
    const quakeInterval = window.setInterval(() => void refreshEarthquakeFeed(), LIVE_REFRESH_MS.earthquakes);
    const radarInterval = window.setInterval(() => void refreshRadarFeed(), LIVE_REFRESH_MS.radar);
    const warningInterval = window.setInterval(() => void refreshWarningFeed(), LIVE_REFRESH_MS.warnings);
    const riskInterval = window.setInterval(() => void refreshRiskFeed(), LIVE_REFRESH_MS.risk);

    return () => {
      window.clearInterval(weatherInterval);
      window.clearInterval(quakeInterval);
      window.clearInterval(radarInterval);
      window.clearInterval(warningInterval);
      window.clearInterval(riskInterval);
    };
  }, []);

  useEffect(() => {
    const timers: number[] = [];
    const needsWeatherGrid = activeLayer === "temperature" || activeLayer === "wind";
    const needsRadar = activeLayer === "radar";
    const needsRisk = activeLayer === "risk";
    const needsEarthquakes = activeLayer === "seismic" || showEarthquakes;
    const needsWarnings = showWarnings;

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

    return () => {
      timers.forEach((timer) => window.clearInterval(timer));
    };
  }, [activeLayer, showEarthquakes, showWarnings]);

  useEffect(() => {
    const timer = window.setInterval(() => setSolarTimestamp(Date.now()), LIVE_REFRESH_MS.dayNight);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    document.documentElement.lang = appLanguage;
  }, [appLanguage]);

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
        const key = `${homeLocation?.id}:${signal.id}:${signal.detail}`;
        if (notifiedSignals.current.has(key)) return;
        notifiedSignals.current.add(key);
        notify(signal.title, `${locationLabel(homeLocation)}: ${signal.detail}`);
      });
  }, [localSignals, notificationPermission, homeLocation?.id]);

  async function enableNotifications() {
    if (typeof Notification === "undefined") return;
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
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
  }

  function focusHomeLocation() {
    if (!homeLocation) {
      setSettingsOpen(true);
      setLocalOpen(true);
      return;
    }

    setShowHomeMarker(true);
    setHomeFocusRequest((value) => value + 1);
  }

  const filterCount = [showEarthquakes, showWarnings, showTimezones, showDayNight, showHomeMarker].filter(Boolean).length;
  const showPlaceResults = placeSearchOpen && (placeQuery.trim().length >= 2 || loading.placeSearch);

  return (
    <main className="app-shell">
      <section className="map-stage">
        <WeatherMap
          activeLayer={activeLayer}
          showEarthquakes={showEarthquakes}
          showWarnings={showWarnings}
          showTimezones={showTimezones}
          showDayNight={showDayNight}
          showHomeMarker={showHomeMarker}
          dayNightTimestamp={solarTimestamp}
          weatherGrid={weatherGrid}
          earthquakes={earthquakes}
          warnings={warnings}
          riskEvents={riskEvents}
          rainViewer={rainViewer}
          mapLanguage={mapLanguage}
          appLanguage={appLanguage}
          homeFocusRequest={homeFocusRequest}
          inspectedFocusRequest={inspectedFocusRequest}
          selectedLocation={
            homeLocation
              ? {
                  ...homeLocation,
                  name: homeLocation.name,
                  label: locationLabel(homeLocation),
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
                  label: locationLabel(inspectedLocation),
                  weather: inspectedWeather?.current,
                  airQuality: inspectedWeather?.airQuality,
                  fetchedAt: inspectedWeather?.fetchedAt,
                  weatherStatus: inspectedWeatherStatus,
                  popupLabel: copy.location
                }
              : undefined
          }
        />

        <div className="map-control-stack">
          <div className="map-filter-bar">
            <label className="map-view-select">
              <Globe2 size={18} />
              <span className="select-value">{layerLabel}</span>
              <select value={activeLayer} onChange={(event) => setActiveLayer(event.target.value as PrimaryLayer)} aria-label={copy.mapView}>
                {mapViews.map((view) => (
                  <option value={view.id} key={view.id}>
                    {copy.conditionLabels[view.id]}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} />
            </label>

            <button
              className={filtersOpen ? "toolbar-button active" : "toolbar-button"}
              type="button"
              onClick={() => setFiltersOpen((value) => !value)}
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

            <button className="toolbar-button icon-only" type="button" title={copy.refreshData} aria-label={copy.refreshData} onClick={() => void refreshGlobal(true)}>
              <RefreshCw size={18} className={loading.global ? "spin" : ""} />
            </button>

            <button className="toolbar-button icon-only" type="button" title={copy.homeCitySettings} aria-label={copy.homeCitySettings} onClick={() => setSettingsOpen((value) => !value)}>
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

        <div className="location-dock-stack">
          {inspectedLocation && (
            <section className="local-dock inspected-dock open">
              <div className="local-dock-body">
                <div className="local-dock-heading">
                  <div>
                    <span className="eyebrow">{copy.location}</span>
                    <h2>{inspectedLocation.name}</h2>
                    <p>{locationLabel(inspectedLocation)}</p>
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
                        <span className="temp-value">{formatTemperature(inspectedCurrent.temperature_2m)}</span>
                        <span className="condition-line">{weatherCodeLabel(inspectedCurrent.weather_code)}</span>
                      </div>
                      <div className="weather-metrics">
                        <span>
                          <Wind size={15} />
                          {formatWind(inspectedCurrent.wind_speed_10m)}
                        </span>
                        <span>
                          <CloudRain size={15} />
                          {inspectedCurrent.precipitation.toFixed(1)} mm
                        </span>
                      </div>
                    </div>

                    <div className="metric-row">
                      <div>
                        <span>{copy.feels}</span>
                        <strong>{formatTemperature(inspectedCurrent.apparent_temperature)}</strong>
                      </div>
                      <div>
                        <span>{copy.gust}</span>
                        <strong>{formatWind(inspectedCurrent.wind_gusts_10m)}</strong>
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
                      <div className={`signal ${signal.severity}`} key={signal.id}>
                        <TriangleAlert size={17} />
                        <div>
                          <strong>{signal.title}</strong>
                          <span>{signal.detail}</span>
                        </div>
                      </div>
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
              <button className="local-dock-collapse" type="button" onClick={() => setLocalOpen((value) => !value)} aria-expanded={localOpen}>
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
                    <p>{locationLabel(homeLocation)}</p>
                  </div>
                  <div className="local-dock-actions">
                    <button className="small-icon-button" type="button" title={copy.refreshLocalWeather} aria-label={copy.refreshLocalWeather} onClick={() => void refreshLocal(homeLocation, true)}>
                      <RefreshCw size={17} className={loading.local ? "spin" : ""} />
                    </button>
                  </div>
                </div>

                {!homeLocation ? (
                  <button className="primary-action" type="button" onClick={() => setSettingsOpen(true)}>
                    <LocateFixed size={18} />
                    {copy.setHomeCity}
                  </button>
                ) : homeCurrent ? (
                  <>
                    <div className="current-weather compact-weather">
                      <div>
                        <span className="temp-value">{formatTemperature(homeCurrent.temperature_2m)}</span>
                        <span className="condition-line">{weatherCodeLabel(homeCurrent.weather_code)}</span>
                      </div>
                      <div className="weather-metrics">
                        <span>
                          <Wind size={15} />
                          {formatWind(homeCurrent.wind_speed_10m)}
                        </span>
                        <span>
                          <CloudRain size={15} />
                          {homeCurrent.precipitation.toFixed(1)} mm
                        </span>
                      </div>
                    </div>

                    <div className="metric-row">
                      <div>
                        <span>{copy.feels}</span>
                        <strong>{formatTemperature(homeCurrent.apparent_temperature)}</strong>
                      </div>
                      <div>
                        <span>{copy.gust}</span>
                        <strong>{formatWind(homeCurrent.wind_gusts_10m)}</strong>
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
                    <button type="button" onClick={() => void refreshLocal(homeLocation, true)} disabled={loading.local}>
                      {copy.retry}
                    </button>
                  </div>
                )}

                <div className="signal-list">
                  {localSignals.length > 0 ? (
                    localSignals.map((signal) => (
                      <div className={`signal ${signal.severity}`} key={signal.id}>
                        <TriangleAlert size={17} />
                        <div>
                          <strong>{signal.title}</strong>
                          <span>{signal.detail}</span>
                        </div>
                      </div>
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

                <div className="panel-footer">
                  <span>{copy.updated} {homeUpdatedLabel}</span>
                  {notificationPermission === "granted" ? (
                    <span className="permission granted">
                      <BellRing size={14} />
                      {copy.desktopAlerts}
                    </span>
                  ) : (
                    <button className="text-button" type="button" onClick={() => void enableNotifications()}>
                      <Bell size={14} />
                      {copy.enableAlerts}
                    </button>
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
              <span>-30</span>
              <div />
              <span>50 C</span>
            </div>
          )}
          {activeLayer === "wind" && (
            <div className="wind-scale">
              <div className="wind-scale-heading">
                <span>{copy.windScaleTitle}</span>
                <b>km/h</b>
              </div>
              <div className="wind-gradient" />
              <div className="wind-scale-values" aria-hidden="true">
                <span>0</span>
                <span>15</span>
                <span>35</span>
                <span>60</span>
                <span>90+</span>
              </div>
              <div className="wind-scale-labels">
                <span>{copy.windCalm}</span>
                <span>{copy.windBreezy}</span>
                <span>{copy.windStrong}</span>
                <span>{copy.windGale}</span>
              </div>
              <p>{copy.windScaleNote}</p>
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
                <b>mm/h</b>
              </div>
              <div className="radar-gradient" />
              <div className="radar-scale-values" aria-hidden="true">
                <span>0.2</span>
                <span>1</span>
                <span>3</span>
                <span>8</span>
                <span>18</span>
                <span>30+</span>
              </div>
              <div className="radar-scale-labels">
                <span>{copy.radarLight}</span>
                <span>{copy.radarModerate}</span>
                <span>{copy.radarHeavy}</span>
                <span>{copy.radarExtreme}</span>
              </div>
              <p>{copy.radarScaleNote}</p>
            </div>
          )}
          {showDayNight && <span>{copy.nightMask}</span>}
        </div>

        <div className="map-status-strip">
          {activeLayer === "seismic" ? (
            <>
              <span>{copy.observedEvents} {earthquakes.length}</span>
              <span>{copy.strongest} {strongestQuakeLabel}</span>
              <span>{copy.strong} {strongQuakes.length}</span>
            </>
          ) : activeLayer === "risk" ? (
            <>
              <span>{copy.riskEvents} {riskEvents.length}</span>
              <span>{copy.riskHigh} {highRiskEvents.length}</span>
              <span>{copy.riskCritical} {criticalRiskEvents.length}</span>
            </>
          ) : (
            <>
              <span>{copy.quakes} {earthquakes.length}</span>
              <span>{copy.strong} {strongQuakes.length}</span>
              <span>{copy.warnings} {activeWarnings.length}</span>
            </>
          )}
          <span>{loading.global ? copy.refreshing : `${copy.updated} ${timeAgo(lastGlobalRefresh)}`}</span>
        </div>

        {error && <div className="error-box">{error}</div>}
      </section>
    </main>
  );
}
