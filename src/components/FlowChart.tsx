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
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import { type CSSProperties, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import "@xyflow/react/dist/style.css";

import {
  buildChartGraph,
  CHART_EXTENT,
  type ChartEdge,
  type ChartWork,
  type Connection,
  ERA_DIVIDER,
  SIEGE_OF_TERRA_BACKDROP,
} from "../flow/chart";
import { nextWorkIds } from "../flow/navigation";
import { type Point, routeWorkEdge } from "../flow/routing";
import { SearchBox } from "./SearchBox";
import { displayTitle, WorkFace } from "./WorkFace";

export { displayTitle } from "./WorkFace";

import { selectionFor } from "../flow/selection";
import {
  chartControlConfig,
  closedSidebar,
  closeLegend,
  initialLegend,
  openLegend,
  SIDEBAR_WIDTH_FRACTION,
  toggleWorkSidebar,
} from "../site/ui-state";

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

type ZoneData = {
  label: string;
};

/** Port positions by priority: the first connection sits at the node's center. */
const PORT_TOPS = ["50%", "25%", "75%"] as const;

function sidePorts(
  prefix: "source" | "target",
  connections: readonly Connection[],
): Port[] {
  return connections.map((connection, index) => ({
    id: `${prefix}-${connection}`,
    top: PORT_TOPS[index] ?? "50%",
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

function ZoneNode({ data }: NodeProps<Node<ZoneData, "zone">>) {
  return (
    <div className="zone-node">
      <span className="zone-label">{data.label}</span>
    </div>
  );
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
  "era-divider": EraDividerNode,
  "era-backdrop": SiegeBackdropNode,
};

const STROKE: Record<Connection, string> = {
  primary: "#c00000",
  secondary: "#204090",
  tertiary: "#2f8f28",
};

const CONNECTION_ORDER: Record<Connection, number> = {
  primary: 0,
  secondary: 1,
  tertiary: 2,
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

/** Routes are static (nodes never move), so compute each one only once. */
const routeCache = new Map<string, Point[]>();

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

  // Routes are static, so compute each one once. The handle coordinates are in
  // the key to guard against React Flow's first render, before nodes measure.
  const routeKey = `${source}|${sourceX}|${sourceY}|${target}|${targetX}|${targetY}`;
  let route = routeCache.get(routeKey);
  if (route === undefined) {
    route = routeWorkEdge(
      source,
      target,
      { x: sourceX, y: sourceY },
      { x: targetX, y: targetY },
    );
    routeCache.set(routeKey, route);
  }

  const shaftPoints = insetRoute(route, SHAFT_INSET[connection]);
  const edgePath = roundedOrthogonalPath(shaftPoints, BEND_RADIUS);

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} />
      <path
        d={TIP[connection](targetX, targetY, targetPosition)}
        fill={STROKE[connection]}
      />
    </>
  );
}

const edgeTypes = {
  tipped: TippedEdge,
};

type Ports = {
  source: Map<string, Connection[]>;
  target: Map<string, Connection[]>;
};

/** Collect the distinct connection colors on each side of every node. */
function computePorts(): Ports {
  const { edges } = buildChartGraph();
  const source = new Map<string, Connection[]>();
  const target = new Map<string, Connection[]>();

  for (const [nodeId, outgoing] of groupBy(edges, (edge) => edge.source)) {
    source.set(nodeId, distinctConnections(outgoing));
  }

  for (const [nodeId, incoming] of groupBy(edges, (edge) => edge.target)) {
    target.set(nodeId, distinctConnections(incoming));
  }

  return { source, target };
}

/** Distinct connection colors on one side, in fixed order. Same color shares one port. */
function distinctConnections(edges: readonly ChartEdge[]): Connection[] {
  const seen = new Set<Connection>();
  for (const edge of edges) {
    seen.add(edge.connection);
  }
  return [...seen].sort((a, b) => CONNECTION_ORDER[a] - CONNECTION_ORDER[b]);
}

function groupBy(
  edges: readonly ChartEdge[],
  key: (edge: ChartEdge) => string,
): Map<string, ChartEdge[]> {
  const groups = new Map<string, ChartEdge[]>();
  for (const edge of edges) {
    const group = groups.get(key(edge)) ?? [];
    group.push(edge);
    groups.set(key(edge), group);
  }
  return groups;
}

function chartNodes(): Node[] {
  const { works, zones } = buildChartGraph();
  const { source, target } = computePorts();
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
  const zoneNodes: Node[] = zones.map((zone) => ({
    id: zone.id,
    type: "zone",
    position: { x: zone.x, y: zone.y },
    data: { label: zone.label },
    style: { width: zone.w, height: zone.h },
    draggable: false,
    selectable: false,
    connectable: false,
    zIndex: 0,
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
  return [...eraNodes, ...zoneNodes, ...workNodes];
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

function FitViewOnMount() {
  const { fitView } = useReactFlow();

  useEffect(() => {
    void fitView({ duration: 0, padding: 0.04 });
  }, [fitView]);

  return null;
}

function ChartCanvas({
  pulseIds,
  onWorkClick,
  onOpenLegend,
}: {
  pulseIds: ReadonlySet<string>;
  onWorkClick: (id: string) => void;
  onOpenLegend: () => void;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const interactive = chartControlConfig.interactionEnabled;

  useEffect(() => {
    setNodes((current) =>
      current.map((node) => {
        const className = workClassName(node, pulseIds.has(node.id));
        return node.className === className ? node : { ...node, className };
      }),
    );
  }, [pulseIds, setNodes]);

  return (
    <ReactFlow
      nodes={nodes}
      onNodesChange={onNodesChange}
      defaultEdges={initialEdges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      fitView
      fitViewOptions={{ padding: 0.04, duration: 0 }}
      translateExtent={TRANSLATE_EXTENT}
      minZoom={0.02}
      maxZoom={1.5}
      colorMode="light"
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
      <FitViewOnMount />
      <Controls
        showInteractive={chartControlConfig.showInteractivityToggle}
        orientation="vertical"
      >
        <button type="button" className="legend-button" onClick={onOpenLegend}>
          Legend
        </button>
      </Controls>
      <Background />
    </ReactFlow>
  );
}

export default function FlowChart() {
  const [sidebar, setSidebar] = useState(closedSidebar);
  const [legend, setLegend] = useState(initialLegend);
  const [pulseIds, setPulseIds] = useState<ReadonlySet<string>>(new Set());

  function handleWorkClick(workId: string) {
    const work = worksById.get(workId);
    if (!work) {
      return;
    }
    const selection = selectionFor(work, worksById);
    const nextSidebar = toggleWorkSidebar(sidebar, selection);
    setSidebar(nextSidebar);
    setPulseIds(nextSidebar.open ? new Set(nextWorkIds(workId)) : new Set());
  }

  return (
    <div
      className="chart-shell"
      style={
        {
          "--work-sidebar-width": `${SIDEBAR_WIDTH_FRACTION * 100}vw`,
        } as CSSProperties
      }
    >
      <div className="flow-root">
        <ReactFlowProvider>
          <ChartCanvas
            pulseIds={pulseIds}
            onWorkClick={handleWorkClick}
            onOpenLegend={() => setLegend(openLegend())}
          />
        </ReactFlowProvider>
        <SearchBox onSelect={(ids) => setPulseIds(new Set(ids))} />
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
              <h2 className="sidebar-book">{displayTitle(sidebar.bookName)}</h2>
              {sidebar.publication ? (
                <p className="sidebar-meta">{sidebar.publication}</p>
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
      {legend.open
        ? createPortal(
            <div
              className="legend-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Legend"
            >
              <div className="legend-dialog">
                <div className="legend-body">{legend.body}</div>
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
