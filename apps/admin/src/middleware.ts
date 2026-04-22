import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublic = createRouteMatcher(["/login(.*)", "/forbidden"]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublic(req)) return;

  const { userId, sessionClaims, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn({ returnBackUrl: req.url });

  const allowlist = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const claims = sessionClaims as { email?: string; primary_email?: string } | null;
  const email = (claims?.email ?? claims?.primary_email ?? "").toLowerCase();

  if (allowlist.length > 0 && !allowlist.includes(email)) {
    const url = req.nextUrl.clone();
    url.pathname = "/forbidden";
    return NextResponse.redirect(url);
  }
});

export const config = { matcher: ["/((?!_next|.*\\..*).*)"] };
