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
  fetchWeatherGrid,
  searchCities
} from "./services/weatherApi";
import type { CityLocation, EarthquakeEvent, GdacsAlert, LocalSignal, LocalWeather, PrimaryLayer, RainViewerState, WeatherGridPoint } from "./types";
import { formatTemperature, formatWind, weatherCodeLabel } from "./utils/weatherCodes";

const LOCATION_KEY = "weather-watch:home-location";
const MAP_LANGUAGE_KEY = "weather-watch:map-language";
const APP_LANGUAGE_KEY = "weather-watch:app-language";
const LIVE_REFRESH_MS = {
  earthquakes: 60 * 1000,
  radar: 60 * 1000,
  warnings: 60 * 1000,
  globalWeather: 60 * 1000,
  localWeather: 60 * 1000,
  localWeatherFresh: 55 * 1000,
  dayNight: 60 * 1000,
  focusedEarthquakes: 30 * 1000,
  focusedRadar: 60 * 1000,
  focusedWarnings: 60 * 1000,
  focusedWeatherGrid: 60 * 1000,
  activeWeatherFresh: 55 * 1000,
  backgroundWeatherFresh: 55 * 1000
};

const mapViews: Array<{ id: PrimaryLayer; label: string; icon: LucideIcon }> = [
  { id: "normal", label: "Normal", icon: MapIcon },
  { id: "temperature", label: "Temperature", icon: Thermometer },
  { id: "radar", label: "Rain Radar", icon: CloudRain },
  { id: "seismic", label: "Seismic Movement", icon: Activity }
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
      radar: "Rain Radar",
      seismic: "Seismic Movement"
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
    searchCity: "Search city",
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
      radar: "Regnradar",
      seismic: "Seismisk rörelse"
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
    searchCity: "Sök stad",
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
      radar: "Regenradar",
      seismic: "Seismische Bewegung"
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
    searchCity: "Stadt suchen",
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
      radar: "Radar pluie",
      seismic: "Mouvement sismique"
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
    searchCity: "Rechercher une ville",
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
      radar: "Radar de lluvia",
      seismic: "Movimiento sísmico"
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
    searchCity: "Buscar ciudad",
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
      radar: "Radar pioggia",
      seismic: "Movimento sismico"
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
    searchCity: "Cerca città",
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
      radar: "雨雲レーダー",
      seismic: "地震活動"
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
    searchCity: "都市を検索",
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
      radar: "降雨雷达",
      seismic: "地震活动"
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
    searchCity: "搜索城市",
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
  const [settingsOpen, setSettingsOpen] = useState(!loadSavedLocation());
  const [localOpen, setLocalOpen] = useState(false);
  const [homeLocation, setHomeLocation] = useState<CityLocation | undefined>(() => loadSavedLocation());
  const [homeFocusRequest, setHomeFocusRequest] = useState(0);
  const [mapLanguage, setMapLanguage] = useState(() => loadSavedMapLanguage());
  const [appLanguage, setAppLanguage] = useState<AppLanguage>(() => loadSavedAppLanguage());
  const [cityQuery, setCityQuery] = useState("");
  const [cityResults, setCityResults] = useState<CityLocation[]>([]);
  const [localWeather, setLocalWeather] = useState<LocalWeather | undefined>();
  const [weatherGrid, setWeatherGrid] = useState<WeatherGridPoint[]>([]);
  const [earthquakes, setEarthquakes] = useState<EarthquakeEvent[]>([]);
  const [warnings, setWarnings] = useState<GdacsAlert[]>([]);
  const [rainViewer, setRainViewer] = useState<RainViewerState | undefined>();
  const [notificationPermission, setNotificationPermission] = useState(() =>
    typeof Notification === "undefined" ? "denied" : Notification.permission
  );
  const [loading, setLoading] = useState({ global: false, local: false, search: false });
  const [error, setError] = useState<string | undefined>();
  const [localError, setLocalError] = useState<string | undefined>();
  const [lastGlobalRefresh, setLastGlobalRefresh] = useState<string | undefined>();
  const [solarTimestamp, setSolarTimestamp] = useState(Date.now());
  const notifiedSignals = useRef<Set<string>>(new Set());
  const refreshInFlight = useRef({ weatherGrid: false, earthquakes: false, radar: false, warnings: false });

  const weatherSignals = useMemo(() => deriveLocalSignals(localWeather), [localWeather]);
  const localWarningSignals = useMemo(
    () => (homeLocation ? warnings.filter((warning) => warningCoversLocation(warning, homeLocation)).slice(0, 4).map(warningToSignal) : []),
    [warnings, homeLocation?.id, homeLocation?.latitude, homeLocation?.longitude]
  );
  const localSignals = useMemo(() => [...localWarningSignals, ...weatherSignals], [localWarningSignals, weatherSignals]);
  const activeWarnings = warnings.filter((warning) => warning.geometry || typeof warning.lat === "number" && typeof warning.lon === "number");
  const strongQuakes = earthquakes.filter((quake) => (quake.magnitude ?? 0) >= 4.5);
  const strongestQuake = earthquakes.reduce<EarthquakeEvent | undefined>(
    (strongest, quake) => (quake.magnitude ?? 0) > (strongest?.magnitude ?? 0) ? quake : strongest,
    undefined
  );
  const strongestQuakeLabel = strongestQuake?.magnitude !== undefined ? `M${strongestQuake.magnitude.toFixed(1)}` : "--";
  const current = localWeather?.current;
  const copy = appCopy[appLanguage];
  const layerLabel = copy.conditionLabels[activeLayer];
  const mapLanguageLabel = mapLanguages.find((language) => language.id === mapLanguage)?.label ?? "English";
  const appLanguageLabel = appLanguages.find((language) => language.id === appLanguage)?.label ?? "English";
  const localWeatherStatus = localError ? copy.weatherUnavailable : loading.local ? copy.refreshingWeather : "Weather updating";
  const localUpdatedLabel = localWeather?.fetchedAt ? timeAgo(localWeather.fetchedAt) : localError ? copy.unavailable : loading.local ? copy.refreshingLower : "--";

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

  async function refreshGlobal(force = false) {
    setLoading((state) => ({ ...state, global: true }));
    setError(undefined);
    try {
      const [gridResult, quakeResult, rainResult, gdacsResult] = await Promise.allSettled([
        fetchWeatherGrid(undefined, { freshMs: force ? 0 : LIVE_REFRESH_MS.backgroundWeatherFresh }),
        fetchEarthquakes(),
        fetchRainViewer(),
        fetchGdacsAlerts().catch(() => [] as GdacsAlert[])
      ]);

      if (gridResult.status === "fulfilled") setWeatherGrid(gridResult.value);
      if (quakeResult.status === "fulfilled") setEarthquakes(quakeResult.value);
      if (rainResult.status === "fulfilled") setRainViewer(rainResult.value);
      if (gdacsResult.status === "fulfilled") setWarnings(gdacsResult.value);

      const failedFeeds = [gridResult, quakeResult, rainResult, gdacsResult].filter((result) => result.status === "rejected").length;
      if (failedFeeds === 4) {
        setError("Unable to refresh live map feeds right now");
      }

      if (failedFeeds < 4) {
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

  useEffect(() => {
    void refreshGlobal(true);
    const weatherInterval = window.setInterval(() => void refreshWeatherGrid(), LIVE_REFRESH_MS.globalWeather);
    const quakeInterval = window.setInterval(() => void refreshEarthquakeFeed(), LIVE_REFRESH_MS.earthquakes);
    const radarInterval = window.setInterval(() => void refreshRadarFeed(), LIVE_REFRESH_MS.radar);
    const warningInterval = window.setInterval(() => void refreshWarningFeed(), LIVE_REFRESH_MS.warnings);

    return () => {
      window.clearInterval(weatherInterval);
      window.clearInterval(quakeInterval);
      window.clearInterval(radarInterval);
      window.clearInterval(warningInterval);
    };
  }, []);

  useEffect(() => {
    const timers: number[] = [];
    const needsWeatherGrid = activeLayer === "temperature";
    const needsRadar = activeLayer === "radar";
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

  function chooseMapLanguage(language: string) {
    setMapLanguage(language);
    saveMapLanguage(language);
    setCityResults([]);
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
          rainViewer={rainViewer}
          mapLanguage={mapLanguage}
          appLanguage={appLanguage}
          homeFocusRequest={homeFocusRequest}
          selectedLocation={
            homeLocation
              ? {
                  ...homeLocation,
                  name: homeLocation.name,
                  label: locationLabel(homeLocation),
                  weather: localWeather?.current,
                  airQuality: localWeather?.airQuality,
                  fetchedAt: localWeather?.fetchedAt,
                  weatherStatus: localWeatherStatus
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

        <section className={localOpen ? "local-dock open" : "local-dock"}>
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
                <button className="small-icon-button" type="button" title={copy.refreshLocalWeather} aria-label={copy.refreshLocalWeather} onClick={() => void refreshLocal(homeLocation, true)}>
                  <RefreshCw size={17} className={loading.local ? "spin" : ""} />
                </button>
              </div>

              {!homeLocation ? (
                <button className="primary-action" type="button" onClick={() => setSettingsOpen(true)}>
                  <LocateFixed size={18} />
                  {copy.setHomeCity}
                </button>
              ) : current ? (
                <>
                  <div className="current-weather compact-weather">
                    <div>
                      <span className="temp-value">{formatTemperature(current.temperature_2m)}</span>
                      <span className="condition-line">{weatherCodeLabel(current.weather_code)}</span>
                    </div>
                    <div className="weather-metrics">
                      <span>
                        <Wind size={15} />
                        {formatWind(current.wind_speed_10m)}
                      </span>
                      <span>
                        <CloudRain size={15} />
                        {current.precipitation.toFixed(1)} mm
                      </span>
                    </div>
                  </div>

                  <div className="metric-row">
                    <div>
                      <span>{copy.feels}</span>
                      <strong>{formatTemperature(current.apparent_temperature)}</strong>
                    </div>
                    <div>
                      <span>{copy.gust}</span>
                      <strong>{formatWind(current.wind_gusts_10m)}</strong>
                    </div>
                    <div>
                      <span>{copy.humidity}</span>
                      <strong>{Math.round(current.relative_humidity_2m)}%</strong>
                    </div>
                    <div>
                      <span>{copy.aqi}</span>
                      <strong>{localWeather.airQuality?.us_aqi ? Math.round(localWeather.airQuality.us_aqi) : "--"}</strong>
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
                <span>{copy.updated} {localUpdatedLabel}</span>
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

        <div className={`legend${activeLayer === "radar" ? " radar-legend" : activeLayer === "seismic" ? " seismic-legend" : ""}`}>
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
