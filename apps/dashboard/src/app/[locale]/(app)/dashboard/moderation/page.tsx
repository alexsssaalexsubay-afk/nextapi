"use client";

import React, { useEffect, useState } from "react";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@nextapi/ui";
import { Info } from "lucide-react";
import { apiFetch } from "@/lib/api";

type ProfileName = "strict" | "balanced" | "relaxed" | "custom";

type CustomRules = {
  allow_nsfw?: boolean;
  allow_public_figures?: boolean;
  block_keywords?: string[];
};

type ProfileResponse = {
  profile: ProfileName;
  custom_rules: CustomRules;
};

const PROFILE_DESC: Record<ProfileName, string> = {
  strict: "Toughest filters. Rejects NSFW, minors-related, public figures.",
  balanced: "Default. Rejects illegal and NSFW; allows stylized violence.",
  relaxed: "Minimal filtering beyond legal requirements.",
  custom: "Fine-grained toggles; requires signed AUP addendum.",
};

export default function ModerationPage() {
  const [profileName, setProfileName] = useState<ProfileName>("balanced");
  const [customRules, setCustomRules] = useState<CustomRules>({});
  const [keywords, setKeywords] = useState("");
  const [saving, setSaving] = useState(false);
  const [degraded, setDegraded] = useState(false);

  useEffect(() => {
    void (async () => {
      const r = await apiFetch<ProfileResponse>("/v1/moderation_profile");
      if (r.ok && r.data) {
        setProfileName(r.data.profile);
        const rules = r.data.custom_rules ?? {};
        setCustomRules(rules);
        setKeywords((rules.block_keywords ?? []).join(", "));
      } else {
        setDegraded(true);
      }
    })();
  }, []);

  async function save() {
    setSaving(true);
    const rules: CustomRules =
      profileName === "custom"
        ? {
            ...customRules,
            block_keywords: keywords
              .split(",")
              .map((k) => k.trim())
              .filter(Boolean),
          }
        : {};
    await apiFetch("/v1/moderation_profile", {
      method: "PUT",
      body: JSON.stringify({ profile: profileName, custom_rules: rules }),
    });
    setSaving(false);
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Moderation</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Set content safety filters for your organization.
      </p>

      {degraded && (
        <div className="mt-4 rounded-md border border-zinc-800 bg-zinc-900/40 p-3 text-sm text-zinc-400">
          Moderation profile temporarily unavailable.
        </div>
      )}

      <div className="mt-4 flex items-start gap-3 rounded-md border border-sky-800 bg-sky-950/30 p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
        <p className="text-sm text-sky-200">
          Moderation profile applies org-wide. Override per API key from the
          Keys page.
        </p>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Choose a moderation profile.</CardDescription>
        </CardHeader>
        <div className="mt-4 space-y-3">
          {(Object.keys(PROFILE_DESC) as ProfileName[]).map((p) => (
            <label
              key={p}
              className="flex cursor-pointer items-start gap-3 rounded-md border border-zinc-800 p-3 hover:bg-zinc-900/40"
            >
              <input
                type="radio"
                name="profile"
                checked={profileName === p}
                onChange={() => setProfileName(p)}
                className="mt-1 accent-violet-500"
              />
              <div>
                <div className="text-sm font-medium capitalize text-zinc-100">
                  {p}
                </div>
                <div className="text-xs text-zinc-400">{PROFILE_DESC[p]}</div>
              </div>
            </label>
          ))}
        </div>
      </Card>

      {profileName === "custom" && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Custom rules</CardTitle>
          </CardHeader>
          <div className="mt-4 space-y-4">
            <Toggle
              label="Allow NSFW"
              checked={customRules.allow_nsfw ?? false}
              onChange={(v) =>
                setCustomRules({ ...customRules, allow_nsfw: v })
              }
            />
            <div>
              <Toggle
                label="Allow minors"
                checked={false}
                onChange={() => {}}
                disabled
              />
              <p className="mt-1 text-xs text-amber-400">
                Legally gated — cannot be enabled via self-serve.
              </p>
            </div>
            <Toggle
              label="Allow public figures"
              checked={customRules.allow_public_figures ?? false}
              onChange={(v) =>
                setCustomRules({ ...customRules, allow_public_figures: v })
              }
            />
            <div>
              <label className="mb-1 block text-xs text-zinc-400">
                Block keywords (comma-separated)
              </label>
              <textarea
                value={keywords}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setKeywords(e.target.value)
                }
                rows={3}
                className="w-full rounded-md border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-100"
              />
            </div>
          </div>
        </Card>
      )}

      <div className="mt-6">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save profile"}
        </Button>
      </div>
    </>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center gap-3">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          onChange(e.target.checked)
        }
        className="h-4 w-4 accent-violet-500"
      />
      <span className="text-sm text-zinc-200">{label}</span>
    </label>
  );
}
