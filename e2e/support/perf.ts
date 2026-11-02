import type { BrowserContext, CDPSession, Page } from "@playwright/test";
import type { FrameStats } from "../../src/game/frame-meter";
import type { Settings } from "../../src/storage/save-data";
import { SAVE_KEY } from "./app";

// What the measurements in e2e/perf share: slowing the processor and the network through the protocol of
// Chromium, reading what the game measured of its own frames, long tasks, and the size of the page in memory.

/** The address that switches the game's own frame measurements on (src/game/diagnostics.ts). */
export const DIAGNOSTICS_ADDRESS = "/?diag";
/** Names of the User Timing marks (src/game/performance-marks.ts). */
export const MARK_FIRST_SCREEN = "telemark:first-screen";
export const MARK_FIRST_JUMP_FRAME = "telemark:first-jump-frame";

/**
 * The look of every measured jump: the night with snowfall and fog paints the most. A look drawn at random made two
 * measurements of the same code differ by half (30 and 60 frames a second at a processor four times slower).
 */
const MEASURED_LOOK = { scenery: "night", weather: "snowFog" } as const satisfies Partial<Settings>;

/** Before every page of the context starts, stores settings with the measured look, unless a save is there. */
export async function fixLook(context: BrowserContext): Promise<void> {
  await context.addInitScript(
    ({ key, settings }) => {
      if (localStorage.getItem(key) === null) {
        localStorage.setItem(key, JSON.stringify({ schemaVersion: 2, records: {}, settings }));
      }
    },
    { key: SAVE_KEY, settings: MEASURED_LOOK },
  );
}

/** How many times slower the processor of the page runs in the slowed measurements. */
export const CPU_SLOWDOWN_FACTOR = 4;

/** The network of Lighthouse's "Slow 4G" profile. */
export const SLOW_4G = {
  LATENCY_MS: 150,
  DOWNLOAD_KBIT_PER_S: 1600,
  UPLOAD_KBIT_PER_S: 750,
} as const;

const BITS_PER_BYTE = 8;
const BITS_PER_KBIT = 1000;
const BYTES_PER_KIB = 1024;
/** The overlay with the statistics is rewritten once a second. */
const STATS_REFRESH_MS = 1000;

const bytesPerSecond = (kbitPerSecond: number): number => (kbitPerSecond * BITS_PER_KBIT) / BITS_PER_BYTE;

export function protocolSession(page: Page): Promise<CDPSession> {
  return page.context().newCDPSession(page);
}

/** Makes the processor of the page `factor` times slower; 1 lifts it. */
export async function slowProcessor(session: CDPSession, factor: number): Promise<void> {
  await session.send("Emulation.setCPUThrottlingRate", { rate: factor });
}

export async function slowNetwork(session: CDPSession, profile: typeof SLOW_4G): Promise<void> {
  await session.send("Network.enable");
  await session.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: profile.LATENCY_MS,
    downloadThroughput: bytesPerSecond(profile.DOWNLOAD_KBIT_PER_S),
    uploadThroughput: bytesPerSecond(profile.UPLOAD_KBIT_PER_S),
  });
}

/** When the mark of that name was first put, in milliseconds since the navigation began; waits for it. */
export async function markTime(page: Page, name: string, timeoutMs: number): Promise<number> {
  const handle = await page.waitForFunction(
    (mark) => performance.getEntriesByName(mark, "mark")[0]?.startTime ?? null,
    name,
    { polling: "raf", timeout: timeoutMs },
  );
  const startMs = await handle.jsonValue();
  if (startMs === null) throw new Error(`The mark ${name} was not put`);
  return startMs;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

function isFrameStats(value: unknown): value is FrameStats {
  if (!isRecord(value)) return false;
  const counters = ["frames", "steps", "droppedSteps", "cappedFrames", "longFrames"];
  const spreads = ["intervalMs", "simMs", "drawMs"];
  return (
    counters.every((name) => typeof value[name] === "number") &&
    spreads.every((name) => {
      const spread = value[name];
      return isRecord(spread) && ["median", "p95", "max"].every((part) => typeof spread[part] === "number");
    })
  );
}

/**
 * What the game has measured of its frames since the jump screen opened, read after the overlay has been
 * rewritten once more, so the last second of frames is in.
 */
export async function frameStats(page: Page): Promise<FrameStats> {
  await page.waitForTimeout(2 * STATS_REFRESH_MS);
  const json = await page.locator(".jump-diagnostics").getAttribute("data-stats");
  if (json === null) throw new Error("The overlay carries no statistics: was the game opened with ?diag");
  const stats: unknown = JSON.parse(json);
  if (!isFrameStats(stats)) throw new Error(`Not the statistics of the frames: ${json}`);
  return stats;
}

export interface LongTask {
  startMs: number;
  durationMs: number;
}

declare global {
  interface Window {
    telemarkTestLongTasks?: LongTask[];
  }
}

/** Collects the long tasks (over 50 ms) of every page the context opens from now on. */
export async function watchLongTasks(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const tasks: LongTask[] = [];
    window.telemarkTestLongTasks = tasks;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) tasks.push({ startMs: entry.startTime, durationMs: entry.duration });
    }).observe({ type: "longtask", buffered: true });
  });
}

/** The long tasks that began at or after the given time of the page's clock. */
export async function longTasksSince(page: Page, sinceMs: number): Promise<LongTask[]> {
  const tasks = await page.evaluate(() => window.telemarkTestLongTasks ?? null);
  if (tasks === null) throw new Error("Long tasks are not watched on this page");
  return tasks.filter((task) => task.startMs >= sinceMs);
}

export interface MemorySample {
  heapUsedKib: number;
  eventListeners: number;
  nodes: number;
  documents: number;
}

/** What the page holds after a forced garbage collection. */
export async function memorySample(session: CDPSession): Promise<MemorySample> {
  await session.send("Performance.enable");
  await session.send("HeapProfiler.collectGarbage");
  const heap = await session.send("Runtime.getHeapUsage");
  const { metrics } = await session.send("Performance.getMetrics");
  const metric = (name: string): number => {
    const found = metrics.find((candidate) => candidate.name === name);
    if (found === undefined) throw new Error(`The browser reports no metric named ${name}`);
    return found.value;
  };
  return {
    heapUsedKib: Math.round(heap.usedSize / BYTES_PER_KIB),
    eventListeners: metric("JSEventListeners"),
    nodes: metric("Nodes"),
    documents: metric("Documents"),
  };
}
