"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Card,
  CardDescription,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  Badge,
} from "@nextapi/ui";

type Row = {
  id: number;
  delta_credits: number;
  reason: string;
  note: string;
  created_at: string;
};

import { apiFetch } from "@/lib/api";

export default function BillingPage() {
  const t = useTranslations("billing");
  const [balance, setBalance] = useState<number | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    apiFetch<{ balance: number }>("/v1/credits").then(
      (r) => r.data && setBalance(r.data.balance),
    );
    apiFetch<{ data: Row[] }>("/v1/billing/ledger").then(
      (r) => r.data && setRows(r.data.data ?? []),
    );
  }, []);

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="mt-1 text-sm text-zinc-400">
        1 credit = $0.001. Signup bonus is 500 credits.
      </p>

      <Card className="mt-6">
        <CardDescription>{t("balance")}</CardDescription>
        <p className="mt-2 text-4xl font-semibold tabular-nums">
          {balance === null ? "—" : balance.toLocaleString()}
        </p>
      </Card>

      <h2 className="mt-10 mb-3 text-lg font-medium">{t("history")}</h2>
      <Table>
        <THead>
          <TR>
            <TH>{t("date")}</TH>
            <TH>{t("reason")}</TH>
            <TH className="text-right">{t("delta")}</TH>
            <TH>{t("note")}</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((r) => (
            <TR key={r.id}>
              <TD className="text-zinc-400">
                {new Date(r.created_at).toLocaleString()}
              </TD>
              <TD>
                <Badge variant="neutral">{r.reason}</Badge>
              </TD>
              <TD
                className={
                  "text-right font-mono tabular-nums " +
                  (r.delta_credits >= 0 ? "text-emerald-400" : "text-red-400")
                }
              >
                {r.delta_credits >= 0 ? "+" : ""}
                {r.delta_credits}
              </TD>
              <TD className="text-zinc-400">{r.note}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </>
  );
}
