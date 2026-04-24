import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  images: { unoptimized: true },
  transpilePackages: ["@nextapi/ui"],
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
  // (dashboard) is a route group — it does not appear in the URL. Some users
  // guess /dashboard/jobs/...; send them to the real paths.
  async redirects() {
    return [
      { source: "/dashboard", destination: "/", permanent: true },
      { source: "/dashboard/:path*", destination: "/:path*", permanent: true },
    ]
  },
}

export default nextConfig
