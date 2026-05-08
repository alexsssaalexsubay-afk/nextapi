import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

export type FlowEdgeStatus = "idle" | "running" | "complete" | "failed" | "selected";

export interface FlowEdgeData extends Record<string, unknown> {
  status?: FlowEdgeStatus;
  label?: string;
}

const colorByStatus: Record<FlowEdgeStatus, { base: string; stream: string }> = {
  idle: { base: "#B7C0D2", stream: "#B7C0D2" },
  running: { base: "#6C4DFF", stream: "#00D4E0" },
  complete: { base: "#22C55E", stream: "#86EFAC" },
  failed: { base: "#EF4444", stream: "#FCA5A5" },
  selected: { base: "#6C4DFF", stream: "#00D4E0" },
};

export function StatusFlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
  selected,
}: EdgeProps) {
  const edgeData = data as FlowEdgeData | undefined;
  const status = edgeData?.status || (selected ? "selected" : "idle");
  const color = colorByStatus[status];
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 22,
  });
  const showLabel = Boolean(edgeData?.label) || status === "running" || status === "failed";

  return (
    <>
      <g
        className={cn("nc-status-flow-edge", `is-${status}`, selected && "is-selected")}
        style={{
          "--nc-flow-edge": color.base,
          "--nc-flow-edge-stream": color.stream,
        } as CSSProperties}
      >
        <BaseEdge
          id={id}
          path={edgePath}
          markerEnd={markerEnd}
          className="nc-status-flow-edge__base"
        />
        <path d={edgePath} className="nc-status-flow-edge__stream" />
      </g>
      {showLabel && (
        <EdgeLabelRenderer>
          <div
            className={cn("nc-status-flow-edge__label", `is-${status}`)}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }}
          >
            {edgeData?.label || (status === "failed" ? "阻断" : "运行中")}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
