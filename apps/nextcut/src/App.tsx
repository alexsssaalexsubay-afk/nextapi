import { AppShell } from "@/components/shell/AppShell";
import { SetupWizard } from "@/components/onboarding/SetupWizard";
import { useSetupStore } from "@/stores/setup-store";

export function App() {
  const setupComplete = useSetupStore((s) => s.setupComplete);

  if (!setupComplete) {
    return <SetupWizard />;
  }

  return <AppShell />;
}
