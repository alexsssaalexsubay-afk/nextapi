"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button, Input, Card, CardTitle, CardDescription } from "@nextapi/ui";
import { submitContact } from "@/app/[locale]/contact/actions";

export function ContactForm() {
  const t = useTranslations("contact");
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await submitContact(fd);
      } catch {
        const body = encodeURIComponent(
          `Name: ${fd.get("name")}\nCompany: ${fd.get("company")}\nEmail: ${fd.get("email")}\nPhone: ${fd.get("phone")}\nSpend: ${fd.get("spend")}\n\n${fd.get("build")}`,
        );
        window.location.href = `mailto:sales@nextapi.top?subject=Benchmark%20request&body=${body}`;
        return;
      }
      setSubmitted(true);
    });
  }

  if (submitted) {
    return (
      <Card>
        <CardTitle>{t("successTitle")}</CardTitle>
        <CardDescription className="mt-2">{t("successBody")}</CardDescription>
      </Card>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t("name")}>
          <Input name="name" required />
        </Field>
        <Field label={t("company")}>
          <Input name="company" required />
        </Field>
        <Field label={t("email")}>
          <Input name="email" type="email" required />
        </Field>
        <Field label={t("phone")}>
          <Input name="phone" type="tel" />
        </Field>
      </div>

      <Field label={t("build")}>
        <textarea
          name="build"
          required
          rows={5}
          className="flex w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
        />
      </Field>

      <Field label={t("spend")}>
        <select
          name="spend"
          defaultValue="none"
          className="flex h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
        >
          <option value="none">{t("spendNone")}</option>
          <option value="under_1k">{t("spendUnder1k")}</option>
          <option value="1k_10k">{t("spend1kTo10k")}</option>
          <option value="10k_50k">{t("spend10kTo50k")}</option>
          <option value="over_50k">{t("spendOver50k")}</option>
        </select>
      </Field>

      <Button type="submit" size="lg" disabled={pending}>
        {t("submit")}
      </Button>

      <p className="text-xs text-zinc-500">{t("fallback")}</p>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm text-zinc-400">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
