import { Box3, BoxGeometry, Color, DirectionalLight, HemisphereLight, Mesh, MeshBasicMaterial, Scene, Vector3 } from "three";
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

export type WorldSpot = Spot & { hit: Mesh; distance: number };

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

  // what can be pointed at: an invisible box around each place, kept out of
  // the scene so it never draws
  const spots: WorldSpot[] = [];
  const hitMaterial = new MeshBasicMaterial();
  for (const place of places) {
    if (!place.spot) continue;
    place.object.updateMatrixWorld(true);
    const box = new Box3().setFromObject(place.object);
    const size = box.getSize(new Vector3());
    const centre = box.getCenter(new Vector3());
    const hit = new Mesh(new BoxGeometry(Math.max(size.x, 0.8), Math.max(size.y, 0.8), Math.max(size.z, 0.8)), hitMaterial);
    hit.position.copy(centre);
    hit.updateMatrixWorld(true);
    spots.push({ ...place.spot, hit, distance: Math.hypot(centre.x, centre.z) });
  }

  const updates = places.map((place) => place.update).filter((update): update is NonNullable<Place["update"]> => Boolean(update));
  return { scene, sun, hemi, spots, updates, places };
}
