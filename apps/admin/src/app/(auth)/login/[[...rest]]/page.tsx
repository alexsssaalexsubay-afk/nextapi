import { SignIn } from "@clerk/nextjs";

export default function Page() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-8 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-red-400">
            NextAPI · Admin
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-100">
            Sign in to continue
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Authorized operators only. All actions are audited.
          </p>
        </div>
        <SignIn
          appearance={{ variables: { colorPrimary: "#dc2626" } }}
          routing="path"
          path="/login"
          signUpUrl="/login"
        />
      </div>
    </main>
  );
}
