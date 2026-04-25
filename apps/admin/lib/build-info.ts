export const BUILD_SHA = (process.env.NEXT_PUBLIC_BUILD_SHA || "dev").slice(0, 7)
export const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME || ""
export const BUILD_LABEL = BUILD_TIME ? `${BUILD_SHA} · ${BUILD_TIME}` : BUILD_SHA
