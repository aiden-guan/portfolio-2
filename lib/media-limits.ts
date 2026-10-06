/** Maximum image size allowed for portfolio media (4 MB). */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** Maximum video size allowed for portfolio media (15 MB). */
export const MAX_VIDEO_BYTES = 15 * 1024 * 1024;

export const VIDEO_TOO_LARGE_MESSAGE =
  "Use a video under 15 MB. Compress videos to avoid exhausting storage and transfer limits.";

export {
  CLOUDFLARE_R2_FREE_TIER_STORAGE_BYTES,
  CLOUDFLARE_R2_FREE_TIER_CLASS_A_OPS,
  CLOUDFLARE_R2_FREE_TIER_CLASS_B_OPS,
  getR2StorageSafetyCapBytes,
  getR2MaxFilesCap,
  R2StorageLimitExceededError,
  isR2StorageLimitError,
} from "@/lib/r2-limits";
