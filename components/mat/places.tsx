"use client";

import { useEffect, useRef } from "react";
import { Thing } from "@/components/mat/thing";
import { mountMiniScene, useScene } from "@/components/scenery";
import { SCENE_INFO, loadScene, type SceneId } from "@/lib/scenery/catalog";

type Place = Exclude<SceneId, "original">;

// the ground each scene is printed on (scenery.css)
const GROUND: Record<Place, string> = {
  chongqing: "#07060d",
  rockies: "#0b0910",
  reef: "#021a2c",
  "golden-gate": "#f5efe2",
};

// A postcard of one of the places the page can turn to, its picture alive in
// the same dots as the scene. Picking it up and clicking it goes there; the
// card of the place you're in is franked "Here".
export function PlaceCard({ place }: { place: Place }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useScene();
  const info = SCENE_INFO[place];

  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    let width = 0;
    const play = () => {
      stop?.();
      stop = null;
      loadScene(place)
        .then((program) => {
          if (cancelled || stop) return;
          width = node.parentElement?.clientWidth ?? 0;
          stop = mountMiniScene(node, program, GROUND[place], width < 220 ? 2.6 : 3.2);
        })
        .catch(() => {});
    };
    const watcher = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          if (!stop) play();
        } else {
          stop?.();
          stop = null;
        }
      },
      { rootMargin: "120px" },
    );
    watcher.observe(node);
    const sizes = new ResizeObserver(() => {
      if (stop && node.parentElement && Math.abs(node.parentElement.clientWidth - width) > 4) play();
    });
    if (node.parentElement) sizes.observe(node.parentElement);
    return () => {
      cancelled = true;
      watcher.disconnect();
      sizes.disconnect();
      stop?.();
    };
  }, [place]);

  // where on earth it is (or what, where there's no point to give)
  const [where] = info.caption.split(" · ");
  return (
    <Thing
      kind="place"
      label={`Postcard from ${info.name}: ${scene === place ? "go home" : "go there"}`}
      w={64}
      action="travel"
      data={{ scene: place }}
    >
      <figure className="place" data-here={scene === place ? "" : undefined}>
        <div className="place-window">
          <canvas ref={canvas} aria-hidden="true" />
        </div>
        <figcaption className="place-caption">
          <span>{info.name}</span>
          <span>{where}</span>
        </figcaption>
        <span className="place-here" aria-hidden="true">
          Here
        </span>
      </figure>
    </Thing>
  );
}

export function Places() {
  const places: Place[] = ["chongqing", "rockies", "reef", "golden-gate"];
  return (
    <div className="mat-places">
      {places.map((place) => (
        <PlaceCard place={place} key={place} />
      ))}
    </div>
  );
}
