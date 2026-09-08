export const AD_VARIANTS = [
  { platform: "reels", aspectRatio: "9:16", durationSeconds: 15, width: 720, height: 1280 },
  { platform: "shorts", aspectRatio: "9:16", durationSeconds: 15, width: 720, height: 1280 },
  { platform: "square", aspectRatio: "1:1", durationSeconds: 15, width: 1080, height: 1080 },
  { platform: "landscape", aspectRatio: "16:9", durationSeconds: 20, width: 1280, height: 720 },
] as const;

export type AdVariant = (typeof AD_VARIANTS)[number];
