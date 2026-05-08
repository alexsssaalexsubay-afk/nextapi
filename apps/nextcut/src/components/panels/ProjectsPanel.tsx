import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { sidecarFetch } from "@/lib/sidecar";
import { useAppStore } from "@/stores/app-store";
import {
  Button,
  EmptyState,
  FieldLabel,
  FieldShell,
  MediaThumb,
  PageHeader,
  PageShell,
  Pill,
  SectionCard,
  StatCard,
  StatusBadge,
  Surface,
} from "@/components/ui/kit";

interface Project {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

const PROJECT_TONES = ["accent", "info", "success", "warning"] as const;

export const ProjectsPanel = memo(function ProjectsPanel() {
  const setSidebarPage = useAppStore((s) => s.setSidebarPage);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [status, setStatus] = useState<{ tone: "success" | "danger" | "info"; text: string } | null>(null);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await sidecarFetch<{ projects: Project[] }>("/projects/", undefined, 0);
      setProjects(res.projects);
      setStatus(null);
    } catch {
      setProjects([]);
      setStatus({ tone: "danger", text: "项目列表加载失败，请检查本地引擎连接。" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const createProject = useCallback(async () => {
    if (!newName.trim()) return;
    setStatus({ tone: "info", text: "正在创建项目..." });
    try {
      await sidecarFetch("/projects/", {
        method: "POST",
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() }),
      }, 0);
      setNewName("");
      setNewDesc("");
      setShowCreate(false);
      setStatus({ tone: "success", text: "项目已创建，可以继续进入创作流程。" });
      await loadProjects();
    } catch {
      setStatus({ tone: "danger", text: "创建失败，请确认引擎服务可用后重试。" });
    }
  }, [newName, newDesc, loadProjects]);

  const deleteProject = useCallback(async (id: string) => {
    setStatus({ tone: "info", text: "正在删除项目..." });
    try {
      await sidecarFetch(`/projects/${id}`, { method: "DELETE" }, 0);
      setStatus({ tone: "success", text: "项目已删除。" });
      await loadProjects();
    } catch {
      setStatus({ tone: "danger", text: "删除失败，请稍后重试。" });
    }
  }, [loadProjects]);

  const stats = useMemo(() => {
    const updatedThisWeek = projects.filter((p) => {
      const time = new Date(p.updated_at).getTime();
      return Number.isFinite(time) && Date.now() - time < 7 * 24 * 60 * 60 * 1000;
    }).length;
    return {
      total: projects.length,
      updatedThisWeek,
      draft: Math.max(projects.length - updatedThisWeek, 0),
    };
  }, [projects]);

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("zh-CN", { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return iso;
    }
  };

  return (
    <PageShell>
      <PageHeader
        eyebrow="NextCut Studio"
        title="项目"
        subtitle="管理团队视频项目、草稿和近期创作，从这里继续进入 AI 导演、工作台或剪辑流程。"
        action={
          <>
            <Button variant="secondary" onClick={loadProjects}>
              <RefreshIcon />
              刷新
            </Button>
            <Button variant="primary" onClick={() => setShowCreate((v) => !v)}>
              <PlusIcon />
              新建项目
            </Button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <StatCard label="全部项目" value={String(stats.total)} helper="团队当前项目总量" icon={<FolderIcon />} tone="accent" />
        <StatCard label="本周更新" value={String(stats.updatedThisWeek)} helper="最近仍在推进的项目" icon={<PulseIcon />} tone="success" />
        <StatCard label="待继续" value={String(stats.draft)} helper="可从编辑器或 AI 导演继续" icon={<PlayIcon />} tone="info" />
      </div>

      {status && !showCreate && (
        <div className="mt-6 flex">
          <Pill tone={status.tone}>{status.text}</Pill>
        </div>
      )}

      {showCreate && (
        <SectionCard className="mt-6" title="创建项目" subtitle="给项目一个清晰标题，后续可以接入素材、模板和 AI 导演流程。">
          {status && (
            <div className="mb-5">
              <Pill tone={status.tone}>{status.text}</Pill>
            </div>
          )}
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
            <FieldLabel label="项目名称">
              <FieldShell>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createProject()}
                  placeholder="例如：未来科技产品宣传片"
                  className="w-full bg-transparent text-[14px] text-nc-text outline-none placeholder:text-nc-text-tertiary"
                  autoFocus
                />
              </FieldShell>
            </FieldLabel>
            <FieldLabel label="说明">
              <FieldShell>
                <input
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="目标平台、风格、交付要求..."
                  className="w-full bg-transparent text-[14px] text-nc-text outline-none placeholder:text-nc-text-tertiary"
                />
              </FieldShell>
            </FieldLabel>
            <div className="flex items-end gap-3">
              <Button variant="secondary" onClick={() => setShowCreate(false)}>取消</Button>
              <Button variant="primary" onClick={createProject} disabled={!newName.trim()}>创建</Button>
            </div>
          </div>
        </SectionCard>
      )}

      <SectionCard
        className="mt-6"
        title="项目列表"
        subtitle="缩略图、状态、最近更新和关键操作保持在同一卡片内，不再隐藏核心操作。"
        action={<StatusBadge tone={loading ? "info" : "neutral"}>{loading ? "同步中" : `${projects.length} 个项目`}</StatusBadge>}
        contentClassName="p-0"
      >
        {loading ? (
          <div className="grid gap-6 p-6 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-[292px] rounded-[18px] bg-[linear-gradient(90deg,#F3F5FA_0%,#FFFFFF_45%,#F3F5FA_100%)] bg-[length:200%_100%] animate-[shimmer_1.6s_linear_infinite]" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<FolderIcon />}
              title="还没有项目"
              description="创建第一个项目后，可以从 AI 导演、素材库和编辑器继续推进完整视频流程。"
              action={<Button variant="primary" onClick={() => setShowCreate(true)}><PlusIcon />新建项目</Button>}
            />
          </div>
        ) : (
          <div className="grid gap-6 p-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {projects.map((project, index) => (
              <Surface key={project.id} interactive className="group overflow-hidden p-4">
                <MediaThumb
                  tone={PROJECT_TONES[index % PROJECT_TONES.length]}
                  duration="草稿"
                  badge={<StatusBadge tone={index % 3 === 0 ? "success" : "accent"}>{index % 3 === 0 ? "已同步" : "制作中"}</StatusBadge>}
                />
                <div className="flex flex-col gap-4 px-1 pt-5">
                  <div className="min-w-0">
                    <h3 className="truncate text-[18px] font-semibold leading-7 text-nc-text">{project.name}</h3>
                    <p className="mt-2 line-clamp-2 min-h-[44px] text-[14px] leading-[22px] text-nc-text-secondary">
                      {project.description || "暂无项目说明。建议补充目标平台、风格和交付规格，方便团队协作。"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone="neutral">更新 {formatDate(project.updated_at)}</Pill>
                    <Pill tone="info">ID {project.id.slice(0, 8)}</Pill>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-nc-border pt-4">
                    <Button size="sm" variant="primary" onClick={() => setSidebarPage("edit")}>
                      <PlayIcon />
                      继续编辑
                    </Button>
                    <Button size="icon" variant="ghost" aria-label={`删除 ${project.name}`} onClick={() => deleteProject(project.id)}>
                      <TrashIcon />
                    </Button>
                  </div>
                </div>
              </Surface>
            ))}
          </div>
        )}
      </SectionCard>
    </PageShell>
  );
});

function PlusIcon() {
  return <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 4v12M4 10h12" /></svg>;
}

function RefreshIcon() {
  return <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16.3 7A6.5 6.5 0 1 0 17 10" /><path d="M16.5 3.5V7h-3.5" /></svg>;
}

function FolderIcon() {
  return <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H8l2 2h4.5A2.5 2.5 0 0 1 17 8.5v5A2.5 2.5 0 0 1 14.5 16h-9A2.5 2.5 0 0 1 3 13.5v-7Z" /></svg>;
}

function PulseIcon() {
  return <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10h3l2-5 4 10 2-5h3" /></svg>;
}

function PlayIcon() {
  return <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path d="M7 5.5v9l7-4.5-7-4.5Z" /></svg>;
}

function TrashIcon() {
  return <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h12M8 6V4.5A1.5 1.5 0 0 1 9.5 3h1A1.5 1.5 0 0 1 12 4.5V6M6 6l.7 10h6.6L14 6M9 9v4M11 9v4" /></svg>;
}
