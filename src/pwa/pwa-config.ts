/** Constants of the installable, offline-capable game. The service worker itself is scripts/lib/service-worker-template.js. */
export const PWA_CONFIG = {
  /** Fixed address and scope of the worker; never a host name, so the same build runs under any address. */
  SERVICE_WORKER_URL: "/sw.js",
  SERVICE_WORKER_SCOPE: "/",
  /** The `<meta name>` in index.html that marks the regular build; the single-file page has none. */
  MARKER_META_NAME: "telemark-offline",
  /** A check for a new release on returning to the game happens at most this often. */
  UPDATE_CHECK_MIN_INTERVAL_S: 900,
  /** While the game cannot start offline, a check again on returning to the game happens at most this often. */
  READINESS_RETRY_MIN_INTERVAL_S: 30,
  /** How long the page waits for the worker to say what it holds. */
  RELEASE_ANSWER_TIMEOUT_S: 5,
  /** Type of the message that asks the worker which release it holds, and of its answer. */
  RELEASE_MESSAGE_TYPE: "telemark:release",
  /** Type of the message that asks a waiting worker to take over now. */
  TAKE_OVER_MESSAGE_TYPE: "telemark:take-over",
} as const;
