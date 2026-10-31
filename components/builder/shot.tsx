import Image, { getImageProps, type ImageLoader } from "next/image";
import { imageFocus, projectImage } from "@/content/worlds";

// Every screenshot is kept at 800 and 1600 wide (content/worlds). The
// browser picks between the two from srcset, so nothing is re-encoded by the
// image optimizer.
const pick: ImageLoader = ({ src, width }) => projectImage(src, width <= 828 ? "sm" : "lg");

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
      style={{ objectFit: "cover", objectPosition: imageFocus(image) }}
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
