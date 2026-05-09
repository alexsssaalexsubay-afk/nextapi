export async function openExternalUrl(url: string) {
  const target = url.trim();
  if (!target) return;

  try {
    const { open } = await import("@tauri-apps/plugin-shell");
    await open(target);
    return;
  } catch {
    globalThis.open?.(target, "_blank", "noopener,noreferrer");
  }
}
