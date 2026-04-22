"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  Input,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  Button,
} from "@nextapi/ui";
import { apiFetch } from "@/lib/api";
import { TodoBanner } from "@/components/todo-banner";

type AdminUser = {
  id: string;
  email: string;
  org_id: string;
  created_at: string;
  balance: number;
  jobs_count: number;
};

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AdminUser | null>(null);

  useEffect(() => {
    apiFetch<{ users: AdminUser[] }>("/v1/internal/admin/users")
      .then((r) => setUsers(r.users))
      .catch((e: Error) => setError(e.message));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.email.toLowerCase().includes(q));
  }, [users, query]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="mt-1 text-sm text-zinc-400">
          All registered users across tenants. Click a row for details.
        </p>
      </div>

      {(users.length === 0 || error) && (
        <TodoBanner
          endpoint="GET /v1/internal/admin/users"
          note={error ?? "Renders empty until data is returned."}
        />
      )}

      <div className="max-w-sm">
        <Input
          placeholder="Search by email…"
          value={query}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
        />
      </div>

      <Table>
        <THead>
          <TR>
            <TH>Email</TH>
            <TH>Org</TH>
            <TH>Created</TH>
            <TH className="text-right">Balance</TH>
            <TH className="text-right">Jobs</TH>
          </TR>
        </THead>
        <TBody>
          {filtered.length === 0 ? (
            <TR>
              <TD colSpan={5} className="py-8 text-center text-zinc-500">
                No users to display.
              </TD>
            </TR>
          ) : (
            filtered.map((u) => (
              <TR key={u.id} className="cursor-pointer" onClick={() => setSelected(u)}>
                <TD className="font-medium">{u.email}</TD>
                <TD className="text-zinc-400">{u.org_id}</TD>
                <TD className="text-zinc-400">
                  {new Date(u.created_at).toLocaleDateString()}
                </TD>
                <TD className="text-right tabular-nums">{u.balance.toLocaleString()}</TD>
                <TD className="text-right tabular-nums">{u.jobs_count.toLocaleString()}</TD>
              </TR>
            ))
          )}
        </TBody>
      </Table>

      {selected && <UserDrawer user={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function UserDrawer({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/60" onClick={onClose} />
      <div className="w-full max-w-md overflow-y-auto border-l border-zinc-800 bg-zinc-950 p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-zinc-500">User</p>
            <h2 className="mt-1 text-lg font-semibold text-zinc-100">{user.email}</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
          <dt className="text-zinc-500">ID</dt>
          <dd className="text-zinc-200">{user.id}</dd>
          <dt className="text-zinc-500">Org</dt>
          <dd className="text-zinc-200">{user.org_id}</dd>
          <dt className="text-zinc-500">Created</dt>
          <dd className="text-zinc-200">{new Date(user.created_at).toLocaleString()}</dd>
          <dt className="text-zinc-500">Balance</dt>
          <dd className="text-zinc-200 tabular-nums">{user.balance.toLocaleString()}</dd>
          <dt className="text-zinc-500">Jobs</dt>
          <dd className="text-zinc-200 tabular-nums">{user.jobs_count.toLocaleString()}</dd>
        </dl>

        <div className="mt-8">
          <TodoBanner
            endpoint="GET /v1/internal/admin/users/:id"
            note="Detail drawer stub"
          />
        </div>
      </div>
    </div>
  );
}
