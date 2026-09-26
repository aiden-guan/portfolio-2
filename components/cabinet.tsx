import type { CSSProperties } from "react";
import { imageFrame, type PortfolioImage } from "@/content/portfolio";

export function Cabinet({ images, label }: { images: PortfolioImage[]; label: string }) {
  if (images.length === 0) return null;
  const overlap = images.length > 3 ? (images.length - 2) / (images.length - 1) : 0.58;

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
                  "--tilt": `${tilt.toFixed(2)}deg`,
                  "--i": index,
                  "--count": images.length,
                  "--overlap": String(-overlap),
                } as CSSProperties
              }
            >
              <div className="cabinet-lens">
                <div className={`cabinet-photo${imageFrame(image).fit === "cover" ? " is-cover" : " is-contain"}`}>
                  <img
                    alt={image.alt || `${label}, image ${index + 1}`}
                    draggable={false}
                    src={image.src}
                    style={imageStyle(image)}
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

function imageStyle(image: PortfolioImage): CSSProperties {
  const frame = imageFrame(image);
  return {
    objectFit: frame.fit,
    objectPosition: frame.position,
  };
}
