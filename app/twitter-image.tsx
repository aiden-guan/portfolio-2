import { createPortfolioSocialImage } from "@/lib/portfolio-social-image";

export const alt = "A personal index of work, experience and study.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 3600;

export default async function TwitterImage() {
  return createPortfolioSocialImage();
}
