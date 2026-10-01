/** Maximum video size allowed for portfolio media (15 MB to protect Blob data transfer limits). */
export const MAX_VIDEO_BYTES = 15 * 1024 * 1024;

export const VIDEO_TOO_LARGE_MESSAGE =
  "Use a video under 15 MB. Compress videos to avoid exhausting Vercel Blob transfer limits.";

