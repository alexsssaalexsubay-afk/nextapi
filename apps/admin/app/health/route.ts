export const runtime = "edge"

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers })
}

export function GET() {
  return Response.json(
    {
      status: "ok",
      app: "nextapi-admin",
      build_sha: (process.env.NEXT_PUBLIC_BUILD_SHA || "dev").slice(0, 7),
      build_time: process.env.NEXT_PUBLIC_BUILD_TIME || "",
      checked_at: new Date().toISOString(),
    },
    { headers },
  )
}
