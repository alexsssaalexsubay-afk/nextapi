import { Maximize2, Minus, X } from "lucide-react";

async function withCurrentWindow(action: "close" | "minimize" | "toggleMaximize") {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    if (action === "close") await win.close();
    if (action === "minimize") await win.minimize();
    if (action === "toggleMaximize") await win.toggleMaximize();
  } catch {
    // Browser preview keeps the titlebar visual, but window controls are Tauri-only.
  }
}

export function WindowTitleBar() {
  return (
    <div
      data-tauri-drag-region
      className="flex h-9 shrink-0 items-center justify-between border-b border-nc-border bg-white/95 px-4 backdrop-blur"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void withCurrentWindow("close")}
          className="group flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#FF5F57] text-[#7A1C18]"
          aria-label="关闭窗口"
          title="关闭"
        >
          <X className="hidden h-2.5 w-2.5 group-hover:block" strokeWidth={3} />
        </button>
        <button
          type="button"
          onClick={() => void withCurrentWindow("minimize")}
          className="group flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#FFBD2E] text-[#6F4A00]"
          aria-label="最小化窗口"
          title="最小化"
        >
          <Minus className="hidden h-2.5 w-2.5 group-hover:block" strokeWidth={3} />
        </button>
        <button
          type="button"
          onClick={() => void withCurrentWindow("toggleMaximize")}
          className="group flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#28C840] text-[#145D23]"
          aria-label="最大化窗口"
          title="最大化"
        >
          <Maximize2 className="hidden h-2 w-2 group-hover:block" strokeWidth={3} />
        </button>
      </div>
      <div data-tauri-drag-region className="pointer-events-none text-[12px] font-semibold text-nc-text-tertiary">
        NextAPI Studio
      </div>
      <div className="w-[54px]" />
    </div>
  );
}
