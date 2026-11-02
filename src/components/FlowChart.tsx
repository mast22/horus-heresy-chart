import {
  Background,
  BaseEdge,
  Controls,
  type Edge,
  type EdgeProps,
  Handle,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useStoreApi,
  ViewportPortal,
} from "@xyflow/react";
import {
  type CSSProperties,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import "@xyflow/react/dist/style.css";

import { shortcutAnchors } from "../flow/anchors";
import {
  chartRoutes,
  primaryBridgeGaps,
  splitAtBridges,
} from "../flow/bridges";
import {
  buildChartGraph,
  CHART_EXTENT,
  type ChartWork,
  type Connection,
  ERA_DIVIDER,
  SIEGE_OF_TERRA_BACKDROP,
} from "../flow/chart";
import { nextWorkIds } from "../flow/navigation";
import { CONNECTION_ORDER, computePorts, type PortSlot } from "../flow/ports";
import { detailPublication } from "../flow/publication";
import { type Point, routeWorkEdge } from "../flow/routing";
import { SearchBox } from "./SearchBox";
import { displayTitle, WorkFace } from "./WorkFace";

export { displayTitle } from "./WorkFace";

import { selectionFor } from "../flow/selection";
import type { Theme } from "../site/theme";
import {
  chartControlConfig,
  closedSidebar,
  closeLegend,
  initialLegend,
  markOpeningSeen,
  OPENING_FRAME_RESERVE,
  openingBoxes,
  openingViewport,
  openLegend,
  readOpeningSeen,
  SIDEBAR_WIDTH_FRACTION,
  toggleWorkSidebar,
} from "../site/ui-state";

type FrameRequest = {
  mode: "pending" | "opening" | "poster";
  token: number;
  animate: boolean;
};

const openingFrameBoxes = openingBoxes(buildChartGraph().works);

function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

type Port = {
  id: string;
  top: string;
};

type WorkData = {
  title: string;
  publication: string;
  kind: ChartWork["kind"];
  color: readonly string[];
  text: string;
  ribbon: boolean;
  sourcePorts: Port[];
  targetPorts: Port[];
};

type ZonePart = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type ZoneGap = {
  x: number;
  y: number;
};

type ZoneData = {
  parts: readonly ZonePart[];
  gaps: readonly ZoneGap[];
};

type ZoneLabelData = {
  label: string;
};

type BoundarySegment = {
  a: [number, number];
  b: [number, number];
};

const ZONE_STROKE = 8;
const ZONE_BRIDGE_GAP = 32;

function sidePorts(
  prefix: "source" | "target",
  slots: readonly PortSlot[],
): Port[] {
  return slots.map((slot) => ({
    id: `${prefix}-${slot.connection}`,
    top: `${slot.fraction * 100}%`,
  }));
}

function WorkNode({ data }: NodeProps<Node<WorkData, "work">>) {
  return (
    <WorkFace data={data}>
      {data.targetPorts.map((port) => (
        <Handle
          key={port.id}
          id={port.id}
          type="target"
          position={Position.Left}
          style={{ top: port.top }}
        />
      ))}
      {data.sourcePorts.map((port) => (
        <Handle
          key={port.id}
          id={port.id}
          type="source"
          position={Position.Right}
          style={{ top: port.top }}
        />
      ))}
    </WorkFace>
  );
}

/** Outer boundary of a union of axis-aligned rectangles. */
function zoneBoundary(parts: readonly ZonePart[]): BoundarySegment[] {
  const xs = [...new Set(parts.flatMap((p) => [p.x, p.x + p.w]))].sort(
    (a, b) => a - b,
  );
  const ys = [...new Set(parts.flatMap((p) => [p.y, p.y + p.h]))].sort(
    (a, b) => a - b,
  );
  const covered = (x: number, y: number) =>
    parts.some((p) => p.x < x && p.x + p.w > x && p.y < y && p.y + p.h > y);

  const segments: BoundarySegment[] = [];
  for (let xi = 0; xi < xs.length - 1; xi += 1) {
    for (let yi = 0; yi < ys.length - 1; yi += 1) {
      const cx = (xs[xi] + xs[xi + 1]) / 2;
      const cy = (ys[yi] + ys[yi + 1]) / 2;
      if (!covered(cx, cy)) {
        continue;
      }
      if (!covered(cx, ys[yi])) {
        segments.push({
          a: [xs[xi], ys[yi]],
          b: [xs[xi + 1], ys[yi]],
        });
      }
      if (!covered(cx, ys[yi + 1])) {
        segments.push({
          a: [xs[xi], ys[yi + 1]],
          b: [xs[xi + 1], ys[yi + 1]],
        });
      }
      if (!covered(xs[xi], cy)) {
        segments.push({
          a: [xs[xi], ys[yi]],
          b: [xs[xi], ys[yi + 1]],
        });
      }
      if (!covered(xs[xi + 1], cy)) {
        segments.push({
          a: [xs[xi + 1], ys[yi]],
          b: [xs[xi + 1], ys[yi + 1]],
        });
      }
    }
  }
  return segments;
}

function zoneOutlinePath(
  parts: readonly ZonePart[],
  segments = zoneBoundary(parts),
): string {
  const key = ([x, y]: [number, number]) => `${x},${y}`;
  const at = new Map<string, BoundarySegment[]>();
  for (const segment of segments) {
    for (const point of [segment.a, segment.b]) {
      const bucket = at.get(key(point)) ?? [];
      bucket.push(segment);
      at.set(key(point), bucket);
    }
  }

  const used = new Set<BoundarySegment>();
  const paths: string[] = [];
  for (const first of segments) {
    if (used.has(first)) {
      continue;
    }
    used.add(first);
    let end = first.b;
    const points = [first.a, first.b];
    while (key(end) !== key(first.a)) {
      const next = (at.get(key(end)) ?? []).find(
        (segment) => !used.has(segment),
      );
      if (!next) {
        break;
      }
      used.add(next);
      end = key(next.a) === key(end) ? next.b : next.a;
      points.push(end);
    }
    paths.push(`M ${points.map(([x, y]) => `${x} ${y}`).join(" L ")} Z`);
  }
  return paths.join(" ");
}

/** Crossing between one boundary edge and one routed edge segment. */
function segmentCrossing(
  a1: [number, number],
  a2: [number, number],
  b1: [number, number],
  b2: [number, number],
): ZoneGap | null {
  const aVertical = a1[0] === a2[0];
  const bVertical = b1[0] === b2[0];
  if (aVertical === bVertical) {
    return null;
  }
  const [verticalA, verticalB, horizontalA, horizontalB] = aVertical
    ? [a1, a2, b1, b2]
    : [b1, b2, a1, a2];
  const x = verticalA[0];
  const y = horizontalA[1];
  const withinVertical =
    y >= Math.min(verticalA[1], verticalB[1]) &&
    y <= Math.max(verticalA[1], verticalB[1]);
  const withinHorizontal =
    x >= Math.min(horizontalA[0], horizontalB[0]) &&
    x <= Math.max(horizontalA[0], horizontalB[0]);
  return withinVertical && withinHorizontal ? { x, y } : null;
}

/** Primary connections cut square bridges through a storyline border. */
function zoneCrossings(
  parts: readonly ZonePart[],
  routes: readonly (readonly Point[])[],
): ZoneGap[] {
  const segments = zoneBoundary(parts);
  const gaps: ZoneGap[] = [];
  const seen = new Set<string>();
  for (const route of routes) {
    for (let index = 0; index < route.length - 1; index += 1) {
      const from = route[index];
      const to = route[index + 1];
      for (const segment of segments) {
        const gap = segmentCrossing(
          segment.a,
          segment.b,
          [from.x, from.y],
          [to.x, to.y],
        );
        if (!gap) {
          continue;
        }
        const id = `${Math.round(gap.x)},${Math.round(gap.y)}`;
        if (seen.has(id)) {
          continue;
        }
        seen.add(id);
        gaps.push(gap);
      }
    }
  }
  return gaps;
}

function ZoneNode({ data }: NodeProps<Node<ZoneData, "zone">>) {
  const maskId = `zone-mask-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const width = Math.max(...data.parts.map((p) => p.x + p.w));
  const height = Math.max(...data.parts.map((p) => p.y + p.h));
  const outline = zoneOutlinePath(data.parts);
  const single = data.parts.length === 1;

  return (
    <div className="zone-shape">
      <svg
        aria-hidden="true"
        className="zone-outline"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
      >
        <defs>
          <mask
            id={maskId}
            maskUnits="userSpaceOnUse"
            x={0}
            y={0}
            width={width}
            height={height}
          >
            <rect width={width} height={height} fill="white" />
            {data.gaps.map((gap) => (
              <rect
                key={`${gap.x},${gap.y}`}
                x={gap.x - ZONE_BRIDGE_GAP / 2}
                y={gap.y - ZONE_BRIDGE_GAP / 2}
                width={ZONE_BRIDGE_GAP}
                height={ZONE_BRIDGE_GAP}
                fill="black"
              />
            ))}
          </mask>
        </defs>
        {single ? (
          <>
            <rect
              x={0}
              y={0}
              width={width}
              height={height}
              rx={28}
              fill="var(--zone-fill)"
            />
            <rect
              x={0}
              y={0}
              width={width}
              height={height}
              rx={28}
              fill="none"
              stroke="var(--zone-border)"
              strokeWidth={ZONE_STROKE}
              mask={`url(#${maskId})`}
            />
          </>
        ) : (
          <>
            <path d={outline} fill="var(--zone-fill)" />
            <path
              d={outline}
              fill="none"
              stroke="var(--zone-border)"
              strokeLinejoin="round"
              strokeWidth={ZONE_STROKE}
              mask={`url(#${maskId})`}
            />
          </>
        )}
      </svg>
    </div>
  );
}

function ZoneLabelNode({ data }: NodeProps<Node<ZoneLabelData, "zone-label">>) {
  return <span className="zone-label">{data.label}</span>;
}

function EraDividerNode() {
  return <div className="era-divider" />;
}

function SiegeBackdropNode() {
  return <div className="siege-backdrop" />;
}

const nodeTypes = {
  work: WorkNode,
  zone: ZoneNode,
  "zone-label": ZoneLabelNode,
  "era-divider": EraDividerNode,
  "era-backdrop": SiegeBackdropNode,
};

const STROKE: Record<Connection, string> = {
  primary: "var(--conn-primary)",
  secondary: "var(--conn-secondary)",
  tertiary: "var(--conn-tertiary)",
};

const EDGE_STYLE: Record<
  Connection,
  {
    strokeWidth: number;
    strokeDasharray?: string;
    strokeDashoffset?: number;
  }
> = {
  primary: { strokeWidth: 10 },
  secondary: { strokeWidth: 5, strokeDasharray: "12 10" },
  tertiary: {
    strokeWidth: 4,
    strokeDasharray: "4 18",
    strokeDashoffset: 7,
  },
};

const ARROW_LENGTH = 22;
const ARROW_WIDTH = 26;
const DIAMOND_LENGTH = 28;
const DIAMOND_WIDTH = 20;
const SEMICIRCLE_RADIUS = 11;
/** Rounded bend so a turning arrow reads as a turn, not a crossing. */
const BEND_RADIUS = 16;

type TippedEdgeData = {
  connection: Connection;
};

const OUTWARD: Record<Position, { x: number; y: number }> = {
  [Position.Left]: { x: -1, y: 0 },
  [Position.Right]: { x: 1, y: 0 },
  [Position.Top]: { x: 0, y: -1 },
  [Position.Bottom]: { x: 0, y: 1 },
};

const ACROSS: Record<Position, { x: number; y: number }> = {
  [Position.Left]: { x: 0, y: -1 },
  [Position.Right]: { x: 0, y: 1 },
  [Position.Top]: { x: 1, y: 0 },
  [Position.Bottom]: { x: -1, y: 0 },
};

function place(
  x: number,
  y: number,
  position: Position,
  outward: number,
  across: number,
): { x: number; y: number } {
  const away = OUTWARD[position];
  const side = ACROSS[position];
  return {
    x: x + away.x * outward + side.x * across,
    y: y + away.y * outward + side.y * across,
  };
}

function arrowPath(x: number, y: number, position: Position): string {
  const left = place(x, y, position, ARROW_LENGTH, ARROW_WIDTH / 2);
  const right = place(x, y, position, ARROW_LENGTH, -ARROW_WIDTH / 2);
  return `M ${x} ${y} L ${left.x} ${left.y} L ${right.x} ${right.y} Z`;
}

function diamondPath(x: number, y: number, position: Position): string {
  const sideA = place(x, y, position, DIAMOND_LENGTH / 2, DIAMOND_WIDTH / 2);
  const back = place(x, y, position, DIAMOND_LENGTH, 0);
  const sideB = place(x, y, position, DIAMOND_LENGTH / 2, -DIAMOND_WIDTH / 2);
  return `M ${x} ${y} L ${sideA.x} ${sideA.y} L ${back.x} ${back.y} L ${sideB.x} ${sideB.y} Z`;
}

function semicirclePath(x: number, y: number, position: Position): string {
  const radius = SEMICIRCLE_RADIUS;
  const start = place(x, y, position, 0, radius);
  const bulge = place(x, y, position, radius, 0);
  const end = place(x, y, position, 0, -radius);
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 0 0 ${bulge.x} ${bulge.y} A ${radius} ${radius} 0 0 0 ${end.x} ${end.y} Z`;
}

const TIP: Record<
  Connection,
  (x: number, y: number, position: Position) => string
> = {
  primary: arrowPath,
  secondary: diamondPath,
  tertiary: semicirclePath,
};

/**
 * Distance to pull the shaft back so it ends behind the tip instead of
 * running through it, which would blunt the point.
 */
const SHAFT_INSET: Record<Connection, number> = {
  primary: ARROW_LENGTH - 2,
  secondary: DIAMOND_LENGTH,
  tertiary: 0,
};

/** Trim the last `inset` pixels off a route so the stroke ends behind the tip. */
function insetRoute(points: Point[], inset: number): Point[] {
  if (inset <= 0 || points.length < 2) return points;
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  const dx = last.x - prev.x;
  const dy = last.y - prev.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return points;
  const cut = Math.min(inset, length);
  const result = points.slice(0, -1);
  result.push({
    x: last.x - (dx / length) * cut,
    y: last.y - (dy / length) * cut,
  });
  return result;
}

/** Build an SVG path through axis-aligned waypoints with rounded corners. */
function roundedOrthogonalPath(points: Point[], radius: number): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    const inLen = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    const outLen = Math.hypot(next.x - curr.x, next.y - curr.y);
    if (inLen === 0 || outLen === 0) {
      continue;
    }
    const r = Math.min(radius, inLen / 2, outLen / 2);
    const inX = curr.x - ((curr.x - prev.x) / inLen) * r;
    const inY = curr.y - ((curr.y - prev.y) / inLen) * r;
    const outX = curr.x + ((next.x - curr.x) / outLen) * r;
    const outY = curr.y + ((next.y - curr.y) / outLen) * r;
    d += ` L ${inX} ${inY} Q ${curr.x} ${curr.y} ${outX} ${outY}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

function TippedEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  targetPosition,
  data,
  style,
}: EdgeProps<Edge<TippedEdgeData, "tipped">>) {
  const connection = data?.connection ?? "primary";

  // Routes are static, so the shared map computes each one once. Falling back
  // to the handle coordinates keeps an edge visible if its node is missing.
  const route =
    chartRoutes().get(id) ??
    routeWorkEdge(
      source,
      target,
      { x: sourceX, y: sourceY },
      { x: targetX, y: targetY },
      connection,
    );

  const shaftPoints = insetRoute(route, SHAFT_INSET[connection]);
  const bridges = primaryBridgeGaps().get(id) ?? [];
  const edgePath = splitAtBridges(shaftPoints, bridges)
    .map((piece) => roundedOrthogonalPath(piece, BEND_RADIUS))
    .join(" ");
  const tip = route[route.length - 1] ?? { x: targetX, y: targetY };

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} />
      <path
        d={TIP[connection](tip.x, tip.y, targetPosition)}
        fill={STROKE[connection]}
      />
    </>
  );
}

const edgeTypes = {
  tipped: TippedEdge,
};

const shortcutAnchorLines = shortcutAnchors(buildChartGraph().works);

function chartNodes(): Node[] {
  const { works, zones, edges } = buildChartGraph();
  const { source, target } = computePorts(works, edges);
  const eraNodes: Node[] = [
    {
      id: "siege-backdrop",
      type: "era-backdrop",
      position: { x: SIEGE_OF_TERRA_BACKDROP.x, y: SIEGE_OF_TERRA_BACKDROP.y },
      data: {},
      style: {
        width: SIEGE_OF_TERRA_BACKDROP.w,
        height: SIEGE_OF_TERRA_BACKDROP.h,
      },
      draggable: false,
      selectable: false,
      connectable: false,
      className: "nopan",
      zIndex: 0,
    },
    {
      id: "era-divider",
      type: "era-divider",
      position: { x: ERA_DIVIDER.x, y: ERA_DIVIDER.y },
      data: {},
      style: { width: ERA_DIVIDER.w, height: ERA_DIVIDER.h },
      draggable: false,
      selectable: false,
      connectable: false,
      className: "nopan",
      zIndex: 0,
    },
  ];
  const routes = chartRoutes();
  const primaryRoutes = edges
    .filter((edge) => edge.connection === "primary")
    .map((edge) => routes.get(edge.id) ?? []);
  const zoneNodes: Node[] = zones.map((zone) => {
    const parts = zone.parts ?? [
      { x: zone.x, y: zone.y, w: zone.w, h: zone.h },
    ];
    return {
      id: zone.id,
      type: "zone",
      position: { x: zone.x, y: zone.y },
      data: {
        parts: parts.map((part) => ({
          x: part.x - zone.x,
          y: part.y - zone.y,
          w: part.w,
          h: part.h,
        })),
        gaps: zoneCrossings(parts, primaryRoutes).map((gap) => ({
          x: gap.x - zone.x,
          y: gap.y - zone.y,
        })),
      } satisfies ZoneData,
      style: { width: zone.w, height: zone.h },
      draggable: false,
      selectable: false,
      connectable: false,
      zIndex: 0,
    };
  });
  const zoneLabelNodes: Node[] = zones.map((zone) => ({
    id: `${zone.id}-label`,
    type: "zone-label",
    position: { x: zone.labelX, y: zone.labelY },
    data: { label: zone.label } satisfies ZoneLabelData,
    style: { pointerEvents: "none" },
    draggable: false,
    selectable: false,
    connectable: false,
    zIndex: 4,
  }));
  const workNodes: Node[] = works.map((work) => ({
    id: work.id,
    type: "work",
    position: { x: work.x, y: work.y },
    data: {
      title: work.title,
      publication: work.publication,
      kind: work.kind,
      color: work.color,
      text: work.text,
      ribbon: work.ribbon,
      sourcePorts: sidePorts("source", source.get(work.id) ?? []),
      targetPorts: sidePorts("target", target.get(work.id) ?? []),
    } satisfies WorkData,
    style: { width: work.w, height: work.h },
    draggable: false,
    connectable: false,
    // Clicks on a non-draggable node pan the canvas unless the node opts out.
    className: "nopan",
    zIndex: work.kind === "shortcut" ? 3 : 2,
  }));
  return [...eraNodes, ...zoneNodes, ...workNodes, ...zoneLabelNodes];
}

function chartEdges(): Edge[] {
  const { edges } = buildChartGraph();
  return [...edges]
    .sort(
      (a, b) => CONNECTION_ORDER[a.connection] - CONNECTION_ORDER[b.connection],
    )
    .map((edge) => {
      const style = EDGE_STYLE[edge.connection];
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: `source-${edge.connection}`,
        targetHandle: `target-${edge.connection}`,
        type: "tipped",
        zIndex: 1,
        data: { connection: edge.connection } satisfies TippedEdgeData,
        style: {
          stroke: STROKE[edge.connection],
          strokeWidth: style.strokeWidth,
          strokeDasharray: style.strokeDasharray,
          strokeDashoffset: style.strokeDashoffset,
        },
      };
    });
}

const initialNodes = chartNodes();
const initialEdges = chartEdges();
const worksById = new Map(
  buildChartGraph().works.map((work) => [work.id, work]),
);

/** Keep the viewport inside the poster frame so panning can't lose the chart. */
const TRANSLATE_EXTENT: [[number, number], [number, number]] = [
  [CHART_EXTENT.left, CHART_EXTENT.top],
  [CHART_EXTENT.right, CHART_EXTENT.bottom],
];

function workClassName(node: Node, pulsing: boolean): string | undefined {
  if (node.type !== "work") {
    return undefined;
  }
  return pulsing ? "nopan is-pulsing" : "nopan";
}

function subscribeToTheme(onChange: () => void): () => void {
  window.addEventListener("themechange", onChange);
  return () => window.removeEventListener("themechange", onChange);
}

function themeSnapshot(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function serverThemeSnapshot(): Theme {
  return "light";
}

function useColorMode(): Theme {
  return useSyncExternalStore(
    subscribeToTheme,
    themeSnapshot,
    serverThemeSnapshot,
  );
}

function ChartCanvas({
  pulseIds,
  pulseSourceId,
  focusIds,
  focusKey,
  frame,
  frameRoot,
  onFramed,
  onWorkClick,
  onOpenLegend,
  onStart,
}: {
  pulseIds: ReadonlySet<string>;
  pulseSourceId: string | null;
  focusIds: readonly string[];
  focusKey: number;
  frame: FrameRequest;
  frameRoot: RefObject<HTMLDivElement | null>;
  onFramed: () => void;
  onWorkClick: (id: string) => void;
  onOpenLegend: (source: HTMLElement | null) => void;
  onStart: () => void;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const interactive = chartControlConfig.interactionEnabled;
  const colorMode = useColorMode();
  const { fitView, setViewport } = useReactFlow();
  const store = useStoreApi();
  const onFramedRef = useRef(onFramed);
  onFramedRef.current = onFramed;

  useEffect(() => {
    setNodes((current) =>
      current.map((node) => {
        const className = workClassName(node, pulseIds.has(node.id));
        return node.className === className ? node : { ...node, className };
      }),
    );
  }, [pulseIds, setNodes]);

  useEffect(() => {
    setEdges((current) =>
      current.map((edge) => {
        const className =
          pulseSourceId !== null && edge.source === pulseSourceId
            ? "is-pulsing"
            : undefined;
        return edge.className === className ? edge : { ...edge, className };
      }),
    );
  }, [pulseSourceId, setEdges]);

  useEffect(() => {
    if (focusKey === 0 || focusIds.length === 0) {
      return;
    }
    void fitView({
      nodes: focusIds.map((id) => ({ id })),
      padding: 0.2,
      maxZoom: 1.2,
      duration: 600,
    });
  }, [fitView, focusIds, focusKey]);

  useEffect(() => {
    if (frame.mode === "pending") {
      return;
    }
    let cancelled = false;

    async function apply(attempt: number) {
      if (cancelled) {
        return;
      }
      if (attempt > 90) {
        onFramedRef.current();
        return;
      }
      const pane = frameRoot.current;
      const width = pane?.clientWidth ?? 0;
      const height = pane?.clientHeight ?? 0;
      if (width < 2 || height < 2 || !store.getState().panZoom) {
        window.requestAnimationFrame(() => {
          void apply(attempt + 1);
        });
        return;
      }
      const duration = frame.animate ? 480 : 0;
      if (frame.mode === "poster") {
        await fitView({ duration, padding: 0.04 });
      } else {
        const viewport = openingViewport(
          openingFrameBoxes,
          { width, height },
          OPENING_FRAME_RESERVE,
        );
        const placed = viewport
          ? await setViewport(viewport, { duration })
          : false;
        if (!placed && !cancelled) {
          window.requestAnimationFrame(() => {
            void apply(attempt + 1);
          });
          return;
        }
      }
      if (!cancelled) {
        onFramedRef.current();
      }
    }

    void apply(0);
    return () => {
      cancelled = true;
    };
  }, [fitView, frame, frameRoot, setViewport, store]);

  return (
    <ReactFlow
      nodes={nodes}
      onNodesChange={onNodesChange}
      edges={edges}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      translateExtent={TRANSLATE_EXTENT}
      minZoom={0.02}
      maxZoom={1.5}
      colorMode={colorMode}
      nodesDraggable={chartControlConfig.nodesDraggable}
      nodesConnectable={chartControlConfig.nodesConnectable}
      elementsSelectable={false}
      panOnDrag={interactive && chartControlConfig.panOnDrag}
      zoomOnScroll={interactive && chartControlConfig.zoomOnScroll}
      zoomOnPinch={interactive && chartControlConfig.zoomOnPinch}
      zoomOnDoubleClick={interactive && chartControlConfig.zoomOnDoubleClick}
      proOptions={{ hideAttribution: true }}
      onNodeClick={(_event, node) => {
        if (node.type === "work") {
          onWorkClick(node.id);
        }
      }}
    >
      <ViewportPortal>
        <svg
          className="shortcut-anchors"
          width={CHART_EXTENT.right}
          height={CHART_EXTENT.bottom}
          aria-hidden="true"
        >
          {shortcutAnchorLines.map((anchor) => (
            <g key={anchor.id} className="shortcut-anchor">
              {anchor.lines.map((line) => (
                <line
                  key={`${line.x1}-${line.y1}`}
                  x1={line.x1}
                  y1={line.y1}
                  x2={line.x2}
                  y2={line.y2}
                />
              ))}
            </g>
          ))}
        </svg>
      </ViewportPortal>
      <Controls
        showInteractive={chartControlConfig.showInteractivityToggle}
        orientation="vertical"
      >
        <button
          type="button"
          className="start-button"
          aria-label="Start at Horus Rising"
          onClick={onStart}
        >
          Start
        </button>
        <button
          type="button"
          className="legend-button"
          onClick={(event) => onOpenLegend(event.currentTarget)}
        >
          Legend
        </button>
      </Controls>
      <Background />
    </ReactFlow>
  );
}

function OpeningCard({
  onDismiss,
  onOpenLegend,
}: {
  onDismiss: () => void;
  onOpenLegend: (source: HTMLElement | null) => void;
}) {
  const cardRef = useRef<HTMLElement>(null);

  useEffect(() => {
    cardRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <aside
      className="opening-card"
      aria-labelledby="opening-title"
      ref={cardRef}
      tabIndex={-1}
    >
      <div className="opening-card-inner">
        <div className="opening-lead">
          <h2 id="opening-title" className="opening-title">
            Start at Horus Rising
          </h2>
          <p className="opening-copy">
            Read left to right. Follow the arrow out of a book before you open
            the book it points to.
          </p>
        </div>
        <div className="opening-actions">
          <button type="button" className="opening-read" onClick={onDismiss}>
            Read the chart
          </button>
          <button
            type="button"
            className="opening-legend"
            onClick={(event) => onOpenLegend(event.currentTarget)}
          >
            Legend
          </button>
          <a className="opening-guide" href="/how-to-use-this-chart">
            How to use this chart
          </a>
        </div>
      </div>
    </aside>
  );
}

export default function FlowChart() {
  const [sidebar, setSidebar] = useState(closedSidebar);
  const [legend, setLegend] = useState(initialLegend);
  const [pulseIds, setPulseIds] = useState<ReadonlySet<string>>(new Set());
  const [pulseSourceId, setPulseSourceId] = useState<string | null>(null);
  const [focusIds, setFocusIds] = useState<readonly string[]>([]);
  const [focusKey, setFocusKey] = useState(0);
  const [seen, setSeen] = useState<boolean | null>(null);
  const [chartReady, setChartReady] = useState(false);
  const [frame, setFrame] = useState<FrameRequest>({
    mode: "pending",
    token: 0,
    animate: false,
  });
  const flowRootRef = useRef<HTMLDivElement>(null);
  const legendOpener = useRef<HTMLElement | null>(null);
  const legendWasOpen = useRef(false);

  const dismissOpening = useCallback(() => {
    markOpeningSeen(browserStorage());
    setSeen(true);
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(".start-button")?.focus();
    });
  }, []);

  function openLegendFrom(source: HTMLElement | null) {
    legendOpener.current = source;
    setLegend(openLegend());
  }

  useEffect(() => {
    const already = readOpeningSeen(browserStorage());
    setSeen(already);
    setFrame({
      mode: already ? "poster" : "opening",
      token: 1,
      animate: false,
    });
  }, []);

  useEffect(() => {
    if (!legend.open) {
      if (legendWasOpen.current) {
        legendOpener.current?.focus();
      }
      legendWasOpen.current = false;
      return;
    }
    legendWasOpen.current = true;
    document.querySelector<HTMLButtonElement>(".legend-close")?.focus();
  }, [legend.open]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }
      if (legend.open) {
        setLegend(closeLegend());
        return;
      }
      if (seen !== false) {
        return;
      }
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(".chart-search, header")
      ) {
        return;
      }
      dismissOpening();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dismissOpening, legend.open, seen]);

  function handleWorkClick(workId: string) {
    const work = worksById.get(workId);
    if (!work) {
      return;
    }
    const selection = selectionFor(work, worksById);
    const nextSidebar = toggleWorkSidebar(sidebar, selection);
    setSidebar(nextSidebar);
    setPulseIds(nextSidebar.open ? new Set(nextWorkIds(workId)) : new Set());
    setPulseSourceId(nextSidebar.open ? workId : null);
  }

  function handleSearchSelect(ids: readonly string[]) {
    setPulseSourceId(null);
    setPulseIds(new Set(ids));
    setFocusIds(ids);
    setFocusKey((key) => key + 1);
  }

  return (
    <div
      className="chart-shell"
      data-opening={seen === false ? "true" : "false"}
      style={
        {
          "--work-sidebar-width": `${SIDEBAR_WIDTH_FRACTION * 100}vw`,
        } as CSSProperties
      }
    >
      <div className="chart-stage">
        <div
          className="flow-root"
          data-framed={chartReady ? "true" : "false"}
          ref={flowRootRef}
        >
          <ReactFlowProvider>
            <ChartCanvas
              pulseIds={pulseIds}
              pulseSourceId={pulseSourceId}
              focusIds={focusIds}
              focusKey={focusKey}
              frame={frame}
              frameRoot={flowRootRef}
              onFramed={() => setChartReady(true)}
              onWorkClick={handleWorkClick}
              onOpenLegend={openLegendFrom}
              onStart={() =>
                setFrame((current) => ({
                  mode: "opening",
                  token: current.token + 1,
                  animate: true,
                }))
              }
            />
          </ReactFlowProvider>
          <SearchBox onSelect={handleSearchSelect} />
        </div>
        <aside
          className={sidebar.open ? "work-sidebar is-open" : "work-sidebar"}
          aria-hidden={sidebar.open ? undefined : true}
          data-entrance={sidebar.entrance}
          data-width-fraction={sidebar.widthFraction}
          data-open={sidebar.open ? "true" : "false"}
        >
          <div className="work-sidebar-panel">
            {sidebar.open ? (
              <>
                <div className="sidebar-top">
                  <button
                    type="button"
                    className="sidebar-close"
                    onClick={() => setSidebar(closedSidebar())}
                  >
                    Close
                  </button>
                </div>
                <h2 className="sidebar-book">
                  {displayTitle(sidebar.bookName)}
                </h2>
                {sidebar.publication ? (
                  <p className="sidebar-meta">
                    {detailPublication(sidebar.publication)}
                  </p>
                ) : null}
                {sidebar.description ? (
                  <p className="sidebar-description">{sidebar.description}</p>
                ) : null}
                <dl className="sidebar-facts">
                  <dt>Author</dt>
                  <dd>{sidebar.author || "Unknown"}</dd>
                  <dt>Released</dt>
                  <dd>{sidebar.year ?? "Unknown"}</dd>
                  <dt>Length</dt>
                  <dd>{sidebar.length || "Unknown"}</dd>
                  <dt>Legion / Faction</dt>
                  <dd className="sidebar-factions">
                    {sidebar.factions.length > 0
                      ? sidebar.factions.map((faction) => (
                          <span className="faction-chip" key={faction.name}>
                            <span
                              className="faction-swatch"
                              style={{ backgroundColor: faction.color }}
                            />
                            {faction.name}
                          </span>
                        ))
                      : "Unknown"}
                  </dd>
                </dl>
              </>
            ) : null}
          </div>
        </aside>
      </div>
      {seen === false ? (
        <OpeningCard onDismiss={dismissOpening} onOpenLegend={openLegendFrom} />
      ) : null}
      {legend.open
        ? createPortal(
            <div
              className="legend-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Legend"
            >
              <div className="legend-dialog">
                <div className="legend-body">
                  <img
                    className="legend-image"
                    src="/legend.png"
                    width={1026}
                    height={1120}
                    alt="Legend of the chart. It shows novel and short story marks, primary, secondary, and tertiary connections, ribbons, faction storylines, shortcut badges, and conflict zones."
                  />
                </div>
                <button
                  type="button"
                  className="legend-close"
                  onClick={() => setLegend(closeLegend())}
                >
                  Close
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
