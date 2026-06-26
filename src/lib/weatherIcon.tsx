import React from "react";
import { Sun, CloudSun, Cloud, CloudRain, CloudLightning, CloudDrizzle, type LucideProps } from "lucide-react";

/**
 * The mock weather backend emits emoji glyphs (☀️ ⛅ 🌧️ …). The UI standardised on
 * lucide icons, so map those glyphs to a matching lucide component in one place.
 * Anything unrecognised falls back to a neutral cloud.
 */
const BY_GLYPH: Record<string, React.ComponentType<LucideProps>> = {
  "☀️": Sun,
  "☀": Sun,
  "⛅": CloudSun,
  "🌤️": CloudSun,
  "🌤": CloudSun,
  "☁️": Cloud,
  "☁": Cloud,
  "🌧️": CloudRain,
  "🌧": CloudRain,
  "⛈️": CloudLightning,
  "⛈": CloudLightning,
  "🌦️": CloudDrizzle,
  "🌦": CloudDrizzle,
};

export function WeatherGlyph({
  icon,
  size = 14,
  color,
  style,
}: {
  icon?: string;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}) {
  const Cmp = (icon && BY_GLYPH[icon.trim()]) || Cloud;
  return <Cmp size={size} color={color} style={style} />;
}
