import { Palette, type PaletteColors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export function usePalette(): PaletteColors {
  const scheme = useColorScheme();
  return Palette[scheme === "dark" ? "dark" : "light"];
}
