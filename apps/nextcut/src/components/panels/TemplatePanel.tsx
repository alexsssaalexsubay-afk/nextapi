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
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-nc-border px-4">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium uppercase tracking-[0.12em] text-nc-text-secondary">
            Templates
          </span>
          <div className="flex items-center gap-0.5 rounded-lg border border-nc-border bg-nc-panel p-1 shadow-sm">
            {CATEGORIES.filter((c) => c.count > 0 || c.id === "all").map((c) => (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={cn(
                  "flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium transition-all",
                  category === c.id
                    ? "bg-nc-panel-active text-nc-text shadow-sm"
                    : "text-nc-text-tertiary hover:text-nc-text-secondary"
                )}
              >
                {c.label}
                <span className="font-mono text-[10px] tabular-nums text-nc-text-tertiary">{c.count}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="relative">
          <svg
            width="12" height="12" viewBox="0 0 12 12" fill="none"
            stroke="currentColor" strokeWidth="1.2"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-nc-text-tertiary"
          >
            <circle cx="5" cy="5" r="3.5" />
            <path d="M8 8l2.5 2.5" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search templates..."
            className="h-9 w-40 rounded-lg border border-nc-border bg-nc-panel pl-8 pr-2 text-xs text-nc-text shadow-sm outline-none placeholder:text-nc-text-tertiary focus:border-nc-accent/40 focus:w-52 transition-all"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((template) => (
            <div
              key={template.id}
              onClick={() => applyTemplate(template)}
              className="group cursor-pointer rounded-[var(--radius-lg)] border border-nc-border-strong bg-nc-surface p-4 shadow-sm transition-all duration-200 hover:-translate-y-px hover:border-nc-accent/30 hover:shadow-lg"
            >
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-nc-text">{template.name}</h3>
                  <p className="mt-0.5 text-xs text-nc-text-tertiary">{template.nameZh}</p>
                </div>
                <span className={cn(
                  "shrink-0 rounded-full border border-nc-border/50 px-2.5 py-1 text-[10px] font-medium shadow-sm",
                  WORKFLOW_COLORS[template.workflow]
                )}>
                  {WORKFLOW_LABELS[template.workflow]}
                </span>
              </div>

              <p className="mb-3 text-sm leading-relaxed text-nc-text-secondary">
                {template.description}
              </p>

              <div className="flex items-center gap-3 border-t border-nc-border pt-3 text-xs text-nc-text-tertiary">
                <span className="tabular-nums">{template.duration}</span>
                <span>{template.shotCount} shots</span>
                <span className="capitalize">{template.style}</span>
              </div>

              {template.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {template.tags.map((tag) => (
                    <span key={tag} className="rounded-md border border-nc-border bg-nc-panel px-2 py-1 text-[10px] text-nc-text-tertiary">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
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
