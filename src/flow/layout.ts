import { Graph, layout } from "@dagrejs/dagre";
import { type Node, Position } from "@xyflow/react";

import type { ExampleEdge, ExampleNode } from "./example";

export const NODE_WIDTH = 180;
export const NODE_HEIGHT = 44;

const NODE_SEP = 48;
const RANK_SEP = 72;

type FlowData = {
  label: string;
};

type DagreNode = {
  width: number;
  height: number;
  x?: number;
  y?: number;
};

export type FlowNode = Node<FlowData>;

function nodeHandles(
  width: number,
  height: number,
): NonNullable<FlowNode["handles"]> {
  return [
    {
      type: "target",
      position: Position.Top,
      x: width / 2,
      y: 0,
    },
    {
      type: "source",
      position: Position.Bottom,
      x: width / 2,
      y: height,
    },
  ];
}

export function layoutGraph(
  nodes: readonly ExampleNode[],
  edges: readonly ExampleEdge[],
): FlowNode[] {
  const graph = new Graph<
    { rankdir: "TB"; nodesep: number; ranksep: number },
    DagreNode
  >();

  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: "TB",
    nodesep: NODE_SEP,
    ranksep: RANK_SEP,
  });

  for (const node of nodes) {
    graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  for (const edge of edges) {
    graph.setEdge(edge.source, edge.target);
  }

  layout(graph);

  return nodes.map((node) => {
    const placed = graph.node(node.id);

    if (placed?.x === undefined || placed.y === undefined) {
      throw new Error(`Dagre did not position node ${node.id}`);
    }

    return {
      id: node.id,
      data: node.data,
      position: {
        x: placed.x - NODE_WIDTH / 2,
        y: placed.y - NODE_HEIGHT / 2,
      },
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      measured: {
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      handles: nodeHandles(NODE_WIDTH, NODE_HEIGHT),
    };
  });
}
