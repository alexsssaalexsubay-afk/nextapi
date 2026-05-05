import { memo, useState } from "react";
import { cn } from "@/lib/cn";
import { useAppStore } from "@/stores/app-store";
import {
  useDirectorStore,
  BUILTIN_TEMPLATES,
  type WorkflowTemplate,
  type SeedanceWorkflow,
} from "@/stores/director-store";

type Category = "all" | "system" | "studio" | "account";

const WORKFLOW_LABELS: Record<SeedanceWorkflow, string> = {
  text_to_video: "Text → Video",
  image_to_video: "Image → Video",
  multimodal_story: "Multi-modal",
};

const WORKFLOW_COLORS: Record<SeedanceWorkflow, string> = {
  text_to_video: "bg-nc-info/15 text-nc-info",
  image_to_video: "bg-nc-accent/15 text-nc-accent",
  multimodal_story: "bg-nc-success/15 text-nc-success",
};

export const TemplatePanel = memo(function TemplatePanel() {
  const setSidebarPage = useAppStore((s) => s.setSidebarPage);
  const { savedTemplates, setSelectedWorkflow, setStyle, setNumShots, setPrompt } = useDirectorStore();
  const [category, setCategory] = useState<Category>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const allTemplates = [...BUILTIN_TEMPLATES, ...savedTemplates];

  const filtered = allTemplates
    .filter((t) => category === "all" || t.category === category)
    .filter((t) =>
      !searchQuery ||
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.nameZh.includes(searchQuery) ||
      t.tags.some((tag) => tag.includes(searchQuery.toLowerCase()))
    );

  const applyTemplate = (t: WorkflowTemplate) => {
    setSelectedWorkflow(t.workflow);
    setStyle(t.style);
    setNumShots(t.shotCount);
    if (t.prompt) setPrompt(t.prompt);
    setSidebarPage("agents");
  };

  const CATEGORIES: { id: Category; label: string; count: number }[] = [
    { id: "all", label: "All", count: allTemplates.length },
    { id: "system", label: "Built-in", count: allTemplates.filter((t) => t.category === "system").length },
    { id: "studio", label: "Studio", count: allTemplates.filter((t) => t.category === "studio").length },
    { id: "account", label: "My Templates", count: allTemplates.filter((t) => t.category === "account").length },
  ];

  return (
    <div className="flex h-full flex-col bg-nc-bg">
      {/* Header */}
      <div className="flex h-[72px] shrink-0 items-center justify-between border-b border-nc-border px-8">
        <div className="flex items-center gap-4">
          <span className="text-[18px] font-semibold text-nc-text">
            Templates
          </span>
          <div className="flex items-center gap-1 overflow-x-auto rounded-[12px] border border-nc-border bg-nc-surface p-1 shadow-sm scrollbar-hide ml-4">
            {CATEGORIES.filter((c) => c.count > 0 || c.id === "all").map((c) => (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={cn(
                  "flex shrink-0 h-[36px] items-center gap-2 rounded-[10px] px-4 text-[14px] font-semibold transition-colors",
                  category === c.id
                    ? "bg-nc-accent text-white shadow-sm"
                    : "text-nc-text-secondary hover:bg-[#F5F3FF] hover:text-nc-accent"
                )}
              >
                <span className="whitespace-nowrap">{c.label}</span>
                <span className="font-mono text-[12px] tabular-nums bg-black/10 px-1.5 py-0.5 rounded-full">{c.count}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="relative">
          <svg
            width="16" height="16" viewBox="0 0 12 12" fill="none"
            stroke="currentColor" strokeWidth="2"
            className="absolute left-[14px] top-1/2 -translate-y-1/2 text-nc-text-tertiary"
          >
            <circle cx="5" cy="5" r="3.5" />
            <path d="M8 8l2.5 2.5" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search templates..."
            className="h-[44px] w-64 rounded-[12px] border border-nc-border bg-nc-surface pl-[38px] pr-[14px] text-[14px] text-nc-text shadow-sm outline-none placeholder:text-nc-text-tertiary focus:border-nc-accent focus:w-80 transition-all"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto p-8 pt-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((template) => (
            <div
              key={template.id}
              onClick={() => applyTemplate(template)}
              className="group flex cursor-pointer flex-col overflow-hidden rounded-[20px] border border-nc-border bg-nc-surface shadow-sm transition-all duration-300 hover:border-nc-accent hover:shadow-md hover:-translate-y-1"
            >
              {/* Visual Thumbnail */}
              <div className="relative aspect-video w-full bg-nc-bg border-b border-nc-border overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-center opacity-50 group-hover:scale-110 group-hover:opacity-100 transition-all duration-500">
                  {template.workflow === "text_to_video" && <span className="text-5xl">📝</span>}
                  {template.workflow === "image_to_video" && <span className="text-5xl">🖼️</span>}
                  {template.workflow === "multimodal_story" && <span className="text-5xl">✨</span>}
                </div>
                <div className="absolute bottom-3 right-3 rounded-[999px] bg-nc-surface/90 border border-nc-border px-2.5 py-1 text-[12px] font-mono font-medium text-nc-text shadow-sm backdrop-blur-md">
                  {template.duration}
                </div>
                <span className={cn(
                  "absolute top-3 left-3 rounded-[999px] border px-3 py-1 text-[12px] font-semibold shadow-sm backdrop-blur-md",
                  WORKFLOW_COLORS[template.workflow],
                  "border-current"
                )}>
                  {WORKFLOW_LABELS[template.workflow]}
                </span>
              </div>

              {/* Content */}
              <div className="flex flex-1 flex-col p-6">
                <div className="mb-2">
                  <h3 className="text-[18px] font-semibold text-nc-text">{template.name}</h3>
                  <p className="mt-1 text-[14px] font-medium text-nc-text-secondary">{template.nameZh}</p>
                </div>

                <p className="mb-6 text-[14px] leading-[22px] text-nc-text-secondary line-clamp-2">
                  {template.description}
                </p>

                <div className="mt-auto">
                  <div className="flex items-center gap-2 border-t border-nc-border pt-4">
                    <span className="bg-nc-bg px-[10px] py-[4px] rounded-[999px] border border-nc-border text-[12px] font-medium text-nc-text-secondary">{template.shotCount} shots</span>
                    <span className="bg-nc-bg px-[10px] py-[4px] rounded-[999px] border border-nc-border text-[12px] font-medium text-nc-text-secondary">{template.style}</span>
                  </div>

                  {template.tags.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {template.tags.map((tag) => (
                        <span key={tag} className="rounded-[999px] border border-nc-border bg-nc-bg px-[10px] py-[4px] text-[12px] font-medium text-nc-text-secondary">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-sm text-nc-text-tertiary">No templates found</span>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="mt-2 text-sm font-medium text-nc-accent shadow-sm transition-all hover:text-nc-accent-hover hover:underline"
              >
                Clear search
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
