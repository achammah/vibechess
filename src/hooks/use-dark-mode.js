import { useState, useEffect, useCallback } from "react";

/**
 * Manages dark / light mode.
 * - Persists the preference in localStorage under "chess-dark-mode"
 * - Applies / removes the `dark` CSS class on <html>
 * - Defaults to the light editorial theme if no preference has been saved
 *   (matches the landing + nexus-landing style; toggle still available)
 */
const useDarkMode = () => {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem("chess-dark-mode");
    // Saved preference wins; first visit defaults to light
    return saved !== null ? saved === "true" : false;
  });

  useEffect(() => {
    const html = document.documentElement;
    if (isDarkMode) {
      html.classList.add("dark");
    } else {
      html.classList.remove("dark");
    }
    localStorage.setItem("chess-dark-mode", String(isDarkMode));
  }, [isDarkMode]);

  const toggleDarkMode = useCallback(() => {
    setIsDarkMode((previous) => !previous);
  }, []);

  return { isDarkMode, toggleDarkMode };
};

export default useDarkMode;
