export const runtime = "edge"

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers })
}

export function GET() {
  return new Response(JSON.stringify({
    status: "ok",
    app: "nextapi-dashboard",
    build_sha: (process.env.NEXT_PUBLIC_BUILD_SHA || "dev").slice(0, 7),
    build_time: process.env.NEXT_PUBLIC_BUILD_TIME || "",
  }), { status: 200, headers })
}
