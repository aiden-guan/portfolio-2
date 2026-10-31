import Image, { getImageProps, type ImageLoader } from "next/image";
import { projectImage } from "@/content/worlds";

// Every screenshot is kept at 800 and 1600 wide (content/worlds). The
// browser picks between the two from srcset, so nothing is re-encoded by the
// image optimizer.
const pick: ImageLoader = ({ src, width }) => projectImage(src, width <= 828 ? "sm" : "lg");

// The screenshots aren't all 16:10. Where a centred crop would cut into what
// matters, this keeps that edge instead (by image name).
const FOCUS: Record<string, string> = {
  continuity: "0% 50%",
  agenthub: "14% 50%",
  inroad: "14% 50%",
  startupsim: "0% 50%",
  seyrin: "0% 50%",
  "seyrin-doc": "0% 50%",
  "pigeonbox-app": "0% 0%",
  alai: "50% 14%",
  rally: "50% 18%",
  antiagent: "50% 0%",
};

export function Shot({
  image,
  alt,
  sizes,
  eager = false,
  className,
}: {
  image: string;
  alt: string;
  sizes: string;
  eager?: boolean;
  className?: string;
}) {
  return (
    <Image
      loader={pick}
      src={image}
      alt={alt}
      fill
      sizes={sizes}
      loading={eager ? "eager" : "lazy"}
      draggable={false}
      className={className}
      style={{ objectFit: "cover", objectPosition: FOCUS[image] ?? "50% 50%" }}
    />
  );
}

// Starts fetching and decoding the file a Shot of this size would pick, so
// it's ready before it's shown.
export function warm(image: string, sizes: string) {
  const { props } = getImageProps({ loader: pick, src: image, alt: "", fill: true, sizes });
  const img = new window.Image();
  img.sizes = props.sizes ?? "";
  img.srcset = props.srcSet ?? "";
  img.src = props.src;
  img.decode().catch(() => undefined);
}
