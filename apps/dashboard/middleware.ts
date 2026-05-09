import { NextResponse, type NextRequest } from "next/server"

const publicPrefixes = ["/health", "/sign-in", "/sign-up", "/forgot-password", "/reset-password"]

type ProcessLike = {
  env?: Record<string, string | undefined>
}

function env(name: string) {
  const processLike = (globalThis as typeof globalThis & { process?: ProcessLike }).process
  return processLike?.env?.[name] || ""
}

function healthResponse() {
  const response = NextResponse.json({
    status: "ok",
    app: "nextapi-dashboard",
    build_sha: (env("NEXT_PUBLIC_BUILD_SHA") || "dev").slice(0, 7),
    build_time: env("NEXT_PUBLIC_BUILD_TIME"),
  })
  response.headers.set("Access-Control-Allow-Origin", "*")
  response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS")
  response.headers.set("Access-Control-Allow-Headers", "Content-Type")
  response.headers.set("Cache-Control", "no-store")
  return response
}

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (pathname === "/health" || pathname === "/health/") {
    return healthResponse()
  }
  if (publicPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next()
  }
  if (!request.cookies.get("nextapi_account_session")?.value) {
    const url = new URL("/sign-in", request.url)
    url.searchParams.set("next", `${pathname}${request.nextUrl.search}`)
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)"],
}
