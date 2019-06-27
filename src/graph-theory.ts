import * as fs from 'fs';
import * as _ from 'lodash';

export interface Node {
  id?: string
}

export interface Edge {
  source: Node,
  target: Node,
  id?: string
}

function edge(source: Node, target: Node, id?: string): Edge {
  const edge = {source: source, target: target};
  return id ? Object.assign(edge, {id: id}): edge;
}

export class DirectedGraph {
  
  private nodes = new Map<string, Node>();
  private edges = new Map<Node, Map<Node, Edge[]>>();
  private inverseEdges = new Map<Node, Map<Node, Edge[]>>();
  
  constructor(nodes: Node[] = [], edges: Edge[] = []) {
    nodes.forEach(n => this.nodes.set(n.id, n));
    edges.forEach(e => this.addLoadedEdge(e));
  }
  
  clone(): DirectedGraph {
    return new DirectedGraph(this.getNodes(), this.getEdges());
  }
  
  getSize(): number {
    return this.nodes.size;
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
  
  pruneIsolatedNodes(): DirectedGraph {
    const nodes = _.uniq(_.flatten(this.getEdges().map(e => [e.source, e.target])));
    return new DirectedGraph(nodes, this.getEdges());
  }
  
  getMaximalCliques(): Node[][] {
    return this.bronKerbosch([], this.getNodes(), []);
  }
  
  private bronKerbosch(R: Node[], P: Node[], X: Node[]): Node[][] {
    if (P.length == 0 && X.length == 0) {
      return [R];
    }
    let result = []
    P.forEach(n => {
      result = _.concat(result,
        this.bronKerbosch(_.concat(R, n),
          _.intersection(P, this.getAdjacents(n)),
          _.intersection(X, this.getAdjacents(n))));
      P = _.difference(P, [n]);
      X = _.concat(X, n);
    });
    return result;
  }
  
  contract(nodes: Node[]) {
    //nodes[0].id = nodes.map(n => n.id).join('U');
    //console.log(nodes[0])
    _.flatten(nodes.slice(1).map(n => this.findEdges(n))).map(e =>
      this.findEdges(nodes[0], e.target).length == 0 ?
        this.addEdge(nodes[0], e.target) : null);
    nodes.slice(1).forEach(n => this.removeNode(n));
  }
  
  getAdjacents(node: Node, maxDegreesRemoved = 1): Node[] {
    let adjacents = this.getDirectAdjacents(node);
    let latest = adjacents;
    let checked = [node];
    while (maxDegreesRemoved > 1 || maxDegreesRemoved <= 0) {
      const checking = _.difference(latest, checked);
      latest = _.uniq(_.flatten(checking.map(n => this.getDirectAdjacents(n))));
      const previousSize = adjacents.length;
      adjacents = _.union(adjacents, latest);
      if (adjacents.length <= previousSize) return adjacents; //entire connected component reached
      checked = _.concat(checked, checking);
      maxDegreesRemoved--;
    }
    return adjacents;
  }
  
  private getDirectAdjacents(node: Node) {
    return this.getDirectSuccessors(node).concat(this.getDirectPredecessors(node));
  }
  
  /** children of same parents, parents of same children */
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
  
  addEdge(source: Node, target: Node): Edge {
    if (this.nodes.has(source.id) && this.nodes.has(target.id)) {
      return this.pushEdge(edge(source, target));
    }
  }
  
  private addLoadedEdge(edge: Edge) {
    edge.source = this.nodes.get(edge.source.id);
    edge.target = this.nodes.get(edge.target.id);
    this.pushEdge(edge);
  }
  
  private pushEdge(e: Edge): Edge {
    this.pushToDoubleMap(this.edges, e.source, e.target, e);
    this.pushToDoubleMap(this.inverseEdges, e.target, e.source, e);
    return e;
  }
  
  private findEdges(source?: Node, target?: Node): Edge[] {
    if (source) {
      const edges = this.edges.get(source);
      if (edges) {
        if (target) {
           if (edges.has(target)) return edges.get(target);
        } else {
          return _.flatten([...edges.values()]);
        }
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
  
  removeNode(node: Node) {
    this.nodes.delete(node.id);
    this.edges.delete(node);
    this.edges.forEach(e => e.delete(node));
    this.inverseEdges.delete(node);
    this.inverseEdges.forEach(e => e.delete(node));
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