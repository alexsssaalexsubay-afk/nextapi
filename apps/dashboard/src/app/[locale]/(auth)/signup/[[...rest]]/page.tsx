import { SignUp } from "@clerk/nextjs";

export default function SignupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <SignUp />
    </main>
  );
}
