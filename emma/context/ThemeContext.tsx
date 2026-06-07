import React, { createContext, useContext, useState } from "react";
import { useColorScheme } from "react-native";

export type ThemePreference = "system" | "dark" | "light";

interface ThemeContextValue {
  preference: ThemePreference;
  setPreference: (t: ThemePreference) => void;
  resolvedTheme: "dark" | "light";
}

const ThemeContext = createContext<ThemeContextValue>({
  preference: "light",
  setPreference: () => {},
  resolvedTheme: "light",
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreference] = useState<ThemePreference>("light");

  const resolvedTheme: "dark" | "light" =
    preference === "system" ? ((systemScheme as "dark" | "light") ?? "light") : preference;

  return (
    <ThemeContext.Provider value={{ preference, setPreference, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
