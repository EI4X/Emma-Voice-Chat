import colors from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";

export function useColors() {
  const { resolvedTheme } = useTheme();
  const palette = resolvedTheme === "light" ? colors.light : colors.dark;
  return { ...palette, radius: colors.radius };
}
