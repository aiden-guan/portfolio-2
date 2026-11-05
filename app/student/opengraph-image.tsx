import { createPortfolioSocialImage } from "@/lib/portfolio-social-image";

// The top of the mat: the name printed into it, the business card across it.
export const alt = "Aiden Guan, printed into a green cutting mat, with his business card lying across it.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 3600;

export default async function OpenGraphImage() {
  return createPortfolioSocialImage();
}
