import { NextResponse } from "next/server"

/**
 * Marketing site — intentionally no Clerk / no auth.
 *
 * This app is `output: "export"` (static HTML). There is no session and no
 * protected routes. If you ever switch to server mode, keep this middleware
 * as a pass-through; do not add auth.protect() here.
 */
export function middleware() {
  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all paths except static assets (same idea as dashboard, but we
     * never redirect — this file exists so future edits don't copy-paste
     * dashboard middleware by mistake).
     */
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
}
