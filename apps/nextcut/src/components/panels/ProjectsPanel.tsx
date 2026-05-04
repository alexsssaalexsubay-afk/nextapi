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
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex h-10 items-center justify-between border-b border-nc-border px-5">
        <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-nc-text-tertiary">
          Projects
        </span>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1.5 rounded bg-nc-accent/10 px-2.5 py-1 text-[10px] text-nc-accent hover:bg-nc-accent/20"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M5 1v8M1 5h8" />
          </svg>
          New
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="border-b border-nc-border bg-nc-surface p-4">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Project name"
            className="mb-2 w-full rounded border border-nc-border bg-nc-panel px-3 py-1.5 text-[11px] text-nc-text outline-none placeholder:text-nc-text-ghost focus:border-nc-accent/40"
            onKeyDown={(e) => e.key === "Enter" && createProject()}
            autoFocus
          />
          <input
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Description (optional)"
            className="mb-3 w-full rounded border border-nc-border bg-nc-panel px-3 py-1.5 text-[11px] text-nc-text outline-none placeholder:text-nc-text-ghost focus:border-nc-accent/40"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowCreate(false)}
              className="px-3 py-1 text-[10px] text-nc-text-ghost hover:text-nc-text-tertiary"
            >
              Cancel
            </button>
            <button
              onClick={createProject}
              disabled={!newName.trim()}
              className="rounded bg-nc-accent px-3 py-1 text-[10px] font-medium text-nc-bg hover:bg-nc-accent-hover disabled:opacity-40"
            >
              Create
            </button>
          </div>
        </div>
      )}

      {/* Project list */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-nc-accent border-t-transparent" />
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="mb-3 text-nc-text-ghost/20">
              <rect x="4" y="6" width="24" height="20" rx="2" stroke="currentColor" strokeWidth="1.2" />
              <path d="M4 12h24" stroke="currentColor" strokeWidth="1" />
              <rect x="8" y="8" width="6" height="3" rx="1" stroke="currentColor" strokeWidth="1" />
            </svg>
            <span className="text-[11px] text-nc-text-ghost">No projects yet</span>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-2 text-[10px] text-nc-accent hover:text-nc-accent-hover"
            >
              Create your first project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <div
                key={p.id}
                className="group flex flex-col rounded-[var(--radius-lg)] border border-nc-border bg-nc-surface p-4 transition-all duration-200 hover:border-nc-border-strong hover:shadow-md hover:shadow-black/10"
              >
                <div className="mb-1 flex items-start justify-between">
                  <h3 className="text-[12px] font-medium text-nc-text">{p.name}</h3>
                  <button
                    onClick={() => deleteProject(p.id)}
                    className="rounded p-1 text-nc-text-ghost opacity-0 transition-opacity hover:bg-nc-error/10 hover:text-nc-error group-hover:opacity-100"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
                      <path d="M2 2l6 6M8 2l-6 6" />
                    </svg>
                  </button>
                </div>
                {p.description && (
                  <p className="mb-2 line-clamp-2 text-[10px] text-nc-text-ghost">{p.description}</p>
                )}
                <div className="mt-auto flex items-center gap-3 border-t border-nc-border pt-2.5 text-[9px] text-nc-text-ghost">
                  <span>{formatDate(p.updated_at)}</span>
                  <span className="ml-auto font-mono">{p.id.slice(0, 8)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
