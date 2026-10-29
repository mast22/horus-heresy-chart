import {
  Background,
  BaseEdge,
  Controls,
  type Edge,
  type EdgeProps,
  getSmoothStepPath,
  Handle,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import { type CSSProperties, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import "@xyflow/react/dist/style.css";

import {
  buildChartGraph,
  type ChartWork,
  type Connection,
} from "../flow/chart";
import { WorkFace } from "./WorkFace";

export { displayTitle } from "./WorkFace";

import {
  chartControlConfig,
  closedSidebar,
  closeLegend,
  initialLegend,
  openLegend,
  SIDEBAR_WIDTH_FRACTION,
  toggleWorkSidebar,
  workSelection,
} from "../site/ui-state";

type WorkData = {
  title: string;
  publication: string;
  kind: ChartWork["kind"];
  color: readonly string[];
  text: string;
  ribbon: boolean;
  letters: string | null;
};

type ZoneData = {
  label: string;
};

function WorkNode({ data }: NodeProps<Node<WorkData, "work">>) {
  return (
    <WorkFace data={data}>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
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

const nodeTypes = {
  work: WorkNode,
  zone: ZoneNode,
};

const STROKE: Record<Connection, string> = {
  primary: "#c00000",
  secondary: "#204090",
  tertiary: "#2f8f28",
};

const ARROW_LENGTH = 22;
const ARROW_WIDTH = 26;
const DIAMOND_LENGTH = 28;
const DIAMOND_WIDTH = 20;
const SEMICIRCLE_RADIUS = 11;

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

function TippedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style,
}: EdgeProps<Edge<TippedEdgeData, "tipped">>) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  const connection = data?.connection ?? "primary";

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

function chartNodes(): Node[] {
  const { works, zones } = buildChartGraph();
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
      letters: work.letters,
    } satisfies WorkData,
    style: { width: work.w, height: work.h },
    draggable: false,
    connectable: false,
    // Clicks on a non-draggable node pan the canvas unless the node opts out.
    className: "nopan",
    zIndex: work.kind === "shortcut" ? 3 : 2,
  }));
  return [...zoneNodes, ...workNodes];
}

function chartEdges(): Edge[] {
  const { edges } = buildChartGraph();
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: "tipped",
    zIndex: 1,
    data: { connection: edge.connection } satisfies TippedEdgeData,
    style: {
      stroke: STROKE[edge.connection],
      strokeWidth: edge.connection === "primary" ? 2.5 : 2,
      strokeDasharray: edge.connection === "primary" ? undefined : "4 11",
    },
  }));
}

const nodes = chartNodes();
const edges = chartEdges();
const worksById = new Map(
  buildChartGraph().works.map((work) => [work.id, work]),
);

function FitViewOnMount() {
  const { fitView } = useReactFlow();

  useEffect(() => {
    void fitView({ duration: 0, padding: 0.04 });
  }, [fitView]);

  return null;
}

export default function FlowChart() {
  const [sidebar, setSidebar] = useState(closedSidebar);
  const [legend, setLegend] = useState(initialLegend);
  const interactive = chartControlConfig.interactionEnabled;

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
          <ReactFlow
            defaultNodes={nodes}
            defaultEdges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            fitViewOptions={{ padding: 0.04, duration: 0 }}
            minZoom={0.02}
            maxZoom={1.5}
            colorMode="light"
            nodesDraggable={chartControlConfig.nodesDraggable}
            nodesConnectable={chartControlConfig.nodesConnectable}
            elementsSelectable={false}
            panOnDrag={interactive && chartControlConfig.panOnDrag}
            zoomOnScroll={interactive && chartControlConfig.zoomOnScroll}
            zoomOnPinch={interactive && chartControlConfig.zoomOnPinch}
            zoomOnDoubleClick={
              interactive && chartControlConfig.zoomOnDoubleClick
            }
            proOptions={{ hideAttribution: true }}
            onNodeClick={(_event, node) => {
              if (node.type !== "work") {
                return;
              }
              const work = worksById.get(node.id);
              if (!work) {
                return;
              }
              setSidebar((current) =>
                toggleWorkSidebar(current, workSelection(work)),
              );
            }}
          >
            <FitViewOnMount />
            <Controls
              showInteractive={chartControlConfig.showInteractivityToggle}
              orientation="vertical"
            >
              <button
                type="button"
                className="legend-button"
                onClick={() => setLegend(openLegend())}
              >
                Legend
              </button>
            </Controls>
            <Background />
          </ReactFlow>
        </ReactFlowProvider>
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
              <h2 className="sidebar-book">{sidebar.bookName}</h2>
              <p className="sidebar-author">
                <span className="sidebar-author-label">Author</span>
                <span className="sidebar-author-value">{sidebar.author}</span>
              </p>
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
