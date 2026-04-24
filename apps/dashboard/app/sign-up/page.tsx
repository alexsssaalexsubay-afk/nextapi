"use client"

import Link from "next/link"
import { LockKeyhole, Mail, Sparkles } from "lucide-react"
import { AuthLayout } from "@/components/auth/auth-layout"
import { useI18n } from "@/lib/i18n/context"

export default function SignUpPage() {
  const { t } = useI18n()

  return (
    <AuthLayout>
      <div className="mt-8 flex flex-col items-center text-center">
        <div className="flex size-12 items-center justify-center rounded-full border border-signal/20 bg-signal/10 text-signal">
          <LockKeyhole className="size-5" aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-[22px] font-medium tracking-tight text-foreground text-balance">
          {t.auth.inviteOnlyTitle}
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground text-pretty">
          {t.auth.inviteOnlySubtitle}
        </p>
      </div>

      <div className="mt-6 space-y-3 rounded-lg border border-border/70 bg-muted/20 p-4 text-[12.5px] text-muted-foreground">
        <div className="flex gap-2">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-signal" aria-hidden="true" />
          <span>{t.auth.ownerCreatesAccount}</span>
        </div>
        <div className="flex gap-2">
          <Mail className="mt-0.5 size-4 shrink-0 text-signal" aria-hidden="true" />
          <span>{t.auth.contactForAccount}</span>
        </div>
      </div>

      <a
        href="mailto:support@nextapi.top?subject=NextAPI%20account%20request"
        className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-[14px] font-medium text-white shadow-[0_0_30px_-8px] shadow-indigo-500/50 transition-all hover:shadow-[0_0_40px_-4px] hover:shadow-indigo-500/60"
      >
        {t.auth.requestAccess}
      </a>

      <p className="mt-6 text-center text-[13px] text-muted-foreground">
        {t.auth.alreadyHavePrompt}{" "}
        <Link href="/sign-in" className="text-signal underline-offset-4 hover:underline">
          {t.auth.signIn}
        </Link>
      </p>
    </AuthLayout>
  )
}
