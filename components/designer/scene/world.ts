import { Box3, Color, DirectionalLight, HemisphereLight, Mesh, Scene } from "three";
import {
  aiden,
  chalkboard,
  clouds,
  continuityBridge,
  corgis,
  court,
  dovecote,
  koiPond,
  ledgerTree,
  nightLights,
  rallyTable,
  scenery,
  seyrinDesk,
  type Place,
  type Spot,
} from "./places";
import { buildTerrain } from "./terrain";
import { buildWater } from "./water";

export type WorldSpot = Spot & { box: Box3 };

export const LIGHT = {
  day: { sun: new Color(0xffeccc), sunIntensity: 3.1, sky: new Color(0xc9dcff), ground: new Color(0x6d8a3f), hemi: 1.0 },
  night: { sun: new Color(0xa9bcff), sunIntensity: 0.95, sky: new Color(0x3d5394), ground: new Color(0x1d2c34), hemi: 0.95 },
};

// Builds the whole island: ground, water, every project's place and the
// scenery around them, plus the light. Returns what the engine needs to
// animate it and to know what can be pointed at.
export function buildWorld() {
  const scene = new Scene();
  const terrain = buildTerrain();
  scene.add(terrain.mesh);
  scene.add(buildWater(terrain.heights));

  const places: Place[] = [
    ledgerTree(),
    koiPond(),
    continuityBridge(),
    seyrinDesk(),
    rallyTable(),
    court(),
    dovecote(),
    corgis(),
    chalkboard(),
    aiden(),
    clouds(),
    ...scenery(),
    ...nightLights(),
  ];
  for (const place of places) scene.add(place.object);

  // a late-afternoon sun from behind the right shoulder, long shadows to the left
  const sun = new DirectionalLight(LIGHT.day.sun, LIGHT.day.sunIntensity);
  sun.position.set(26, 30, -18);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const reach = 34;
  Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1, far: 120 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const hemi = new HemisphereLight(LIGHT.day.sky, LIGHT.day.ground, LIGHT.day.hemi);
  scene.add(hemi);

  // each place's extent, without what only flies about it, so a label can
  // sit just above (or below) the thing itself
  const spots: WorldSpot[] = places.flatMap((place) => {
    if (!place.spot) return [];
    const box = new Box3();
    place.object.updateMatrixWorld(true);
    place.object.traverse((o) => {
      if ((o as Mesh).isMesh && !o.userData.decor) box.expandByObject(o, false);
    });
    return [{ ...place.spot, box }];
  });

  const updates = places.map((place) => place.update).filter((update): update is NonNullable<Place["update"]> => Boolean(update));
  return { scene, sun, hemi, spots, updates, places };
}
