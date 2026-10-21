import { useCallback, useEffect, useRef, useState } from "react";

/** What the open menu shows: its buttons, or the instructions or the list of hills in their place. */
export type MenuPanel = "menu" | "help" | "hills";

/** The attribute that marks the button opening a panel (`jump-menu.tsx`), with the panel as its value. */
const PANEL_OPENER_ATTRIBUTE = "data-opens-panel";

/**
 * The menu of the jump screen. In phone landscape its buttons sit behind a pause button; the jump stops while
 * they are open, and the focus goes into them and back to the pause button after.
 */
export function usePauseMenu() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState<MenuPanel>("menu");
  /** For the jump loop, which outlives a render. */
  const pausedRef = useRef(false);
  const panelHeadingRef = useRef<HTMLHeadingElement>(null);
  const pauseButtonRef = useRef<HTMLButtonElement>(null);
  const resumeButtonRef = useRef<HTMLButtonElement>(null);
  const menuWasOpenRef = useRef(false);
  const shownPanelRef = useRef<MenuPanel>("menu");

  useEffect(() => {
    const previous = shownPanelRef.current;
    shownPanelRef.current = panel;
    if (panel !== "menu") {
      panelHeadingRef.current?.focus();
      return;
    }
    // Back from the instructions or the list of hills their "back" button is gone: the focus returns to the button
    // that opened them, or to the first of the menu when that is not there.
    if (previous === "menu") return;
    const opener = document.querySelector<HTMLElement>(`[${PANEL_OPENER_ATTRIBUTE}="${previous}"]`);
    (opener ?? resumeButtonRef.current)?.focus();
  }, [panel]);
  useEffect(() => {
    pausedRef.current = menuOpen;
    // The controls cover everything else, so the focus goes into them and returns to the pause button after.
    if (menuOpen) resumeButtonRef.current?.focus();
    else if (menuWasOpenRef.current) pauseButtonRef.current?.focus();
    menuWasOpenRef.current = menuOpen;
  }, [menuOpen]);

  const openMenu = useCallback(() => {
    setPanel("menu");
    setMenuOpen(true);
  }, []);
  const toggleMenu = useCallback(() => {
    setPanel("menu");
    setMenuOpen((open) => !open);
  }, []);
  const closeMenu = () => {
    setPanel("menu");
    setMenuOpen(false);
  };

  return {
    menuOpen,
    panel,
    setPanel,
    openMenu,
    toggleMenu,
    closeMenu,
    pausedRef,
    panelHeadingRef,
    pauseButtonRef,
    resumeButtonRef,
  };
}
