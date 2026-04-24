"use client"

import Link from "next/link"
import { ArrowLeft, LifeBuoy, Mail } from "lucide-react"
import { AuthLayout } from "@/components/auth/auth-layout"
import { useI18n } from "@/lib/i18n/context"

export default function ForgotPasswordPage() {
  const { t } = useI18n()

  return (
    <AuthLayout>
      <div className="mt-8 flex flex-col items-center text-center">
        <div className="flex size-12 items-center justify-center rounded-full border border-signal/20 bg-signal/10 text-signal">
          <LifeBuoy className="size-5" aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-[22px] font-medium tracking-tight text-foreground text-balance">
          {t.auth.resetTitle}
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground text-pretty">
          {t.auth.operatorResetSubtitle}
        </p>
      </div>

      <a
        href="mailto:support@nextapi.top?subject=NextAPI%20password%20reset"
        className="mt-6 inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-[14px] font-medium text-white shadow-[0_0_30px_-8px] shadow-indigo-500/50 transition-all hover:shadow-[0_0_40px_-4px] hover:shadow-indigo-500/60"
      >
        <Mail className="size-4" aria-hidden="true" />
        {t.auth.contactSupportReset}
      </a>

      <Link
        href="/sign-in"
        className="mt-6 flex items-center justify-center gap-1.5 text-[13px] text-signal underline-offset-4 hover:underline"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        <span>{t.auth.backToSignIn}</span>
      </Link>
    </AuthLayout>
  )
}
