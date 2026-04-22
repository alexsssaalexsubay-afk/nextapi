import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  typescript: { ignoreBuildErrors: true },
  images: { unoptimized: true },
  transpilePackages: ["@nextapi/ui"],
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
}

export default nextConfig
