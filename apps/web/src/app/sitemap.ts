import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date("2026-10-06T00:00:00.000Z");
  return [
    { url: "https://citeral.vercel.app", lastModified, changeFrequency: "weekly", priority: 1 },
    { url: "https://citeral.vercel.app/privacy", lastModified, changeFrequency: "monthly", priority: 0.3 },
    { url: "https://citeral.vercel.app/terms", lastModified, changeFrequency: "monthly", priority: 0.3 },
  ];
}
