import { getImageProps } from "next/image";

// Uploads are kept as they came, often several times bigger than they're ever
// shown. Next's image optimizer serves them resized (and as WebP where the
// browser takes it): these say which sizes to ask it for, as an <img>'s src,
// srcSet and sizes. Only uploads (/api/media/…) go through it; anything else,
// a video, or an animation, is left as it is.

function optimizable(src: string) {
  return src.startsWith("/api/media/") && !/\.(gif|mp4|m4v|webm|mov)$/i.test(src);
}

// For a picture as wide on the page as `sizes` says (an <img> sizes attribute).
export function imageSet(src: string, sizes: string) {
  if (!optimizable(src)) return { src };
  const { props } = getImageProps({ src, alt: "", fill: true, sizes });
  return { src: props.src, srcSet: props.srcSet, sizes: props.sizes };
}

// For a picture `width` CSS pixels wide, or less.
export function imageAt(src: string, width: number) {
  if (!optimizable(src)) return { src };
  const { props } = getImageProps({ src, alt: "", width, height: width });
  return { src: props.src, srcSet: props.srcSet };
}

// Should a sized copy not come (the optimizer unable to fetch the upload, or
// past its allowance), an <img> given copies by the above shows the upload
// itself instead.
export function showUpload(img: HTMLImageElement) {
  if (!img.srcset) return;
  const tried = new URL(img.currentSrc || img.src, document.baseURI);
  const src = tried.pathname === "/_next/image" ? tried.searchParams.get("url") : null;
  if (!src) return;
  img.removeAttribute("srcset");
  img.removeAttribute("sizes");
  img.src = src;
}
