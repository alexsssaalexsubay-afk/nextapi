import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo, useState, useCallback } from "react";
import { useDirectorStore } from "@/stores/director-store";

const baseNodeStyle = {
  background: "#111118",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 10,
  color: "#a8a8b8",
  fontSize: 13,
  fontWeight: 500,
  padding: "10px 18px",
  fontFamily: "Inter, system-ui, sans-serif",
  boxShadow: "0 2px 8px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.04) inset",
};

const activeNodeStyle = {
  ...baseNodeStyle,
  border: "1px solid rgba(212,160,83,0.45)",
  color: "#e8b86a",
  boxShadow:
    "0 4px 14px rgba(212,160,83,0.18), 0 2px 6px rgba(0,0,0,0.35), 0 0 0 1px rgba(212,160,83,0.12) inset",
};

const doneNodeStyle = {
  ...baseNodeStyle,
  border: "1px solid rgba(62,207,142,0.42)",
  color: "#4ed69e",
  boxShadow:
    "0 3px 12px rgba(62,207,142,0.12), 0 2px 6px rgba(0,0,0,0.3), 0 0 0 1px rgba(62,207,142,0.08) inset",
};

const edgeColor = "rgba(255,255,255,0.12)";
const edgeActiveColor = "#d4a053";

const AGENT_PIPELINE = [
  { id: "screenwriter", label: "Screenwriter", x: 50, y: 80 },
  { id: "characters", label: "Characters", x: 250, y: 30 },
  { id: "storyboard", label: "Storyboard", x: 250, y: 130 },
  { id: "cinematographer", label: "Camera", x: 480, y: 30 },
  { id: "audio", label: "Audio", x: 480, y: 130 },
  { id: "editing", label: "Editing", x: 680, y: 30 },
  { id: "optimizer", label: "Optimizer", x: 680, y: 130 },
  { id: "output", label: "Output", x: 880, y: 80 },
];

const PIPELINE_EDGES: Edge[] = [
  { id: "e1", source: "screenwriter", target: "characters", animated: true, style: { stroke: edgeColor } },
  { id: "e2", source: "screenwriter", target: "storyboard", animated: true, style: { stroke: edgeColor } },
  { id: "e3", source: "characters", target: "cinematographer", style: { stroke: edgeColor } },
  { id: "e4", source: "storyboard", target: "cinematographer", style: { stroke: edgeColor } },
  { id: "e5", source: "storyboard", target: "audio", style: { stroke: edgeColor } },
  { id: "e6", source: "cinematographer", target: "editing", style: { stroke: edgeColor } },
  { id: "e7", source: "audio", target: "editing", style: { stroke: edgeColor } },
  { id: "e8", source: "editing", target: "optimizer", style: { stroke: edgeColor } },
  { id: "e9", source: "optimizer", target: "output", animated: true, style: { stroke: edgeActiveColor } },
];

const AGENT_MAP: Record<string, string> = {
  screenwriter: "screenwriter",
  character_extractor: "characters",
  storyboard_artist: "storyboard",
  cinematographer: "cinematographer",
  audio_director: "audio",
  editing_agent: "editing",
  prompt_optimizer: "optimizer",
  consistency_checker: "output",
};

export function NodeCanvas() {
  const { agentProgress, shots } = useDirectorStore();

  const nodes: Node[] = useMemo(() => {
    const agentNodes: Node[] = AGENT_PIPELINE.map((a) => {
      const match = agentProgress.find((p) => AGENT_MAP[p.agent] === a.id);
      let style = baseNodeStyle;
      if (match?.status === "complete") style = doneNodeStyle;
      else if (match?.status === "running" || match?.status === "progress") style = activeNodeStyle;

      return {
        id: a.id,
        type: "default",
        position: { x: a.x, y: a.y },
        data: { label: a.label },
        style,
      };
    });

    const shotNodes: Node[] = shots.map((s, i) => ({
      id: `shot_${s.id}`,
      type: "default",
      position: { x: 50 + i * 160, y: 250 },
      data: { label: `${s.id}\n${s.title}` },
      style: {
        ...baseNodeStyle,
        border: s.status === "completed"
          ? "1px solid rgba(62,207,142,0.4)"
          : "1px solid rgba(212,160,83,0.25)",
        fontSize: 12,
        width: 148,
      },
    }));

    return [...agentNodes, ...shotNodes];
  }, [agentProgress, shots]);

  const edges: Edge[] = useMemo(() => {
    const shotEdges: Edge[] = shots.map((s) => ({
      id: `e_output_${s.id}`,
      source: "output",
      target: `shot_${s.id}`,
      style: { stroke: edgeColor, strokeDasharray: "4 2" },
    }));
    return [...PIPELINE_EDGES, ...shotEdges];
  }, [shots]);

  const [nodesState, setNodesState] = useState<Node[]>(nodes);

  const onNodesChange = useCallback(
    (changes: Parameters<NonNullable<React.ComponentProps<typeof ReactFlow>["onNodesChange"]>>[0]) => {
      setNodesState((nds) => {
        const updated = [...nds];
        for (const change of changes) {
          if (change.type === "position" && change.position) {
            const idx = updated.findIndex((n) => n.id === change.id);
            if (idx !== -1) updated[idx] = { ...updated[idx], position: change.position };
          }
        }
        return updated;
      });
    },
    []
  );

  const displayNodes = nodesState.length > 0 && nodesState[0].id === nodes[0]?.id ? nodesState : nodes;

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={displayNodes}
        edges={edges}
        onNodesChange={onNodesChange}
        fitView
        proOptions={{ hideAttribution: true }}
        style={{ background: "#060609" }}
        className="[&_.react-flow__controls]:!rounded-[var(--radius-lg)] [&_.react-flow__controls]:!border [&_.react-flow__controls]:!border-white/10 [&_.react-flow__controls]:!shadow-lg"
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={0.5} color="rgba(255,255,255,0.04)" />
        <Controls
          style={{
            background: "#111118",
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 10,
            boxShadow: "0 4px 14px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.05) inset",
          }}
        />
      </ReactFlow>
    </div>
  );
}
