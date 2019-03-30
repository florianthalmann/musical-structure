import * as _ from 'lodash';

interface Node {
  id?: string
}

interface Edge {
  source: Node,
  target: Node,
  id?: string
}

export function node(id?: string): Node {
  return id ? {id: id} : {};
}

export function edge(source: Node, target: Node, id?: string): Edge {
  const edge = {source: source, target: target};
  return id ? Object.assign(edge, {id: id}): edge;
}

export class DirectedGraph {
  
  private edges = new Map<Node, Map<Node, Edge[]>>();
  
  constructor(private nodes: Node[], edges: Edge[]) {
    edges.forEach(this.addEdge.bind(this));
  }
  
  clone(): DirectedGraph {
    return new DirectedGraph(this.getNodes(), this.getEdges());
  }
  
  getNodes(): Node[] {
    return this.nodes;
  }
  
  getEdges(): Edge[] {
    return _.flatten(
      ([...this.edges.values()]).map(t => _.flatten([...t.values()])));
  }
  
  private addEdge(edge: Edge) {
    if (!this.edges.has(edge.source)) {
      this.edges.set(edge.source, new Map<Node, Edge[]>());
    }
    const targets = this.edges.get(edge.source);
    if (!targets.has(edge.target)) {
      targets.set(edge.target, []);
    }
    targets.get(edge.target).push(edge);
  }
  
  private findEdges(source: Node, target?: Node): Edge[] {
    const edges = this.edges.get(source);
    if (edges) {
      return target ? edges.get(target) : _.flatten([...edges.values()]);
    }
    return [];
  }
  
  removeEdges(source: Node, target: Node) {
    this.findEdges(source, target).forEach(e => {
      const edges = this.edges.get(source).get(target);
      edges.splice(edges.indexOf(e), 1);
    });
  }
  
  transitiveReduction(): DirectedGraph {
    const reduced = this.clone();
    reduced.getNodes().forEach(n => reduced.getDirectSuccessors(n).forEach(m =>
      reduced.getSuccessors(m).forEach(s => reduced.removeEdges(n, s))
    ));
    return reduced;
  }
  
  private getDirectSuccessors(node: Node): Node[] {
    return this.findEdges(node).map(e => e.target);
  }
  
  private getSuccessors(node: Node): Node[] {
    const direct = this.getDirectSuccessors(node);
    return direct.concat(_.flatMap(direct, this.getSuccessors.bind(this)));
  }
  
}

