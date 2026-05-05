import { memo, useState, useCallback, useRef } from "react";
import { cn } from "@/lib/cn";
import { useDirectorStore, type CharacterProfile } from "@/stores/director-store";
import { sidecarFetch } from "@/lib/sidecar";
import { useI18nStore } from "@/stores/i18n-store";

const CHARACTER_COLORS = [
  "#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6",
  "#8b5cf6", "#ef4444", "#14b8a6", "#f97316", "#06b6d4",
];

let charCounter = 0;

type PortraitGenerationResponse = {
  image_url?: string;
};

function createCharacter(name?: string): CharacterProfile {
  charCounter++;
  return {
    id: `char_${Date.now()}_${charCounter}`,
    name: name || `Character ${charCounter}`,
    appearance: "",
    personality: "",
    voice: "",
    referenceImages: [],
    color: CHARACTER_COLORS[(charCounter - 1) % CHARACTER_COLORS.length],
    locked: false,
  };
}

export const CharacterPanel = memo(function CharacterPanel() {
  const { characters, addCharacter, updateCharacter, removeCharacter, shots } = useDirectorStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<string | null>(null);
  const { t } = useI18nStore();

  const handleAddCharacter = useCallback(() => {
    const char = createCharacter();
    addCharacter(char);
    setExpandedId(char.id);
  }, [addCharacter]);

  const [generating, setGenerating] = useState<string | null>(null);

  const handleGeneratePortrait = useCallback(async (charId: string) => {
    const char = characters.find((c) => c.id === charId);
    if (!char || !char.appearance) return;
    setGenerating(charId);
    try {
      const res = await sidecarFetch<PortraitGenerationResponse>("/agents/generate-portrait", {
        method: "POST",
        body: JSON.stringify({
          character_id: char.id,
          name: char.name,
          appearance: char.appearance,
          style: "photorealistic",
        }),
      });
      if (res.image_url) {
        updateCharacter(charId, {
          referenceImages: [...char.referenceImages, res.image_url],
        });
      }
    } catch {
      // handled by toast
    } finally {
      setGenerating(null);
    }
  }, [characters, updateCharacter]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !uploadTarget) return;
    const char = characters.find((c) => c.id === uploadTarget);
    if (!char) return;
    const urls = Array.from(files).map((f) => URL.createObjectURL(f));
    updateCharacter(uploadTarget, {
      referenceImages: [...char.referenceImages, ...urls],
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
    setUploadTarget(null);
  }, [uploadTarget, characters, updateCharacter]);

  const removeRefImage = useCallback((charId: string, imgIndex: number) => {
    const char = characters.find((c) => c.id === charId);
    if (!char) return;
    updateCharacter(charId, {
      referenceImages: char.referenceImages.filter((_, i) => i !== imgIndex),
    });
  }, [characters, updateCharacter]);

  const getCharacterShotCount = useCallback((charName: string) => {
    return shots.filter((s) =>
      s.prompt.toLowerCase().includes(charName.toLowerCase()) ||
      s.title.toLowerCase().includes(charName.toLowerCase())
    ).length;
  }, [shots]);

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-nc-text">{t("char.title")}</h3>
          <p className="text-xs text-nc-text-secondary">
            {t("char.desc")}
          </p>
        </div>
        <button
          onClick={handleAddCharacter}
          className="flex items-center gap-1.5 rounded-lg bg-nc-accent/10 px-3 py-2 text-xs font-semibold text-nc-accent shadow-sm transition-all hover:bg-nc-accent/20 hover:shadow-md"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M5 2v6M2 5h6" />
          </svg>
          {t("char.add")}
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Character list */}
      {characters.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-[var(--radius-lg)] border border-dashed border-nc-border-strong bg-nc-bg py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-nc-surface text-nc-text-tertiary border border-nc-border">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M19 8v6" />
              <path d="M22 11h-6" />
            </svg>
          </div>
          <div>
            <p className="text-[15px] font-bold text-nc-text">{t("char.empty")}</p>
            <p className="mt-1 max-w-[240px] text-[13px] leading-relaxed text-nc-text-tertiary">
              {t("char.emptyDesc1")} {t("char.emptyDesc2")}
            </p>
          </div>
          <button
            onClick={handleAddCharacter}
            className="mt-2 text-[14px] font-bold text-nc-text hover:text-nc-text-secondary transition-colors underline"
          >
            {t("char.createFirst")}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {characters.map((char) => {
            const isExpanded = expandedId === char.id;
            const shotCount = getCharacterShotCount(char.name);

            return (
              <div
                key={char.id}
                className={cn(
                  "rounded-[var(--radius-lg)] border border-nc-border shadow-sm transition-all duration-200 hover:shadow-md",
                  isExpanded
                    ? "border-nc-border-strong bg-nc-surface shadow-md"
                    : "bg-nc-surface hover:border-nc-border-strong"
                )}
              >
                {/* Character header */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : char.id)}
                  className="flex w-full items-center gap-3 px-3 py-2.5"
                >
                  {/* Avatar / first ref image */}
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full"
                    style={{ backgroundColor: char.color + "20", borderColor: char.color + "40", borderWidth: "2px" }}
                  >
                    {char.referenceImages.length > 0 ? (
                      <img src={char.referenceImages[0]} alt={char.name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-sm font-bold" style={{ color: char.color }}>
                        {char.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>

                  <div className="flex-1 text-left min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-nc-text truncate">{char.name}</span>
                      {char.locked && (
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className="text-nc-accent shrink-0">
                          <path d="M2 4V3a2 2 0 114 0v1h.5a.5.5 0 01.5.5v3a.5.5 0 01-.5.5h-5a.5.5 0 01-.5-.5v-3a.5.5 0 01.5-.5H2zm1 0h2V3a1 1 0 00-2 0v1z" />
                        </svg>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-nc-text-secondary truncate">
                      <span className="shrink-0">{char.referenceImages.length} {t("char.refs")}</span>
                      {shotCount > 0 && <span className="shrink-0">{t("char.inShots").replace("{count}", shotCount.toString())}</span>}
                      {char.appearance && <span className="truncate">{char.appearance}</span>}
                    </div>
                  </div>

                  <svg
                    width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2"
                    className={cn("shrink-0 text-nc-text-secondary transition-transform", isExpanded && "rotate-180")}
                  >
                    <path d="M2 3.5l3 3 3-3" />
                  </svg>
                </button>

                {/* Expanded form */}
                {isExpanded && (
                  <div className="border-t border-nc-border px-3 pb-3 pt-2.5">
                    {/* Name */}
                    <div className="mb-2">
                      <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-nc-text-secondary">{t("char.name")}</label>
                      <input
                        value={char.name}
                        onChange={(e) => updateCharacter(char.id, { name: e.target.value })}
                        className="w-full rounded-lg border border-nc-border bg-nc-panel px-2.5 py-2 text-sm text-nc-text outline-none focus:border-nc-accent/30"
                        placeholder={t("char.namePh")}
                      />
                    </div>

                    {/* Appearance (most important for consistency) */}
                    <div className="mb-2">
                      <label className="mb-1 flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-nc-text-secondary">
                        {t("char.appearance")}
                        <span className="rounded bg-nc-accent/10 px-1 py-px text-xs font-semibold normal-case text-nc-accent">{t("char.critical")}</span>
                      </label>
                      <textarea
                        value={char.appearance}
                        onChange={(e) => updateCharacter(char.id, { appearance: e.target.value })}
                        rows={3}
                        className="w-full resize-none rounded-lg border border-nc-border bg-nc-panel px-2.5 py-2 text-sm leading-relaxed text-nc-text outline-none focus:border-nc-accent/30"
                        placeholder={t("char.appPh")}
                      />
                      <div className="mt-0.5 text-xs text-nc-text-secondary">
                        {t("char.appHint")}
                      </div>
                    </div>

                    {/* Reference images (most important for Seedance) */}
                    <div className="mb-2">
                      <label className="mb-1 flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-nc-text-secondary">
                        {t("char.refImages")}
                        <span className="rounded bg-nc-success/10 px-1 py-px text-xs font-semibold normal-case text-nc-success">{t("char.key")}</span>
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {char.referenceImages.map((img, i) => (
                          <div key={i} className="group relative h-14 w-14 overflow-hidden rounded-lg border border-nc-border shadow-sm">
                            <img src={img} alt={`ref ${i + 1}`} className="h-full w-full object-cover" />
                            {i === 0 && (
                              <div className="absolute bottom-0 left-0 right-0 bg-nc-accent/80 py-px text-center text-xs font-bold uppercase text-white">
                                {t("char.master")}
                              </div>
                            )}
                            <button
                              onClick={() => removeRefImage(char.id, i)}
                              className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-nc-error text-white opacity-0 transition-opacity group-hover:opacity-100"
                            >
                              <svg width="5" height="5" viewBox="0 0 5 5" stroke="currentColor" strokeWidth="1.5"><path d="M1 1l3 3M4 1l-3 3" /></svg>
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => { setUploadTarget(char.id); fileInputRef.current?.click(); }}
                          className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-nc-border text-nc-text-secondary transition-all hover:border-nc-border-strong hover:text-nc-text"
                          title={t("char.uploadImage")}
                        >
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M6 3v6M3 6h6" /></svg>
                        </button>
                        {char.appearance && (
                          <button
                            onClick={() => handleGeneratePortrait(char.id)}
                            disabled={generating === char.id}
                            className={cn(
                              "flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-lg border text-xs font-medium shadow-sm transition-all",
                              generating === char.id
                                ? "border-nc-accent/30 bg-nc-accent/10 text-nc-accent"
                                : "border-dashed border-nc-accent/30 text-nc-accent/60 hover:border-nc-accent hover:bg-nc-accent/5 hover:text-nc-accent"
                            )}
                            title={t("char.genPortrait")}
                          >
                            {generating === char.id ? (
                              <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                            ) : (
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1"><path d="M6 1l1.5 3 3 .5-2.25 2 .75 3L6 8l-3 1.5.75-3L1.5 4.5l3-.5z" /></svg>
                            )}
                            <span>{t("char.aiGen")}</span>
                          </button>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-nc-text-secondary">
                        {t("char.refHint")}
                      </div>
                    </div>

                    {/* Personality & Voice (optional) */}
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-nc-text-secondary">{t("char.personality")}</label>
                        <input
                          value={char.personality}
                          onChange={(e) => updateCharacter(char.id, { personality: e.target.value })}
                          className="w-full rounded-lg border border-nc-border bg-nc-panel px-2.5 py-2 text-sm text-nc-text outline-none focus:border-nc-accent/30"
                          placeholder={t("char.persPh")}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-nc-text-secondary">{t("char.voice")}</label>
                        <input
                          value={char.voice}
                          onChange={(e) => updateCharacter(char.id, { voice: e.target.value })}
                          className="w-full rounded-lg border border-nc-border bg-nc-panel px-2.5 py-2 text-sm text-nc-text outline-none focus:border-nc-accent/30"
                          placeholder={t("char.voicePh")}
                        />
                      </div>
                    </div>

                    {/* Identity lock toggle */}
                    <div className="flex items-center justify-between rounded-lg border border-nc-border bg-nc-panel px-3 py-2.5 shadow-sm">
                      <div>
                        <div className="text-xs font-medium text-nc-text">{t("char.identityLock")}</div>
                        <div className="text-xs text-nc-text-secondary">
                          {t("char.lockHint")}
                        </div>
                      </div>
                      <button
                        onClick={() => updateCharacter(char.id, { locked: !char.locked })}
                        className={cn(
                          "flex h-6 w-11 items-center rounded-full px-0.5 transition-all",
                          char.locked ? "bg-nc-accent" : "bg-nc-border"
                        )}
                      >
                        <div className={cn(
                          "h-5 w-5 rounded-full bg-white shadow-md transition-transform",
                          char.locked ? "translate-x-5" : "translate-x-0"
                        )} />
                      </button>
                    </div>

                    {/* Actions */}
                    <div className="mt-2 flex justify-end">
                      <button
                        onClick={() => removeCharacter(char.id)}
                        className="text-xs text-nc-error/60 transition-colors hover:text-nc-error"
                      >
                        {t("char.remove")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Consistency tips */}
      {characters.length > 0 && (
        <div className="rounded-lg border border-nc-accent/20 bg-nc-accent-muted p-3 shadow-sm">
          <div className="mb-1 text-xs font-semibold text-nc-accent">{t("char.tipsTitle")}</div>
          <ul className="flex flex-col gap-0.5 text-xs leading-relaxed text-nc-text-secondary">
            <li>{t("char.tip1")}</li>
            <li>{t("char.tip2")}</li>
            <li>{t("char.tip3")}</li>
            <li>{t("char.tip4")}</li>
          </ul>
        </div>
      )}
    </div>
  );
});
