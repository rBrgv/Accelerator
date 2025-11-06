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
  
  // Build edges from lookups and master-detail relationships
  for (const obj of objects) {
    for (const lookup of obj.lookups) {
      // Only include edges if target object is in our scan
      if (nodeMap.has(lookup.target)) {
        edges.push({
          from: obj.name,
          to: lookup.target,
          type: lookup.isMasterDetail ? "master-detail" : "lookup",
        });
      }
    }
  }
  
  // Topological sort using Kahn's algorithm
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
  
  // Initialize
  for (const node of nodes) {
    inDegree.set(node, 0);
    adjList.set(node, []);
  }
  
  // Build adjacency list and calculate in-degrees
  for (const edge of edges) {
    const from = edge.from;
    const to = edge.to;
    
    adjList.get(from)!.push(to);
    inDegree.set(to, (inDegree.get(to) || 0) + 1);
  }
  
  // Kahn's algorithm
  const queue: string[] = [];
  const result: string[] = [];
  
  // Add nodes with no incoming edges
  for (const [node, degree] of inDegree.entries()) {
    if (degree === 0) {
      queue.push(node);
    }
  }
  
  while (queue.length > 0) {
    const node = queue.shift()!;
    result.push(node);
    
    for (const neighbor of adjList.get(node) || []) {
      const newDegree = (inDegree.get(neighbor) || 0) - 1;
      inDegree.set(neighbor, newDegree);
      
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }
  
  // If we couldn't process all nodes, there's a cycle
  // Add remaining nodes at the end
  for (const node of nodes) {
    if (!result.includes(node)) {
      result.push(node);
    }
  }
  
  return result;
}
