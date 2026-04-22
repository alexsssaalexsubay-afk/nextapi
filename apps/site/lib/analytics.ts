type EventName =
  | "demo_run_clicked"
  | "hero_signup_clicked"
  | "nav_login_clicked"
  | "enterprise_form_submitted"
  | "cta_get_started_clicked"

declare global {
  interface Window {
    posthog?: {
      capture: (event: string, properties?: Record<string, unknown>) => void
    }
  }
}

export function track(event: EventName, properties?: Record<string, unknown>) {
  if (typeof window !== "undefined" && window.posthog) {
    window.posthog.capture(event, properties)
  }
}
