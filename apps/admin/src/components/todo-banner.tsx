export function TodoBanner({ endpoint, note }: { endpoint: string; note?: string }) {
  return (
    <div className="rounded-md border border-amber-900/60 bg-amber-950/30 p-4 text-sm text-amber-200">
      <p className="font-medium">TODO: backend endpoint not implemented</p>
      <p className="mt-1 text-amber-200/80">
        Wired to <code className="rounded bg-amber-950/60 px-1 py-0.5">{endpoint}</code>
        {note ? ` — ${note}` : ""}. UI will populate once the backend ships.
      </p>
    </div>
  );
}
