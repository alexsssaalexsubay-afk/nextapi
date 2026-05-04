import { useEffect, useState } from "react";

interface UpdateInfo {
  available: boolean;
  version: string;
  notes: string;
}

export function useUpdater() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const checkUpdate = async () => {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const result = await check();
        if (result) {
          setUpdate({
            available: true,
            version: result.version,
            notes: result.body ?? "",
          });
        }
      } catch {
        // Not in Tauri context or updater not configured
      }
    };
    checkUpdate();
    const interval = setInterval(checkUpdate, 3600_000);
    return () => clearInterval(interval);
  }, []);

  const installUpdate = async () => {
    if (!update?.available) return;
    setInstalling(true);
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const { relaunch } = await import("@tauri-apps/plugin-process");
      const result = await check();
      if (result) {
        await result.downloadAndInstall();
        await relaunch();
      }
    } catch {
      setInstalling(false);
    }
  };

  return { update, installing, installUpdate };
}
