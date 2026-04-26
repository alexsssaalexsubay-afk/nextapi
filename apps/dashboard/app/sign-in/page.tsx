"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { AlertCircle, Loader2, Mail, ShieldCheck } from "lucide-react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { AuthLayout } from "@/components/auth/auth-layout"
import { Label } from "@/components/ui/label"
import { useI18n } from "@/lib/i18n/context"
import { ApiError, loginWithEmailCode, sendEmailCode } from "@/lib/api"

export default function SignInPage() {
  const { t } = useI18n()
  const router = useRouter()
  const search = useSearchParams()
  const [isLoading, setIsLoading] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  const schema = useMemo(
    () =>
      z.object({
        email: z.string().email(t.auth.invalidEmail),
        code: z.string().regex(/^\d{6}$/, t.auth.codeInvalid),
      }),
    [t.auth.codeInvalid, t.auth.invalidEmail],
  )
  type SignInValues = z.infer<typeof schema>

  const {
    register,
    getValues,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", code: "" },
  })

  const sendCode = async () => {
    const email = getValues("email")
    const parsed = z.string().email().safeParse(email)
    if (!parsed.success) {
      setServerError(t.auth.invalidEmail)
      return
    }
    setServerError(null)
    setSendingCode(true)
    try {
      await sendEmailCode(email)
      setSentTo(email)
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : t.auth.codeSendFailed)
    } finally {
      setSendingCode(false)
    }
  }

  const submit = async (values: SignInValues) => {
    setServerError(null)
    setIsLoading(true)
    try {
      await loginWithEmailCode(values.email, values.code)
      router.replace(search.get("next") || "/")
      router.refresh()
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : t.auth.invalidCode)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthLayout>
      <h1 className="mt-8 text-center text-[22px] font-medium tracking-tight text-foreground text-balance">
        {t.auth.welcomeBack}
      </h1>
      <p className="mt-2 mb-8 text-center text-[13px] text-muted-foreground text-pretty">
        {t.auth.codeSignInSubtitle}
      </p>

      {serverError && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-[12px] text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{serverError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email" className="text-sm font-medium text-foreground">
            {t.auth.email}
          </Label>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder={t.auth.emailPlaceholder}
              aria-invalid={!!errors.email}
              className="h-10 w-full rounded-lg border border-input bg-input/30 pl-10 pr-3 text-[14px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 aria-[invalid=true]:border-destructive"
              {...register("email")}
            />
          </div>
          {errors.email && <p className="text-[12px] text-destructive">{errors.email.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="code" className="text-sm font-medium text-foreground">
            {t.auth.verificationCode}
          </Label>
          <div className="relative">
            <ShieldCheck
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              aria-invalid={!!errors.code}
              className="h-10 w-full rounded-lg border border-input bg-input/30 pl-10 pr-28 text-[14px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 aria-[invalid=true]:border-destructive"
              {...register("code")}
            />
            <button
              type="button"
              onClick={sendCode}
              disabled={sendingCode}
              className="absolute right-1 top-1/2 inline-flex h-8 -translate-y-1/2 items-center justify-center rounded-md px-3 text-[12px] font-medium text-signal transition-colors hover:bg-signal/10 disabled:opacity-60"
            >
              {sendingCode ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t.auth.sendCode}
            </button>
          </div>
          {errors.code && <p className="text-[12px] text-destructive">{errors.code.message}</p>}
          {sentTo && <p className="text-[12px] text-muted-foreground">{t.auth.codeSentTo.replace("{email}", sentTo)}</p>}
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="mt-2 inline-flex h-10 w-full items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-[14px] font-medium text-white shadow-[0_0_30px_-8px] shadow-indigo-500/50 transition-all hover:shadow-[0_0_40px_-4px] hover:shadow-indigo-500/60 disabled:opacity-70"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>{t.auth.signIn}</span>}
        </button>
      </form>

      <p className="mt-6 text-center text-[13px] text-muted-foreground">
        {t.auth.noAccountPrompt}{" "}
        <Link href="/sign-up" className="text-signal underline-offset-4 hover:underline">
          {t.auth.contactOwner}
        </Link>
      </p>
    </AuthLayout>
  )
}
