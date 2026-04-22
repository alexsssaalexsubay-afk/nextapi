import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://nextapi.top";
  const paths = ["", "/pricing", "/about", "/docs"];
  const locales = ["en", "zh"];
  return locales.flatMap((l) =>
    paths.map((p) => ({
      url: `${base}/${l}${p}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: p === "" ? 1 : 0.7,
    })),
  );
}
