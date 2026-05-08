import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type EdgeTypes,
  type NodeTypes,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { StatusFlowEdge, type FlowEdgeStatus } from "./StatusFlowEdge";
import { StoryflowNodeCard } from "./StoryflowNodeCard";
import type { StoryflowNode, StoryflowNodeAction, StoryflowNodeData } from "./storyflow-types";

const nodeTypes = { storyflow: StoryflowNodeCard } satisfies NodeTypes;
const edgeTypes = { statusFlow: StatusFlowEdge } satisfies EdgeTypes;

function normalizeStatus(status?: string): FlowEdgeStatus {
  if (!status) return "idle";
  if (["失败", "failed", "error"].includes(status)) return "failed";
  if (["生成中", "排队中", "running", "progress", "generating", "processing", "queued"].includes(status)) return "running";
  if (["已生成", "完成", "complete", "succeeded"].includes(status)) return "complete";
  return "idle";
}

function graphOutputStatus(nodes: StoryflowNode[]): FlowEdgeStatus {
  const shotStatuses = nodes
    .filter((node) => node.data.kind === "shot")
    .map((node) => normalizeStatus(node.data.status));
  if (!shotStatuses.length) return "idle";
  if (shotStatuses.some((status) => status === "failed")) return "failed";
  if (shotStatuses.some((status) => status === "running")) return "running";
  if (shotStatuses.every((status) => status === "complete")) return "complete";
  return "idle";
}

function edgeRuntimeStatus(edge: Edge, nodes: StoryflowNode[], selectedNodeIds: string[]): FlowEdgeStatus {
  const active = selectedNodeIds.includes(edge.source) || selectedNodeIds.includes(edge.target);
  const source = nodes.find((node) => node.id === edge.source);
  const target = nodes.find((node) => node.id === edge.target);
  const sourceStatus = normalizeStatus(source?.data.status);
  const targetStatus = normalizeStatus(target?.data.status);
  const outputStatus = graphOutputStatus(nodes);

  if (sourceStatus === "failed" || targetStatus === "failed" || (target?.data.kind === "output" && outputStatus === "failed")) return "failed";
  if (sourceStatus === "running" || targetStatus === "running" || (target?.data.kind === "output" && outputStatus === "running")) return "running";
  if (active) return "selected";
  if (target?.data.kind === "shot") return targetStatus === "complete" ? "complete" : "idle";
  if (target?.data.kind === "output") return outputStatus;
  if (target?.data.kind === "review" || target?.data.kind === "version") return outputStatus === "complete" ? "complete" : "idle";
  if (target?.data.kind === "prompt" || target?.data.kind === "reference" || target?.data.kind === "camera" || target?.data.kind === "scene") {
    return nodes.some((node) => node.data.kind === "shot") ? "complete" : "idle";
  }
  return "idle";
}

function edgeStatusLabel(status: FlowEdgeStatus) {
  if (status === "running") return "运行中";
  if (status === "failed") return "阻断";
  return undefined;
}

function edgeColor(status: FlowEdgeStatus) {
  if (status === "failed") return "#EF4444";
  if (status === "running" || status === "selected") return "#6C4DFF";
  if (status === "complete") return "#22C55E";
  return "#B7C0D2";
}

function styleEdges(edges: Edge[], nodes: StoryflowNode[], selectedNodeIds: string[]) {
  return edges.map((edge) => {
    const active = selectedNodeIds.includes(edge.source) || selectedNodeIds.includes(edge.target);
    const status = edgeRuntimeStatus(edge, nodes, selectedNodeIds);
    const color = edgeColor(status);
    return {
      ...edge,
      type: "statusFlow",
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color,
        width: 18,
        height: 18,
      },
      data: {
        ...(typeof edge.data === "object" && edge.data ? edge.data : {}),
        status,
        label: edgeStatusLabel(status),
      },
      animated: status === "running" || active,
    } satisfies Edge;
  });
}

function enrichNodes({
  nodes,
  selectedNodeIds,
  onAction,
}: {
  nodes: StoryflowNode[];
  selectedNodeIds: string[];
  onAction: (action: StoryflowNodeAction, node: StoryflowNodeData) => void;
}): StoryflowNode[] {
  return nodes.map((node) => ({
    ...node,
    selected: selectedNodeIds.includes(node.id),
    data: {
      ...node.data,
      onAction,
    },
  }));
}

export function StoryflowCanvas({
  baseNodes,
  baseEdges,
  selectedNodeIds,
  focusNodeId,
  fitNonce,
  layoutNonce,
  initialZoom = 0.82,
  initialYOffset = 0,
  onReady,
  onSelectionChange,
  onInspectNode,
  onNodeAction,
}: {
  baseNodes: StoryflowNode[];
  baseEdges: Edge[];
  selectedNodeIds: string[];
  focusNodeId: string | null;
  fitNonce: number;
  layoutNonce: number;
  initialZoom?: number;
  initialYOffset?: number;
  onReady: (instance: ReactFlowInstance<StoryflowNode, Edge>) => void;
  onSelectionChange: (nodeIds: string[]) => void;
  onInspectNode: (node: StoryflowNodeData) => void;
  onNodeAction: (action: StoryflowNodeAction, node: StoryflowNodeData) => void;
}) {
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<StoryflowNode, Edge> | null>(null);
  const initialNodes = useMemo(
    () => enrichNodes({ nodes: baseNodes, selectedNodeIds, onAction: onNodeAction }),
    [baseNodes, onNodeAction, selectedNodeIds]
  );
  const initialEdges = useMemo(() => styleEdges(baseEdges, baseNodes, selectedNodeIds), [baseEdges, baseNodes, selectedNodeIds]);
  const [nodes, setNodes, onNodesChange] = useNodesState<StoryflowNode>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges);

  useEffect(() => {
    setNodes((current) => {
      const enriched = enrichNodes({ nodes: baseNodes, selectedNodeIds, onAction: onNodeAction });
      return enriched.map((nextNode) => {
        const existing = current.find((node) => node.id === nextNode.id);
        return existing ? { ...nextNode, position: existing.position } : nextNode;
      });
    });
  }, [baseNodes, onNodeAction, selectedNodeIds, setNodes]);

  useEffect(() => {
    setEdges(styleEdges(baseEdges, baseNodes, selectedNodeIds));
  }, [baseEdges, baseNodes, selectedNodeIds, setEdges]);

  useEffect(() => {
    if (!flowInstance || fitNonce === 0) return;
    flowInstance.fitView({ padding: 0.08, duration: 320 });
  }, [fitNonce, flowInstance]);

  useEffect(() => {
    if (layoutNonce === 0) return;
    setNodes(enrichNodes({ nodes: baseNodes, selectedNodeIds, onAction: onNodeAction }));
    requestAnimationFrame(() => flowInstance?.fitView({ padding: 0.08, duration: 360 }));
  }, [baseNodes, flowInstance, layoutNonce, onNodeAction, selectedNodeIds, setNodes]);

  useEffect(() => {
    if (!flowInstance || !focusNodeId) return;
    const node = nodes.find((item) => item.id === focusNodeId);
    if (!node) return;
    const width = typeof node.width === "number" ? node.width : 280;
    const height = typeof node.height === "number" ? node.height : 180;
    flowInstance.setCenter(node.position.x + width / 2, node.position.y + height / 2, {
      zoom: 1.05,
      duration: 320,
    });
  }, [flowInstance, focusNodeId, nodes]);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((items) =>
        addEdge(
          {
            ...connection,
            type: "statusFlow",
            animated: true,
            markerEnd: { type: MarkerType.ArrowClosed, color: "#6C4DFF", width: 18, height: 18 },
            data: { status: "running", label: "新连接" },
          },
          items
        )
      );
    },
    [setEdges]
  );

  const handleInit = useCallback((instance: ReactFlowInstance<StoryflowNode, Edge>) => {
    setFlowInstance(instance);
    onReady(instance);
    requestAnimationFrame(() => {
      const firstShotId = baseNodes.find((node) => node.data.kind === "shot")?.id;
      const targetId = selectedNodeIds[0] || firstShotId || "intent";
      const target = baseNodes.find((node) => node.id === targetId);
      if (!target) {
        instance.setViewport({ x: 240, y: 120, zoom: initialZoom });
        return;
      }
      const width = typeof target.width === "number" ? target.width : 280;
      const height = typeof target.height === "number" ? target.height : 180;
      instance.setCenter(target.position.x + width / 2, target.position.y + height / 2 + initialYOffset, {
        zoom: initialZoom,
      });
    });
  }, [baseNodes, initialYOffset, initialZoom, onReady, selectedNodeIds]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-[24px] border border-nc-border bg-white shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={handleInit}
        onNodeClick={(_event, node: StoryflowNode) => {
          onSelectionChange([node.id]);
          if (node.data.kind === "shot" && node.data.shotId) return;
          onInspectNode(node.data);
        }}
        onNodeDoubleClick={(_event, node: StoryflowNode) => onInspectNode(node.data)}
        onPaneClick={() => onSelectionChange([])}
        onSelectionChange={({ nodes: selectedNodes }) => {
          if (selectedNodes.length > 0) onSelectionChange(selectedNodes.map((node) => node.id));
        }}
        minZoom={0.32}
        maxZoom={1.55}
        selectionOnDrag
        multiSelectionKeyCode={["Meta", "Control", "Shift"]}
        panOnScroll
        zoomOnScroll
        connectionLineType={ConnectionLineType.SmoothStep}
        proOptions={{ hideAttribution: true }}
        className="storyflow-react-flow bg-[radial-gradient(circle_at_1px_1px,rgba(102,112,133,0.18)_1px,transparent_0)] [background-size:24px_24px]"
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} color="#D8DDEA" />
        <Controls position="bottom-left" showInteractive={false} className="!rounded-[16px] !border !border-nc-border !bg-white/92 !shadow-[0_12px_34px_rgba(15,23,42,0.12)]" />
        <MiniMap
          position="bottom-right"
          pannable
          zoomable
          nodeColor={(node) => (selectedNodeIds.includes(node.id) ? "#6C4DFF" : "#CBD5E1")}
          maskColor="rgba(247,248,252,0.70)"
          className="!h-[118px] !w-[190px] !rounded-[18px] !border !border-nc-border !bg-white/90 !shadow-[0_12px_34px_rgba(15,23,42,0.10)]"
        />
      </ReactFlow>
    </div>
  );
}
