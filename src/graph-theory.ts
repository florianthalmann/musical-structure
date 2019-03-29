import * as _ from 'lodash';

interface Node {
  id?: string
}

interface Edge {
  source: Node,
  target: Node,
  id?: string
}

interface Graph {
  nodes: Node[],
  edges: Edge[]
}

export function node(id?: string): Node {
  return id ? {id: id} : {};
}

export function edge(source: Node, target: Node, id?: string): Edge {
  const edge = {source: source, target: target};
  return id ? Object.assign(edge, {id: id}): edge;
}

export function graph(nodes: Node[], edges: Edge[]): Graph {
  return {nodes: nodes, edges: edges};
}

export function transitiveReduction(input: Graph): Graph {
  const nodes = _.clone(input.nodes);
  const edges = _.clone(input.edges);
  nodes.forEach(x => nodes.forEach(y => nodes.forEach(z =>
    removeTransitive(x, y, z, edges))));
  return graph(nodes, edges);
}

function removeTransitive(x: Node, y: Node, z: Node, edges: Edge[]) {
  if (getEdge(x, y, edges) && getEdge(y, z, edges)) {
    const xz = getEdge(x, z, edges);
    if (xz) {
      edges.splice(edges.indexOf(xz), 1);
    }
  }
}

function getEdge(source: Node, target: Node, edges: Edge[]): Edge {
  return edges.filter(e => e.source === source).filter(e => e.target === target)[0];
}