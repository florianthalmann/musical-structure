import * as fs from 'fs';
import * as _ from 'lodash';
import * as svg2png from 'svg2png';
import * as D3Node from 'd3-node';
const d3n = new D3Node;

export interface Node {
  id?: string
}

export interface Edge {
  source: Node,
  target: Node,
  id?: string
}

export function edge(source: Node, target: Node, id?: string): Edge {
  const edge = {source: source, target: target};
  return id ? Object.assign(edge, {id: id}): edge;
}

export class DirectedGraph {
  
  private nodes = new Map<string, Node>();
  private edges = new Map<Node, Map<Node, Edge[]>>();
  private inverseEdges = new Map<Node, Map<Node, Edge[]>>();
  
  constructor(nodes: Node[] = [], edges: Edge[] = []) {
    nodes.forEach(n => this.nodes.set(n.id, n));
    edges.forEach(e => this.addEdge(e));
  }
  
  clone(): DirectedGraph {
    return new DirectedGraph(this.getNodes(), this.getEdges());
  }
  
  getNodes(): Node[] {
    return [...this.nodes.values()];
  }
  
  getEdges(): Edge[] {
    return _.flatten(
      ([...this.edges.values()]).map(t => _.flatten([...t.values()])));
  }
  
  transitiveReduction(): DirectedGraph {
    const reduced = this.clone();
    reduced.getNodes().forEach(n => reduced.getDirectSuccessors(n).forEach(m =>
      reduced.getSuccessors(m).forEach(s => reduced.removeEdges(n, s))
    ));
    return reduced;
  }
  
  getAdjacent(node: Node): Node[] {
    return this.getDirectSuccessors(node)
      .concat(this.getDirectPredecessors(node));
  }
  
  getNeighbors(node: Node, degreesRemoved = 1): Node[] {
    let neighbors = this.getDirectNeighbors(node);
    while (degreesRemoved > 1) {
      neighbors = _.uniq(_.flatten(neighbors.map(n => this.getDirectNeighbors(n))));
      degreesRemoved--;
    }
    return neighbors;
  }
  
  private getDirectNeighbors(node: Node): Node[] {
    return _.uniq(_.flatten(_.concat(
      this.getDirectSuccessors(node).map(n => this.getDirectPredecessors(n)),
      this.getDirectPredecessors(node).map(n => this.getDirectSuccessors(n)),
    )));
  }
  
  getDirectSuccessors(node: Node): Node[] {
    return this.findEdges(node).map(e => e.target);
  }
  
  getSuccessors(node: Node): Node[] {
    const direct = this.getDirectSuccessors(node);
    const indirect = _.flatMap(direct, n => this.getSuccessors(n));
    return _.concat(direct, indirect);
  }
  
  getDirectPredecessors(node: Node): Node[] {
    return this.findEdges(null, node).map(e => e.source);
  }
  
  getPredecessors(node: Node): Node[] {
    const direct = this.getDirectPredecessors(node);
    return direct.concat(_.flatMap(direct, n => this.getPredecessors(n)));
  }
  
  private addEdge(e: Edge) {
    e = edge(this.nodes.get(e.source.id), this.nodes.get(e.target.id))
    this.pushToDoubleMap(this.edges, e.source, e.target, e);
    this.pushToDoubleMap(this.inverseEdges, e.target, e.source, e);
  }
  
  private findEdges(source?: Node, target?: Node): Edge[] {
    if (source) {
      const edges = this.edges.get(source);
      if (edges) {
        return target ? edges.get(target) : _.flatten([...edges.values()]);
      }
    } else if (target) {
      const inverses = this.inverseEdges.get(target);
      if (inverses) {
        return _.flatten([...inverses.values()]);
      }
    }
    return [];
  }
  
  private removeEdges(source: Node, target: Node) {
    this.findEdges(source, target).forEach(e => {
      const edges = this.edges.get(source).get(target);
      edges.splice(edges.indexOf(e), 1);
      const inverses = this.inverseEdges.get(target).get(source);
      inverses.splice(inverses.indexOf(e), 1);
    });
  }
  
  private pushToDoubleMap<T,U>(map: Map<T,Map<T,U[]>>, key1: T, key2: T, value: U) {
    const map2 = this.getOrInit(map, key1, () => new Map<T, U[]>());
    this.getOrInit(map2, key2, () => ([])).push(value);
  }
  
  private getOrInit<T,U>(map: Map<T,U>, key: T, init: () => U) {
    if (!map.has(key)) {
      map.set(key, init());
    }
    return map.get(key);
  }

}

export function saveGraph(path: string, graph: DirectedGraph) {
  fs.writeFileSync(path,
    JSON.stringify({nodes: graph.getNodes(), edges: graph.getEdges()}))
}

export function loadGraph(path: string): DirectedGraph {
  const json = JSON.parse(fs.readFileSync(path, 'utf8'));
  return new DirectedGraph(json.nodes, json.edges);
}