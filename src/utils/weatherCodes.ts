export function weatherCodeLabel(code: number) {
  if (code === 0) return "Clear";
  if ([1, 2, 3].includes(code)) return "Clouds";
  if ([45, 48].includes(code)) return "Fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Storm";
  return "Weather";
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

export function formatTemperature(temp?: number) {
  if (typeof temp !== "number" || Number.isNaN(temp)) return "--";
  return `${Math.round(temp)}\u00b0C`;
}

export function formatWind(speed?: number) {
  if (typeof speed !== "number" || Number.isNaN(speed)) return "--";
  return `${Math.round(speed)} km/h`;
}
