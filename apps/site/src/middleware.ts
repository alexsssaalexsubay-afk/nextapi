import createIntlMiddleware from "next-intl/middleware";
import { locales, defaultLocale } from "./i18n";

export default createIntlMiddleware({
  locales: [...locales],
  defaultLocale,
  localePrefix: "always",
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
