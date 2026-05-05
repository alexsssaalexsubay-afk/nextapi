import { memo, useState, useEffect, useCallback } from "react";
import { sidecarFetch } from "@/lib/sidecar";

interface Project {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export const ProjectsPanel = memo(function ProjectsPanel() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const loadProjects = useCallback(async () => {
    try {
      const res = await sidecarFetch<{ projects: Project[] }>("/projects/");
      setProjects(res.projects);
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const createProject = useCallback(async () => {
    if (!newName.trim()) return;
    try {
      await sidecarFetch("/projects/", {
        method: "POST",
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() }),
      });
      setNewName("");
      setNewDesc("");
      setShowCreate(false);
      loadProjects();
    } catch {
      // handled by toast
    }
  }, [newName, newDesc, loadProjects]);

  const deleteProject = useCallback(async (id: string) => {
    try {
      await sidecarFetch(`/projects/${id}`, { method: "DELETE" });
      loadProjects();
    } catch {
      // handled by toast
    }
  }, [loadProjects]);

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return iso;
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-nc-bg">
      {/* Header */}
      <div className="flex h-[72px] items-center justify-between px-8">
        <span className="text-[18px] font-semibold text-nc-text">
          Projects
        </span>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex h-[44px] items-center gap-2 rounded-[12px] bg-nc-accent px-6 text-[14px] font-semibold text-white transition-all hover:bg-nc-accent-hover hover:-translate-y-0.5 active:bg-[#4E42CC] shadow-sm"
        >
          <svg width="14" height="14" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 1v8M1 5h8" />
          </svg>
          New Project
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="border-b border-nc-border bg-nc-surface p-8 shadow-sm">
          <div className="max-w-xl mx-auto flex flex-col gap-4">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Project name"
              className="w-full rounded-[12px] border border-nc-border bg-nc-bg px-[14px] py-3 text-[14px] text-nc-text outline-none placeholder:text-nc-text-tertiary focus:border-nc-accent transition-colors shadow-sm"
              onKeyDown={(e) => e.key === "Enter" && createProject()}
              autoFocus
            />
            <input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Description (optional)"
              className="w-full rounded-[12px] border border-nc-border bg-nc-bg px-[14px] py-3 text-[14px] text-nc-text outline-none placeholder:text-nc-text-tertiary focus:border-nc-accent transition-colors shadow-sm"
            />
            <div className="flex justify-end gap-3 mt-2">
              <button
                onClick={() => setShowCreate(false)}
                className="flex h-[40px] items-center justify-center rounded-[12px] border border-nc-border px-5 text-[14px] font-medium text-nc-text-secondary transition-colors hover:text-nc-text hover:bg-nc-surface bg-white"
              >
                Cancel
              </button>
              <button
                onClick={createProject}
                disabled={!newName.trim()}
                className="flex h-[40px] items-center justify-center rounded-[12px] bg-nc-accent px-6 text-[14px] font-semibold text-white transition-colors hover:bg-nc-accent-hover disabled:bg-[#D9D6FE] disabled:cursor-not-allowed shadow-sm"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Project list */}
      <div className="flex-1 overflow-auto p-8 pt-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-nc-accent border-t-transparent" />
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-nc-surface border border-nc-border mb-4 text-nc-text-tertiary">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z" />
                <path d="m3 9 2.45-4.9A2 2 0 0 1 7.24 3h9.52a2 2 0 0 1 1.8 1.1L21 9" />
                <path d="M12 3v6" />
              </svg>
            </div>
            <span className="text-[16px] font-medium text-nc-text">No projects yet</span>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-2 text-[14px] text-nc-accent transition-colors hover:text-nc-accent-hover font-medium"
            >
              Create your first project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 max-w-7xl w-full">
            {projects.map((p) => (
              <div
                key={p.id}
                className="group flex flex-col h-40 rounded-[14px] border border-nc-border bg-nc-surface p-4 shadow-sm transition-all hover:border-nc-accent hover:shadow-md cursor-pointer"
              >
                <div className="mb-2 flex items-start justify-between">
                  <h3 className="text-[16px] font-semibold text-nc-text truncate pr-4">{p.name}</h3>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteProject(p.id); }}
                    className="rounded-[10px] p-1.5 text-nc-text-tertiary opacity-0 transition-all hover:bg-nc-surface hover:text-nc-error group-hover:opacity-100 border border-transparent hover:border-nc-border"
                  >
                    <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 3h8M4 3V2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1M5 5v4M7 5v4M3 3v7a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V3" />
                    </svg>
                  </button>
                </div>
                {p.description ? (
                  <p className="mb-4 line-clamp-2 text-[14px] leading-[22px] text-nc-text-secondary">{p.description}</p>
                ) : (
                  <p className="mb-4 text-[14px] italic text-nc-text-tertiary">No description</p>
                )}
                <div className="mt-auto flex items-center justify-between text-[12px] font-medium uppercase tracking-wider text-nc-text-tertiary">
                  <span>{formatDate(p.updated_at)}</span>
                  <span className="font-mono bg-nc-bg px-2 py-0.5 rounded-[10px] border border-nc-border text-[11px]">{p.id.slice(0, 8)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
