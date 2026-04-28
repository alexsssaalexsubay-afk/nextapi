import { NextResponse, type NextRequest } from "next/server"

const publicPrefixes = ["/health", "/sign-in"]

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (publicPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next()
  }
  if (!request.cookies.get("nextapi_admin_ops_token")?.value) {
    const url = new URL("/sign-in", request.url)
    url.searchParams.set("next", `${pathname}${request.nextUrl.search}`)
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)"],
}
