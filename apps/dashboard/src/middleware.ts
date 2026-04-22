import { clerkMiddleware } from "@clerk/nextjs/server";
import createIntlMiddleware from "next-intl/middleware";
import { locales, defaultLocale } from "./i18n";

const intl = createIntlMiddleware({
  locales: [...locales],
  defaultLocale,
  localePrefix: "always",
});

export default clerkMiddleware((_auth, req) => intl(req));

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
