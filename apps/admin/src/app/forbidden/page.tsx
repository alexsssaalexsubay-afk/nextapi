import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-8 text-zinc-100">
      <div className="max-w-md text-center">
        <p className="text-xs font-medium uppercase tracking-wider text-red-400">403</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Access denied</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Your account is not authorized to access the NextAPI admin panel. If you believe
          this is a mistake, ask an administrator to add your email to the allowlist.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex items-center rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
        >
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
