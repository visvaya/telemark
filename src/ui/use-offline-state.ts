import { useEffect, useMemo, useRef, useState } from "react";
import {
  INITIAL_OFFLINE_STATE,
  offlineSupportWanted,
  reduceOffline,
  type OfflineState,
  type ReadinessOutcome,
  type UpdateCheckOutcome,
} from "../pwa/offline-state";
import { PWA_CONFIG } from "../pwa/pwa-config";
import { browserOfflineEnvironment, startOfflineSupport, type OfflineSupport } from "../pwa/service-worker-client";

/** What the menus can ask of the service worker. */
export interface UpdateControls {
  checkNow: () => Promise<UpdateCheckOutcome>;
  /** Checks again whether the game can start without a network. */
  retryReadiness: () => Promise<ReadinessOutcome>;
  installNow: (onFailed: () => void) => boolean;
  reloadNow: () => void;
  /** Installs the game again and reloads the page; settles only when that failed. */
  reinstall: () => Promise<"failed">;
}

/** What the game knows of playing without a network, and what it can ask of the service worker. */
export interface OfflineSupportView {
  state: OfflineState | null;
  updates: UpdateControls | null;
}

function serviceWorkerContainer(): ServiceWorkerContainer | null {
  // Missing in older browsers and in the private windows of some.
  const container = "serviceWorker" in navigator ? navigator.serviceWorker : null;
  const wanted = offlineSupportWanted({
    production: import.meta.env.PROD,
    secureContext: window.isSecureContext,
    supported: container !== null,
    marked: document.querySelector(`meta[name="${PWA_CONFIG.MARKER_META_NAME}"]`) !== null,
  });
  return wanted ? container : null;
}

/**
 * Registers the service worker where the page is meant to have one and follows what it reports. Both are null
 * where the game has no offline mode at all (the single-file page, the development server, an insecure
 * address): there is no release to check for or install there.
 */
export function useOfflineState(): OfflineSupportView {
  const [container] = useState(serviceWorkerContainer);
  const [state, setState] = useState<OfflineState | null>(() => (container === null ? null : INITIAL_OFFLINE_STATE));
  const support = useRef<OfflineSupport | null>(null);
  useEffect(() => {
    if (container === null) return undefined;
    const started = startOfflineSupport(browserOfflineEnvironment(container), (event) => {
      setState((previous) => (previous === null ? null : reduceOffline(previous, event)));
    });
    support.current = started;
    return () => {
      started.stop();
      support.current = null;
    };
  }, [container]);
  const updates = useMemo<UpdateControls | null>(
    () =>
      container === null
        ? null
        : {
            checkNow: () => support.current?.checkNow() ?? Promise.resolve("unavailable"),
            retryReadiness: () => support.current?.retryReadiness() ?? Promise.resolve("unavailable"),
            installNow: (onFailed) => support.current?.installNow(onFailed) ?? false,
            reloadNow: () => support.current?.reloadNow(),
            reinstall: () => support.current?.reinstall() ?? Promise.resolve("failed"),
          },
    [container],
  );
  return { state, updates };
}
