import { useEffect, useState } from "react";

/** Whether a media query matches, kept up to date while the component lives. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/** The query for screens played with fingers rather than a mouse. */
export const TOUCH_QUERY = "(pointer: coarse)";
