type SupportedLanguage = "en" | "sv" | "de" | "fr" | "es" | "it" | "ja" | "zh";

const weatherCodeLabels = {
  en: { clear: "Clear", clouds: "Clouds", fog: "Fog", drizzle: "Drizzle", rain: "Rain", snow: "Snow", storm: "Storm", weather: "Weather" },
  sv: { clear: "Klart", clouds: "Moln", fog: "Dimma", drizzle: "Duggregn", rain: "Regn", snow: "Snö", storm: "Åska", weather: "Väder" },
  de: { clear: "Klar", clouds: "Wolken", fog: "Nebel", drizzle: "Nieselregen", rain: "Regen", snow: "Schnee", storm: "Gewitter", weather: "Wetter" },
  fr: { clear: "Dégagé", clouds: "Nuages", fog: "Brouillard", drizzle: "Bruine", rain: "Pluie", snow: "Neige", storm: "Orage", weather: "Météo" },
  es: { clear: "Despejado", clouds: "Nubes", fog: "Niebla", drizzle: "Llovizna", rain: "Lluvia", snow: "Nieve", storm: "Tormenta", weather: "Clima" },
  it: { clear: "Sereno", clouds: "Nuvole", fog: "Nebbia", drizzle: "Pioviggine", rain: "Pioggia", snow: "Neve", storm: "Temporale", weather: "Meteo" },
  ja: { clear: "晴れ", clouds: "曇り", fog: "霧", drizzle: "霧雨", rain: "雨", snow: "雪", storm: "雷雨", weather: "天気" },
  zh: { clear: "晴", clouds: "多云", fog: "雾", drizzle: "毛毛雨", rain: "雨", snow: "雪", storm: "雷暴", weather: "天气" }
} satisfies Record<SupportedLanguage, Record<string, string>>;

const windStrengthLabels = {
  en: ["Calm", "Weak", "Moderate", "Strong", "Very strong", "Gale", "Storm-force"],
  sv: ["Lugnt", "Svag", "Måttlig", "Stark", "Mycket stark", "Kuling", "Stormstyrka"],
  de: ["Ruhig", "Schwach", "Mäßig", "Stark", "Sehr stark", "Sturm", "Orkanartig"],
  fr: ["Calme", "Faible", "Modéré", "Fort", "Très fort", "Coup de vent", "Tempête"],
  es: ["Calma", "Débil", "Moderado", "Fuerte", "Muy fuerte", "Temporal", "Tormenta"],
  it: ["Calmo", "Debole", "Moderato", "Forte", "Molto forte", "Burrasca", "Tempesta"],
  ja: ["穏やか", "弱い", "中程度", "強い", "非常に強い", "強風", "暴風"],
  zh: ["平静", "弱", "中等", "强", "很强", "大风", "暴风"]
} satisfies Record<SupportedLanguage, string[]>;

const rainIntensityLabels = {
  en: ["Dry", "Light", "Moderate", "Heavy", "Very heavy", "Extreme"],
  sv: ["Torrt", "Lätt", "Måttligt", "Kraftigt", "Mycket kraftigt", "Extremt"],
  de: ["Trocken", "Leicht", "Mäßig", "Stark", "Sehr stark", "Extrem"],
  fr: ["Sec", "Faible", "Modérée", "Forte", "Très forte", "Extrême"],
  es: ["Seco", "Ligera", "Moderada", "Fuerte", "Muy fuerte", "Extrema"],
  it: ["Asciutto", "Leggera", "Moderata", "Forte", "Molto forte", "Estrema"],
  ja: ["なし", "弱い", "中程度", "強い", "非常に強い", "猛烈"],
  zh: ["干燥", "小", "中等", "强", "很强", "极端"]
} satisfies Record<SupportedLanguage, string[]>;

function normalizeLanguage(language?: string): SupportedLanguage {
  return language && language in weatherCodeLabels ? language as SupportedLanguage : "en";
}

function weatherCodeKey(code: number) {
  if (code === 0) return "clear";
  if ([1, 2, 3].includes(code)) return "clouds";
  if ([45, 48].includes(code)) return "fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([95, 96, 99].includes(code)) return "storm";
  return "weather";
}

export function weatherCodeLabel(code: number, language = "en") {
  const lang = normalizeLanguage(language);
  return weatherCodeLabels[lang][weatherCodeKey(code)] ?? weatherCodeLabels.en.weather;
}

export function weatherCodeTone(code: number) {
  if (code === 0) return "#f4c542";
  if ([1, 2, 3].includes(code)) return "#8fb3d9";
  if ([45, 48].includes(code)) return "#a8b3bd";
  if ([51, 53, 55, 56, 57].includes(code)) return "#63b3ed";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "#2878d0";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "#d7f5ff";
  if ([95, 96, 99].includes(code)) return "#b24cff";
  return "#8fb3d9";
}

export function weatherCodeRgb(code: number) {
  const hex = weatherCodeTone(code).replace("#", "");
  const value = Number.parseInt(hex, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function temperatureRgb(temp: number) {
  const stops = [
    { t: -30, c: [42, 72, 167] },
    { t: -10, c: [67, 151, 219] },
    { t: 5, c: [115, 202, 190] },
    { t: 18, c: [248, 217, 102] },
    { t: 28, c: [241, 137, 57] },
    { t: 40, c: [205, 54, 72] },
    { t: 52, c: [102, 37, 99] }
  ];

  const lower = [...stops].reverse().find((stop) => temp >= stop.t) ?? stops[0];
  const upper = stops.find((stop) => temp <= stop.t) ?? stops[stops.length - 1];

  if (lower === upper) {
    return lower.c;
  }

  const range = upper.t - lower.t || 1;
  const pct = Math.min(1, Math.max(0, (temp - lower.t) / range));
  return lower.c.map((value, index) => Math.round(value + (upper.c[index] - value) * pct));
}

export function temperatureColor(temp: number, alpha = 0.78) {
  const rgb = temperatureRgb(temp);
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

export type TemperatureUnit = "celsius" | "fahrenheit" | "kelvin";
export type WindUnit = "ms" | "kmh" | "mph" | "knots";
export type RainUnit = "mm" | "in";

export interface UnitSettings {
  temperatureUnit: TemperatureUnit;
  windUnit: WindUnit;
  rainUnit: RainUnit;
}

export function formatTemperature(temp?: number, unit: TemperatureUnit = "celsius") {
  if (typeof temp !== "number" || Number.isNaN(temp)) return "--";
  if (unit === "fahrenheit") return `${Math.round((temp * 9) / 5 + 32)}\u00b0F`;
  if (unit === "kelvin") return `${Math.round(temp + 273.15)} K`;
  return `${Math.round(temp)}\u00b0C`;
}

export function formatWind(speed?: number, unit: WindUnit = "kmh") {
  if (typeof speed !== "number" || Number.isNaN(speed)) return "--";
  if (unit === "ms") return `${(speed / 3.6).toFixed(speed < 18 ? 1 : 0)} m/s`;
  if (unit === "mph") return `${Math.round(speed * 0.621371)} mph`;
  if (unit === "knots") return `${Math.round(speed * 0.539957)} kn`;
  return `${Math.round(speed)} km/h`;
}

export function formatRain(amount?: number, unit: RainUnit = "mm") {
  if (typeof amount !== "number" || Number.isNaN(amount)) return "--";
  if (unit === "in") {
    const inches = amount / 25.4;
    return `${inches < 0.1 ? inches.toFixed(2) : inches.toFixed(1)} in`;
  }
  return `${amount < 10 ? amount.toFixed(1) : Math.round(amount)} mm`;
}

export function formatRainRate(amount?: number, unit: RainUnit = "mm") {
  const value = formatRain(amount, unit);
  return value === "--" ? value : `${value}/h`;
}

export function formatRainRateRange(range: [number, number?] | undefined, unit: RainUnit = "mm") {
  if (!range) return "--";
  const [min, max] = range;
  if (max === undefined) return `${formatRain(min, unit)}+/h`;
  if (min === max) return formatRainRate(min, unit);
  const suffix = unit === "in" ? " in/h" : " mm/h";
  const formatValue = (value: number) => {
    if (unit === "in") {
      const inches = value / 25.4;
      return inches < 0.1 ? inches.toFixed(2) : inches.toFixed(1);
    }
    return value < 10 ? value.toFixed(1) : String(Math.round(value));
  };
  return `${formatValue(min)}-${formatValue(max)}${suffix}`;
}

export function windStrengthLabel(windSpeedKmh: number, language = "en") {
  const labels = windStrengthLabels[normalizeLanguage(language)];
  if (windSpeedKmh < 6) return labels[0];
  if (windSpeedKmh < 20) return labels[1];
  if (windSpeedKmh < 39) return labels[2];
  if (windSpeedKmh < 62) return labels[3];
  if (windSpeedKmh < 88) return labels[4];
  if (windSpeedKmh < 118) return labels[5];
  return labels[6];
}

export function rainIntensityLabel(amountMm: number, language = "en") {
  const labels = rainIntensityLabels[normalizeLanguage(language)];
  if (amountMm < 0.1) return labels[0];
  if (amountMm < 1) return labels[1];
  if (amountMm < 3) return labels[2];
  if (amountMm < 8) return labels[3];
  if (amountMm < 18) return labels[4];
  return labels[5];
}
