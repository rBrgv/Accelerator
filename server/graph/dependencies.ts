import { DependencyGraph, ObjectStat } from "@/lib/types";
import { createLogger } from "../logger";

export function buildGraph(objects: ObjectStat[]): DependencyGraph {
  const logger = createLogger();

  const nodes = objects.map((obj) => ({
    name: obj.name,
    label: obj.label,
  }));

  const edges: Array<{ from: string; to: string; type: "lookup" | "master-detail" }> = [];
  const nodeMap = new Map<string, ObjectStat>();

  for (const obj of objects) {
    nodeMap.set(obj.name, obj);
  }

  // Edge semantics: from=child has lookup/MD to to=parent
  for (const obj of objects) {
    for (const lookup of obj.lookups) {
      if (nodeMap.has(lookup.target)) {
        edges.push({
          from: obj.name,
          to: lookup.target,
          type: lookup.isMasterDetail ? "master-detail" : "lookup",
        });
      }
    }
  }

  // Topological sort for deployment order (parents before children)
  const order = topologicalSort(nodes.map((n) => n.name), edges);

  logger.info(
    { nodes: nodes.length, edges: edges.length, order: order.length },
    "Dependency graph built"
  );

  return { nodes, edges, order };
}

function topologicalSort(nodes: string[], edges: Array<{ from: string; to: string }>): string[] {
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();

  for (const node of nodes) {
    inDegree.set(node, 0);
    adjList.set(node, []);
  }

  // For deployment order (parent before child), reverse the edge direction:
  // Edge `from → to` means "from depends on to (to is the parent)".
  // We want to (parent) first, so we build adjacency parent → child
  // and give in-degree to the child (from).
  for (const edge of edges) {
    adjList.get(edge.to)!.push(edge.from);           // parent points to child
    inDegree.set(edge.from, (inDegree.get(edge.from) || 0) + 1); // child has in-degree
  }

  const queue: string[] = [];
  const result: string[] = [];

  for (const [node, degree] of inDegree.entries()) {
    if (degree === 0) queue.push(node);
  }

  while (queue.length > 0) {
    const node = queue.shift()!;
    result.push(node);

    for (const child of adjList.get(node) || []) {
      const newDegree = (inDegree.get(child) || 0) - 1;
      inDegree.set(child, newDegree);
      if (newDegree === 0) queue.push(child);
    }
  }

  // Append any remaining nodes (cycles) — use a Set for O(1) lookup
  const processed = new Set(result);
  for (const node of nodes) {
    if (!processed.has(node)) result.push(node);
  }

  return result;
}
