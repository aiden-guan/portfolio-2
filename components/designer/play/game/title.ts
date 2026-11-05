import { AddEquation, Color, CustomBlending, Mesh, OneFactor, OneMinusSrcAlphaFactor, PlaneGeometry, ShaderMaterial, SrcAlphaFactor, Vector3, ZeroFactor } from "three";
import { materials } from "../../scene/kit";
import { at } from "../../scene/layout";
import { FLAG, GLSL_COMMON, uniforms, worldMaterial } from "../../scene/shared";
import { buildWorld } from "../../scene/world";
import { calm } from "./rooms/common";
import { birds } from "./rooms/life";

// The title screen: the island from the trailer, at dawn this time. The sun
// is just up on the right and low enough to throw every shadow across the
// grass; what it doesn't reach is cool. There's mist lying on the pond and
// down the stream, the clouds are lit pink from underneath, a few gulls come
// over now and then, and the camera settles in slowly and keeps drifting.

// clouds lit from below by a sun that's only just up: pink underneath, cream on top
const dawnCloud = worldMaterial({
  key: "title-cloud",
  flag: FLAG.soft,
  cloud: false,
  fragment: /* glsl */ `
float up = dot(normal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz));
vec3 tint = mix(vec3(1.0, 0.7, 0.66), vec3(1.0, 0.94, 0.86), smoothstep(-0.8, 0.8, up));
reflectedLight.directDiffuse *= 0.18;
reflectedLight.indirectDiffuse *= 0.3;
totalEmissiveRadiance += diffuseColor.rgb * tint * 0.84;`,
});

// mist: a sheet a little above the water, so the land hides it everywhere
// but the pond and the stream; a slow noise drifts through it, and it's
// laid over what's below so the post pass dithers it like the rest
const mistMaterial = new ShaderMaterial({
  uniforms: { uTime: uniforms.uTime, uCloud: uniforms.uCloud, uCloudAmount: uniforms.uCloudAmount, uReveal: uniforms.uReveal, uNight: uniforms.uNight },
  vertexShader: /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`,
  fragmentShader: /* glsl */ `
${GLSL_COMMON}
varying vec3 vWorld;
void main() {
  if (uReveal < 0.999 && objectDissolved(vWorld)) discard;
  vec2 q = vWorld.xz * 0.12 + vec2(uTime * 0.016, uTime * 0.006);
  float n = vnoise(q) * 0.6 + vnoise(q * 2.3 + 7.1) * 0.4;
  float a = smoothstep(0.36, 0.86, n) * 0.46 * islandMask(vWorld.xz);
  gl_FragColor = vec4(1.0, 0.9, 0.82, a);
}`,
  transparent: true,
  depthWrite: false,
  // laid over what's there, leaving the alpha (the post pass's flags) alone
  blending: CustomBlending,
  blendEquation: AddEquation,
  blendSrc: SrcAlphaFactor,
  blendDst: OneMinusSrcAlphaFactor,
  blendSrcAlpha: ZeroFactor,
  blendDstAlpha: OneFactor,
});

const SPAN = { wide: 74, tall: 62 };

export function titleScene() {
  const world = buildWorld();
  world.sun.color.set(0xffb684);
  world.sun.intensity = 3.3;
  world.sun.position.set(32, 10, -10);
  // the sky still holds the night's blue, so the shade is cool
  world.hemi.color.set(0xbcc4ea);
  world.hemi.groundColor.set(0x6a7646);
  world.hemi.intensity = 1.0;
  world.scene.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh && m.material === materials.cloud) m.material = dawnCloud;
  });

  const sheet = new PlaneGeometry(64, 64);
  sheet.rotateX(-Math.PI / 2);
  sheet.translate(0, 0.2, 0);
  const mist = new Mesh(sheet, mistMaterial);
  mist.renderOrder = 1;
  world.scene.add(mist);

  // gulls, high over the back of the island, right to left
  const [fx, fz] = at(62, -16);
  const [tx, tz] = at(-62, -8);
  const flock = birds(new Vector3(fx, 30, fz), new Vector3(tx, 33, tz), { count: 5, voxel: 0.24, color: 0x5e5668, every: 46, seconds: 26, seed: 7 });
  world.scene.add(flock.object);

  // (the post pass shows these as they are in linear light, so they're picked lighter than they look)
  const background = { top: new Color(0xc8cfeb), bottom: new Color(0xfde6d4) };
  const target = new Vector3();
  // the camera's up, along the ground plane's slope: moving the target this way
  // moves the island down the screen
  const up = new Vector3(-0.3535, 0.866, -0.3535);
  let last = -1;
  let since = 0;
  return {
    scene: world.scene,
    background,
    update: (time: number, dt: number) => {
      calm();
      for (const update of world.updates) update(time, dt);
      flock.update(time, dt);
    },
    /** A slow drift, the island sitting low so the name has the sky. Each
     * time the title comes back it starts a little wide and settles in. */
    look: (time: number, tall: boolean) => {
      if (time - last > 0.5) since = time;
      last = time;
      const still = calm();
      const drift = still ? 0 : 1;
      const k = still ? 1 : Math.min(1, (time - since) / 8);
      const settle = 1 - (1 - k) ** 3;
      const span = (tall ? SPAN.tall : SPAN.wide) - Math.sin(time * 0.06) * 2.5 * drift + (1 - settle) * 7;
      target.set(Math.sin(time * 0.05) * 2.5 * drift, 5.8, Math.cos(time * 0.04) * 1.5 * drift);
      target.addScaledVector(up, tall ? span * 0.42 : span * 0.13);
      return { target, span };
    },
    dispose: () => {
      world.scene.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
      flock.dispose();
    },
  };
}

export type Title = ReturnType<typeof titleScene>;
