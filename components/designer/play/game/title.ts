import { Color, Mesh, Vector3 } from "three";
import { buildWorld } from "../../scene/world";

// The title screen: the island from the trailer, at dawn this time, drifting.

export function titleScene() {
  const world = buildWorld();
  world.sun.color.set(0xffbb90);
  world.sun.intensity = 2.8;
  world.sun.position.set(30, 14, -8);
  world.hemi.color.set(0xffdcc8);
  world.hemi.groundColor.set(0x5e7a3a);
  world.hemi.intensity = 1.05;

  const background = { top: new Color(0xeeb293), bottom: new Color(0xfbe7d3) };
  const target = new Vector3();
  // the camera's up, along the ground plane's slope: moving the target this way
  // moves the island down the screen
  const up = new Vector3(-0.3535, 0.866, -0.3535);
  return {
    scene: world.scene,
    background,
    update: (time: number, dt: number) => {
      for (const update of world.updates) update(time, dt);
    },
    /** A slow drift, the island sitting low so the name has the sky. */
    look: (time: number, tall: boolean) => {
      const span = (tall ? 62 : 74) - Math.sin(time * 0.06) * 2.5;
      target.set(Math.sin(time * 0.05) * 2.5, 5.8, Math.cos(time * 0.04) * 1.5);
      target.addScaledVector(up, tall ? span * 0.42 : span * 0.13);
      return { target, span };
    },
    dispose: () => {
      world.scene.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
    },
  };
}

export type Title = ReturnType<typeof titleScene>;
