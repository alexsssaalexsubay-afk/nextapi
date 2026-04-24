import { NextResponse, type NextRequest } from "next/server"

const publicPrefixes = ["/sign-in", "/sign-up", "/forgot-password", "/reset-password"]

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (publicPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next()
  }
  if (!request.cookies.get("nextapi_account_session")?.value) {
    const url = request.nextUrl.clone()
    url.pathname = "/sign-in"
    url.searchParams.set("next", pathname)
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)"],
}
