"use client";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardTitle, CardDescription, Input, Button } from "@nextapi/ui";

export const priceTable = {
  standard: { "480p": 8, "720p": 10, "1080p": 15 },
  fast: { "480p": 5, "720p": 7, "1080p": 10 },
} as const;

type Resolution = keyof typeof priceTable.standard;
type Mode = keyof typeof priceTable;

export function CalculatorForm() {
  const t = useTranslations("calculator");
  const [duration, setDuration] = useState(5);
  const [resolution, setResolution] = useState<Resolution>("720p");
  const [mode, setMode] = useState<Mode>("standard");
  const [volume, setVolume] = useState(1000);

  const { perVideoCents, totalCents } = useMemo(() => {
    const rate = priceTable[mode][resolution];
    const per = rate * duration;
    return { perVideoCents: per, totalCents: per * volume };
  }, [duration, resolution, mode, volume]);

  const fmt = (c: number) =>
    `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardTitle>{t("heading")}</CardTitle>
        <CardDescription className="mt-2">{t("subheading")}</CardDescription>
        <div className="mt-6 space-y-5">
          <div>
            <label className="text-sm text-zinc-400">{t("duration")} · {duration}s</label>
            <input
              type="range"
              min={4}
              max={15}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="mt-2 w-full accent-violet-500"
            />
          </div>
          <div>
            <label className="text-sm text-zinc-400">{t("resolution")}</label>
            <div className="mt-2 flex gap-2">
              {(["480p", "720p", "1080p"] as Resolution[]).map((r) => (
                <Button
                  key={r}
                  variant={resolution === r ? "default" : "secondary"}
                  onClick={() => setResolution(r)}
                  size="sm"
                >
                  {r}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm text-zinc-400">{t("mode")}</label>
            <div className="mt-2 flex gap-2">
              <Button
                variant={mode === "fast" ? "default" : "secondary"}
                onClick={() => setMode("fast")}
                size="sm"
              >
                {t("modeFast")}
              </Button>
              <Button
                variant={mode === "standard" ? "default" : "secondary"}
                onClick={() => setMode("standard")}
                size="sm"
              >
                {t("modeStandard")}
              </Button>
            </div>
          </div>
          <div>
            <label className="text-sm text-zinc-400">{t("volume")}</label>
            <Input
              type="number"
              min={1}
              value={volume}
              onChange={(e) => setVolume(Math.max(1, Number(e.target.value) || 0))}
              className="mt-2"
            />
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle>{t("breakdownTitle")}</CardTitle>
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-xs uppercase tracking-wider text-zinc-500">
              <th className="pb-2">{t("breakdownItem")}</th>
              <th className="pb-2 text-right">{t("breakdownValue")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-900">
            <tr>
              <td className="py-3 text-zinc-300">{t("duration")}</td>
              <td className="py-3 text-right text-zinc-100">{duration}s</td>
            </tr>
            <tr>
              <td className="py-3 text-zinc-300">{t("resolution")}</td>
              <td className="py-3 text-right text-zinc-100">{resolution}</td>
            </tr>
            <tr>
              <td className="py-3 text-zinc-300">{t("mode")}</td>
              <td className="py-3 text-right text-zinc-100">{mode}</td>
            </tr>
            <tr>
              <td className="py-3 text-zinc-300">{t("volume")}</td>
              <td className="py-3 text-right text-zinc-100">{volume.toLocaleString()}</td>
            </tr>
            <tr>
              <td className="py-3 text-zinc-300">{t("perVideo")}</td>
              <td className="py-3 text-right text-zinc-100">{fmt(perVideoCents)}</td>
            </tr>
            <tr>
              <td className="py-3 font-medium text-zinc-100">{t("total")}</td>
              <td className="py-3 text-right text-lg font-semibold text-violet-400">
                {fmt(totalCents)}
              </td>
            </tr>
          </tbody>
        </table>
        <div className="mt-6 rounded-md border border-violet-700/60 bg-violet-950/30 p-4 text-sm text-violet-200">
          {t("reservedCallout")}
        </div>
      </Card>
    </div>
  );
}
