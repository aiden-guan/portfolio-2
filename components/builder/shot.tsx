import Image, { getImageProps, type ImageLoader } from "next/image";
import { imageFocus, projectImage } from "@/content/worlds";
import { RATIO } from "./ratios";

// Every screenshot is kept at 800 and 1600 wide (content/worlds). The
// browser picks between the two from srcset, so nothing is re-encoded by the
// image optimizer.
const pick: ImageLoader = ({ src, width }) => projectImage(src, width <= 828 ? "sm" : "lg");

/** How wide a frame is drawn at each breakpoint, first match wins. */
export type Slot = ReadonlyArray<readonly [media: string | null, width: string]>;

// The frames on /builder, matching their CSS (grid.module.css, sheet.module.css).
export const CARD: Slot = [
  ["(min-width: 1440px)", "427px"],
  ["(min-width: 1100px)", "calc(33.33vw - 53px)"],
  ["(min-width: 640px)", "calc(50vw - 44px)"],
  [null, "calc(100vw - 32px)"],
];

export const HERO: Slot = [
  ["(min-width: 1304px)", "717px"],
  ["(min-width: 1000px)", "calc(61.8vw - 89px)"],
  ["(min-width: 640px)", "calc(100vw - 96px)"],
  [null, "calc(100vw - 32px)"],
];

export const THUMB: Slot = [[null, "72px"]];

// A frame is 16:10. A picture wider than that is drawn to the frame's height
// and cropped at the sides, so it's asked for at the width it's drawn at.
function sizes(image: string, slot: Slot) {
  const scale = Math.max(1, (RATIO[image] ?? 1.6) / 1.6);
  return slot
    .map(([media, width]) => {
      const drawn = scale > 1.01 ? `calc(${width} * ${scale.toFixed(3)})` : width;
      return media ? `${media} ${drawn}` : drawn;
    })
    .join(", ");
}

export function Shot({
  image,
  alt,
  slot,
  eager = false,
  className,
}: {
  image: string;
  alt: string;
  slot: Slot;
  eager?: boolean;
  className?: string;
}) {
  return (
    <Image
      loader={pick}
      src={image}
      alt={alt}
      fill
      sizes={sizes(image, slot)}
      loading={eager ? "eager" : "lazy"}
      draggable={false}
      className={className}
      style={{ objectFit: "cover", objectPosition: imageFocus(image) }}
    />
  );
}

// Starts fetching and decoding the file a Shot in this slot would pick, so
// it's ready before it's shown. Each file is only asked for once.
const warmed = new Set<string>();

export function warm(image: string, slot: Slot) {
  const size = sizes(image, slot);
  if (warmed.has(`${image} ${size}`)) return;
  warmed.add(`${image} ${size}`);
  const { props } = getImageProps({ loader: pick, src: image, alt: "", fill: true, sizes: size });
  const img = new window.Image();
  img.sizes = props.sizes ?? "";
  img.srcset = props.srcSet ?? "";
  img.src = props.src;
  img.decode().catch(() => undefined);
}
