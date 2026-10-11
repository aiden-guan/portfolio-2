import type { SceneProgram } from "./types";

// The versions of the portfolio, in the order the page curl turns through them.
export const SCENE_IDS = ["original", "chongqing", "rockies", "reef", "golden-gate"] as const;
export type SceneId = (typeof SCENE_IDS)[number];
export const SCENE_STORAGE_KEY = "aiden-scene";

export const SCENE_INFO: Record<SceneId, { name: string; caption: string }> = {
  original: { name: "Original", caption: "" },
  chongqing: { name: "Chongqing", caption: "29.56°N 106.57°E · night rain" },
  rockies: { name: "The Rockies", caption: "alpine lakes · dusk" },
  reef: { name: "Great Barrier Reef", caption: "18.29°S 147.70°E · 6 m down" },
  "golden-gate": { name: "San Francisco", caption: "37.82°N 122.48°W · afternoon" },
};

export function isSceneId(value: unknown): value is SceneId {
  return typeof value === "string" && (SCENE_IDS as readonly string[]).includes(value);
}

export function nextScene(id: SceneId): SceneId {
  return SCENE_IDS[(SCENE_IDS.indexOf(id) + 1) % SCENE_IDS.length]!;
}

const importers: Record<Exclude<SceneId, "original">, () => Promise<{ scene: SceneProgram }>> = {
  chongqing: () => import("./scenes/chongqing"),
  rockies: () => import("./scenes/rockies"),
  reef: () => import("./scenes/reef"),
  "golden-gate": () => import("./scenes/golden-gate"),
};

const ready = new Map<SceneId, SceneProgram>();
const pending = new Map<SceneId, Promise<SceneProgram>>();

// The scene's code and its photo, fetched once and kept.
export function loadScene(id: Exclude<SceneId, "original">) {
  let promise = pending.get(id);
  if (!promise) {
    promise = importers[id]().then(async ({ scene }) => {
      await scene.load?.();
      ready.set(id, scene);
      return scene;
    });
    promise.catch(() => pending.delete(id));
    pending.set(id, promise);
  }
  return promise;
}

export function loadedScene(id: SceneId) {
  return ready.get(id) ?? null;
}
