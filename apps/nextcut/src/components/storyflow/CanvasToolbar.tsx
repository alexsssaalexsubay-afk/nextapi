import { Copy, Crosshair, Maximize2, MousePointer2, PanelRightOpen, Play, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { Button, Pill } from "@/components/ui/kit";

export function CanvasToolbar({
  selectedCount,
  onAutoLayout,
  onFit,
  onToggleInspector,
  onOpenLibrary,
  onRunSelected,
  onDuplicate,
  onDelete,
}: {
  selectedCount: number;
  onAutoLayout: () => void;
  onFit: () => void;
  onToggleInspector: () => void;
  onOpenLibrary: () => void;
  onRunSelected: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="pointer-events-auto flex items-center gap-2 rounded-[18px] border border-nc-border bg-white/90 p-2 shadow-[0_14px_38px_rgba(15,23,42,0.10)] backdrop-blur">
      <Pill tone={selectedCount > 1 ? "accent" : "neutral"} className="hidden md:inline-flex">
        <MousePointer2 className="mr-1 h-3.5 w-3.5" />
        {selectedCount > 1 ? `${selectedCount} 已多选` : "单选"}
      </Pill>
      <Button size="sm" variant="secondary" onClick={onAutoLayout}>
        <RotateCcw className="h-4 w-4" />
        自动布局
      </Button>
      <Button size="sm" variant="secondary" onClick={onFit}>
        <Crosshair className="h-4 w-4" />
        适配
      </Button>
      <Button size="sm" variant="secondary" onClick={onToggleInspector}>
        <PanelRightOpen className="h-4 w-4" />
        检查器
      </Button>
      <Button size="sm" variant="primary" onClick={onRunSelected}>
        <Play className="h-4 w-4 fill-current" />
        运行
      </Button>
      <div className="h-7 w-px bg-nc-border" />
      <Button size="icon" variant="ghost" className="h-9 w-9" title="搜索节点" aria-label="搜索节点">
        <Search className="h-4 w-4" />
      </Button>
      <Button size="icon" variant="ghost" className="h-9 w-9" title="节点库" aria-label="节点库" onClick={onOpenLibrary}>
        <Plus className="h-4 w-4" />
      </Button>
      <Button size="icon" variant="ghost" className="h-9 w-9" title="复制节点" aria-label="复制节点" onClick={onDuplicate}>
        <Copy className="h-4 w-4" />
      </Button>
      <Button size="icon" variant="danger" className="h-9 w-9" title="删除节点" aria-label="删除节点" onClick={onDelete}>
        <Trash2 className="h-4 w-4" />
      </Button>
      <Button size="icon" variant="ghost" className="h-9 w-9" title="全屏画布" aria-label="全屏画布">
        <Maximize2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
