import * as fs from 'fs';
import * as _ from 'lodash';

export interface Node {
  id?: string
}

export interface Edge<NodeType extends Node> {
  source: NodeType,
  target: NodeType,
  id?: string
}

function edge<NodeType extends Node>(source: NodeType, target: NodeType, id?: string): Edge<NodeType> {
  const edge = {source: source, target: target};
  return id ? Object.assign(edge, {id: id}): edge;
}

export class DirectedGraph<NodeType extends Node> {

  private nodes = new Map<string, NodeType>();
  private edges = new Map<NodeType, Map<NodeType, Edge<NodeType>[]>>();
  private inverseEdges = new Map<NodeType, Map<NodeType, Edge<NodeType>[]>>();

  constructor(nodes: NodeType[] = [], edges: Edge<NodeType>[] = []) {
    nodes.forEach(n => this.addNode(n));
    edges.forEach(e => this.addEdgeClone(e));
  }

  clone(ignoredNodes = [], ignoredEdges = []): DirectedGraph<NodeType> {
    const nodes = _.difference(this.getNodes(), ignoredNodes);
    const edges = _.difference(this.getEdges(), ignoredEdges);
    return new DirectedGraph(nodes, edges);
  }

  getSize(): number {
    return this.nodes.size;
  }

  getNodes(): NodeType[] {
    return [...this.nodes.values()];
  }

  getEdges(): Edge<NodeType>[] {
    return _.flatten(
      ([...this.edges.values()]).map(t => _.flatten([...t.values()])));
  }
  
  addGraph(graph: DirectedGraph<NodeType>) {
    graph.getNodes().forEach(n => this.addNode(n));
    graph.getEdges().forEach(e => this.addEdgeClone(e));
  }
  
  getSubgraph(nodes: NodeType[]): DirectedGraph<NodeType> {
    nodes = nodes.map(n => this.nodes.get(n.id));
    return new DirectedGraph(nodes, this.getAllEdges(nodes));
  }
  
  getAllEdges(nodes: NodeType[]): Edge<NodeType>[] {
    return this.getEdges().filter(e =>
      nodes.indexOf(e.source) >= 0 && nodes.indexOf(e.target) >= 0);
  }
  
  getBidirectionalSubgraph(): DirectedGraph<NodeType> {
    return this.getEdgeSubgraph(this.getEdges()
      .filter(e => this.findEdges(e.target, e.source).length > 1));
  }
  
  getEdgeSubgraph(edges: Edge<NodeType>[]) {
    return new DirectedGraph(this.getNodesFromEdges(edges), edges);
  }

  transitiveReduction(): DirectedGraph<NodeType> {
    const reduced = this.clone();
    reduced.getNodes().forEach(n => reduced.getDirectSuccessors(n).forEach(m =>
      reduced.getSuccessors(m).forEach(s => reduced.removeEdges(n, s))
    ));
    return reduced;
  }

  pruneIsolatedNodes(): DirectedGraph<NodeType> {
    const edges = this.getEdges();
    return new DirectedGraph(this.getNodesFromEdges(edges), edges);
  }
  
  private getNodesFromEdges(edges: Edge<NodeType>[]) {
    return _.uniq(_.flatten(edges.map(e => [e.source, e.target])));
  }
  
  pruneEdgesNotInCycles(): DirectedGraph<NodeType> {
    const decompEdges = _.flatten(this.getChainDecomposition());
    return new DirectedGraph(this.getNodes(), decompEdges);
  }
  
  getBridges(): Edge<NodeType>[] {
    const decompEdges = _.flatten(this.getChainDecomposition());
    return _.difference(this.getEdges(), decompEdges);
  }
  
  private getChainDecomposition() {
    //console.log("this", this.getSize(), this.getEdges().length);
    const spanningForest = this.getSpanningForest();
    //console.log("forest", spanningForest.getSize(), spanningForest.getEdges().length);
    const spanningEdges = spanningForest.getEdges();
    const preorder = spanningForest.getNodesInPreorder();
    //console.log("preorder", preorder.length);
    
    //different from schmidt's algorithm: no need to keep track of visited nodes.
    //visited edges (already in chains) is a lot easier!
    const chains: Edge<NodeType>[][] = [];
    preorder.forEach((n,i) => {
      let backEdges = this.getIncidentEdges(n).filter(e =>
        !spanningEdges.some(f => this.parallel([e, f])));
      backEdges = _.difference(backEdges, _.flatten(chains));
      backEdges.forEach(e => {
        const backNode = e.source === n ? e.target : e.source;
        const back = [backNode].concat(spanningForest.getPredecessors(backNode));
        const front = _.reverse([n].concat(spanningForest.getPredecessors(n)));
        const cycle = _.uniq(back.concat(front));
        let path = [e];
        cycle.forEach((u,i) =>
          i === 0 || path.push(...this.findUndirectedEdges(u, cycle[i-1])));
        path = _.difference(path, _.flatten(chains));
        chains.push(path);
      });
    });
    //console.log("decomp", _.flatten(chains).length)
    return chains;
  }
  
  private parallel(edges: Edge<NodeType>[]) {
    return _.uniq(_.flatten(edges.map(e => [e.source, e.target]))).length === 2;
  }
  
  //zettai dame: make undirected graph class anyway...
  private findUndirectedEdges(n1: NodeType, n2: NodeType) {
    return this.findEdges(n1, n2).concat(this.findEdges(n2, n1));
  }
  
  private getNodesInPreorder() {
    const nodes = this.getNodes();
    const roots = this.getRoots();
    const preorder = _.flatten(roots.map(r => this.recursiveGetPreorder(r)));
    //only return if this is actually a directed forest! (no node reached from two roots...)
    if (preorder.length === nodes.length) return preorder;
  }
  
  private recursiveGetPreorder(node: NodeType): NodeType[] {
    return [node].concat(_.flatten(
      this.getDirectSuccessors(node).map(s => this.recursiveGetPreorder(s))));
  }
  
  private getRoots() {
    return this.getNodes().filter(n => this.findEdges(null, n).length === 0);
  }

  getMaximalCliques(): NodeType[][] {
    return this.bronKerbosch([], this.getNodes(), []);
  }

  private bronKerbosch(R: NodeType[], P: NodeType[], X: NodeType[]): NodeType[][] {
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

  contract(nodes: NodeType[]) {
    //nodes[0].id = nodes.map(n => n.id).join('U');
    //console.log(nodes[0])
    _.flatten(nodes.slice(1).map(n => this.findEdges(n))).map(e =>
      this.findEdges(nodes[0], e.target).length == 0 ?
        this.addEdge(nodes[0], e.target) : null);
    nodes.slice(1).forEach(n => this.removeNode(n));
  }
  
  getShortestDistance(node1: NodeType, node2: NodeType, ignoredEdges?: Edge<NodeType>[]) {
    const graph = ignoredEdges ? this.clone([], ignoredEdges) : this;
    let unvisited = graph.getNodes();
    const distMap = new Map<NodeType,number>();
    distMap.set(node1, 0);
    let currentNode = node1;
    while (!distMap.get(node2) && unvisited.length > 0) {
      _.remove(unvisited, n => n === currentNode);
      const neighbors = graph.getDirectAdjacents(currentNode);
      const unvisitedNs = _.intersection(neighbors, unvisited);
      const currentDist = distMap.get(currentNode);
      unvisitedNs.forEach(n => distMap.set(n, currentDist+1));
      const unvisitedDists = unvisited.map(u => distMap.get(u));
      const minIndex = unvisitedDists.indexOf(_.min(unvisitedDists));
      currentNode = unvisited[minIndex !== null && minIndex >= 0 ? minIndex : 0];
    }
    return distMap.get(node2);
  }
  
  getSpanningForest() {
    const spanningForest = new DirectedGraph<NodeType>();
    let remainingNodes = this.getNodes();
    while (remainingNodes.length > 0) {
      const currentTree = this.getSpanningTree(_.first(remainingNodes));
      remainingNodes = _.difference(remainingNodes, currentTree.getNodes());
      spanningForest.addGraph(currentTree);
    }
    return spanningForest;
  }
  
  getSpanningTree(node: NodeType): DirectedGraph<NodeType> {
    const spanningTree = new DirectedGraph<NodeType>();
    spanningTree.addNode(node);
    let queue = [node];
    let index = 0;
    while (index < queue.length) {
      const current = queue[index];
      const next = _.difference(this.getDirectAdjacents(current), queue);
      next.forEach(u => spanningTree.addNode(u));
      next.forEach(u => spanningTree.addEdge(current, u));
      queue = queue.concat(next);
      index++;
    }
    return spanningTree;
  }
  
  getConnectedComponents() {
    const components: NodeType[][] = [];
    let remainingNodes = this.getNodes();
    while (remainingNodes.length > 0) {
      components.push(this.getConnectedComponent(remainingNodes[0]));
      remainingNodes = _.difference(remainingNodes, _.last(components));
    }
    return _.reverse(_.sortBy(components, c => c.length));
  }
  
  getConnectedComponent(node: NodeType) {
    return [node].concat(this.getAdjacents(node, 0));
  }

  //maxDegreesRemoved 0 returns entire connected component
  getAdjacents(node: NodeType, maxDegreesRemoved = 1,
      //a filter condition for a node to be included in adjacents
      condition?: (node: NodeType, others: NodeType[], graph: DirectedGraph<NodeType>) => boolean): NodeType[] {
    let checked = [node];
    let adjacents = _.difference(this.getDirectAdjacents(node), checked);
    if (condition) adjacents = adjacents.reduce((ns: NodeType[], n) =>
      condition(n, _.concat(node, ns), this) ? ns.concat([n]) : ns, []);
    let latest = adjacents;
    while (maxDegreesRemoved > 1 || maxDegreesRemoved <= 0) {
      //const checking = _.reverse(_.sortBy(latest, l => this.getIncidentEdges(l).length));
      const checking = latest;
      latest = _.difference(_.uniq(_.flatten(checking.map(n => this.getDirectAdjacents(n)))), checked);
      //keep only as many nodes as the condition allows
      if (condition) latest = latest.reduce((ns: NodeType[], n) =>
        condition(n, _.concat(node, adjacents, ns), this) ? ns.concat([n]) : ns, []);
      const previousSize = adjacents.length;
      adjacents = _.union(adjacents, latest);
      if (adjacents.length <= previousSize) return adjacents; //entire connected component reached
      checked = _.concat(checked, checking);
      maxDegreesRemoved--;
    }
    return adjacents;
  }

  getDirectAdjacents(node: NodeType) {
    return _.uniq(this.getDirectSuccessors(node)
      .concat(this.getDirectPredecessors(node)));
  }

  /** children of same parents, parents of same children */
  getNeighbors(node: NodeType, degreesRemoved = 1): NodeType[] {
    let neighbors = this.getDirectNeighbors(node);
    while (degreesRemoved > 1) {
      neighbors = _.uniq(_.flatten(neighbors.map(n => this.getDirectNeighbors(n))));
      degreesRemoved--;
    }
    return neighbors;
  }

  private getDirectNeighbors(node: NodeType): NodeType[] {
    return _.uniq(_.flatten(_.concat(
      this.getDirectSuccessors(node).map(n => this.getDirectPredecessors(n)),
      this.getDirectPredecessors(node).map(n => this.getDirectSuccessors(n)),
    )));
  }

  getDirectSuccessors(node: NodeType): NodeType[] {
    return this.findEdges(node).map(e => e.target);
  }

  getSuccessors(node: NodeType): NodeType[] {
    const direct = this.getDirectSuccessors(node);
    const indirect = _.flatMap(direct, n => this.getSuccessors(n));
    return _.concat(direct, indirect);
  }
  
  getDegree(node: NodeType): number {
    return this.getIncidentEdges(node).length;
  }

  getDirectPredecessors(node: NodeType): NodeType[] {
    return this.findEdges(null, node).map(e => e.source);
  }

  getPredecessors(node: NodeType): NodeType[] {
    const direct = this.getDirectPredecessors(node);
    return direct.concat(_.flatMap(direct, n => this.getPredecessors(n)));
  }

  addEdge(source: NodeType, target: NodeType): Edge<NodeType> {
    return this.pushEdge(edge(source, target));
  }
  
  private addNode(node: NodeType) {
    if (!this.nodes.has(node.id)) this.nodes.set(node.id, node);
  }

  private addEdgeClone(edge: Edge<NodeType>) {
    const clone = _.clone(edge);
    clone.source = this.nodes.get(edge.source.id);
    clone.target = this.nodes.get(edge.target.id);
    this.pushEdge(clone);
  }

  private pushEdge(e: Edge<NodeType>): Edge<NodeType> {
    if (this.nodes.has(e.source.id) && this.nodes.has(e.target.id)) {
      this.pushToDoubleMap(this.edges, e.source, e.target, e);
      this.pushToDoubleMap(this.inverseEdges, e.target, e.source, e);
      return e;
    }
  }
  
  getIncidentEdges(node: NodeType) {
    return _.uniq(this.findEdges(node).concat(this.findEdges(null, node)));
  }

  private findEdges(source?: NodeType, target?: NodeType): Edge<NodeType>[] {
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

  private removeEdges(source: NodeType, target: NodeType) {
    this.findEdges(source, target).forEach(e => {
      const edges = this.edges.get(source).get(target);
      edges.splice(edges.indexOf(e), 1);
      const inverses = this.inverseEdges.get(target).get(source);
      inverses.splice(inverses.indexOf(e), 1);
    });
  }

  removeNode(node: NodeType) {
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

export function saveGraph<NodeType extends Node>(path: string, graph: DirectedGraph<NodeType>) {
  try {
    fs.writeFileSync(path,
      JSON.stringify({nodes: graph.getNodes(), edges: graph.getEdges()}))
  } catch (e) {
    console.log('failed to cache graph at '+path);
  }
}

export function loadGraph<NodeType extends Node>(path: string): DirectedGraph<NodeType> {
  if (fs.existsSync(path)) {
    const json = JSON.parse(fs.readFileSync(path, 'utf8'));
    return new DirectedGraph(json.nodes, json.edges);
  }
}
