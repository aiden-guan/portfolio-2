import type { CSSProperties } from "react";
import Image from "next/image";
import type { PortfolioImage } from "@/content/portfolio";

export function Cabinet({ images, label }: { images: PortfolioImage[]; label: string }) {
  if (images.length === 0) return null;

  return (
    <div className="cabinet">
      <ul className="cabinet-fan" aria-label={`${label} images`}>
        {images.map((image, index) => {
          const tilt = (index - (images.length - 1)) * 2.35;
          return (
            <li
              className="cabinet-print"
              key={`${image.src}-${index}`}
              style={
                {
                  zIndex: index + 1,
                  "--tilt": `${tilt.toFixed(2)}deg`,
                  "--i": index,
                  "--count": images.length,
                } as CSSProperties
              }
            >
              <div className="cabinet-shadow" aria-hidden="true" />
              <div className="cabinet-lens">
                <div className="cabinet-mat">
                  <Image
                    alt={image.alt || `${label}, image ${index + 1}`}
                    draggable={false}
                    fill
                    sizes="(max-width: 880px) 180px, 340px"
                    src={image.src}
                    unoptimized={image.src.startsWith("/api/")}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
