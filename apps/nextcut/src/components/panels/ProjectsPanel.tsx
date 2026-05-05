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
      <div className="flex h-11 items-center justify-between border-b border-nc-border px-5 shadow-sm">
        <span className="text-xs font-medium uppercase tracking-[0.12em] text-nc-text-secondary">
          Projects
        </span>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex h-10 items-center gap-1.5 rounded-lg border border-nc-accent/25 bg-nc-accent/10 px-3 py-2 text-xs font-semibold text-nc-accent shadow-sm transition-all hover:bg-nc-accent/20 hover:shadow-md"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M5 1v8M1 5h8" />
          </svg>
          New
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="border-b border-nc-border bg-nc-surface p-4 shadow-sm">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Project name"
            className="mb-2 w-full rounded-lg border border-nc-border-strong bg-nc-panel px-3 py-2.5 text-sm text-nc-text shadow-sm outline-none placeholder:text-nc-text-tertiary focus:border-nc-accent/50"
            onKeyDown={(e) => e.key === "Enter" && createProject()}
            autoFocus
          />
          <input
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Description (optional)"
            className="mb-3 w-full rounded-lg border border-nc-border-strong bg-nc-panel px-3 py-2.5 text-sm text-nc-text shadow-sm outline-none placeholder:text-nc-text-tertiary focus:border-nc-accent/50"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowCreate(false)}
              className="rounded-lg px-4 py-2 text-sm text-nc-text-tertiary transition-colors hover:text-nc-text-secondary"
            >
              Cancel
            </button>
            <button
              onClick={createProject}
              disabled={!newName.trim()}
              className="rounded-lg bg-nc-accent px-4 py-2 text-sm font-semibold text-nc-bg shadow-md transition-all hover:bg-nc-accent-hover hover:shadow-lg disabled:opacity-40"
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
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="mb-3 text-nc-text-tertiary/25">
              <rect x="4" y="6" width="24" height="20" rx="2" stroke="currentColor" strokeWidth="1.2" />
              <path d="M4 12h24" stroke="currentColor" strokeWidth="1" />
              <rect x="8" y="8" width="6" height="3" rx="1" stroke="currentColor" strokeWidth="1" />
            </svg>
            <span className="text-sm text-nc-text-tertiary">No projects yet</span>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-2 text-sm font-medium text-nc-accent transition-all hover:underline"
            >
              Create your first project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <div
                key={p.id}
                className="group flex flex-col rounded-[var(--radius-lg)] border border-nc-border-strong bg-nc-surface p-4 shadow-sm transition-all duration-200 hover:border-nc-accent/25 hover:shadow-lg"
              >
                <div className="mb-1 flex items-start justify-between">
                  <h3 className="text-sm font-medium text-nc-text">{p.name}</h3>
                  <button
                    onClick={() => deleteProject(p.id)}
                    className="rounded-lg p-2 text-nc-text-tertiary opacity-0 transition-all hover:bg-nc-error/10 hover:text-nc-error group-hover:opacity-100"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
                      <path d="M2 2l6 6M8 2l-6 6" />
                    </svg>
                  </button>
                </div>
                {p.description && (
                  <p className="mb-2 line-clamp-2 text-sm text-nc-text-tertiary">{p.description}</p>
                )}
                <div className="mt-auto flex items-center gap-3 border-t border-nc-border pt-3 text-xs text-nc-text-tertiary">
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
