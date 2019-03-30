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
  
  constructor(public nodes: Node[], public edges: Edge[]) {}
  
  clone(): DirectedGraph {
    return new DirectedGraph(_.clone(this.nodes), _.clone(this.edges));
  }
  
  getEdges(source?: Node, target?: Node): Edge[] {
    let result = this.edges;
    if (source) result = result.filter(e => e.source === source);
    if (target) result = result.filter(e => e.target === target);
    return result;
  }
  
  removeEdges(source: Node, target: Node) {
    this.getEdges(source, target).forEach(e =>
      this.edges.splice(this.edges.indexOf(e), 1));
  }
  
  transitiveReduction(): DirectedGraph {
    const reduced = this.clone();
    reduced.nodes.forEach(n => reduced.getDirectSuccessors(n).forEach(m =>
      reduced.getSuccessors(m).forEach(s => reduced.removeEdges(n, s))
    ));
    return reduced;
  }
  
  private getDirectSuccessors(node: Node): Node[] {
    return this.getEdges(node).map(e => e.target);
  }
  
  private getSuccessors(node: Node): Node[] {
    const direct = this.getDirectSuccessors(node);
    return direct.concat(_.flatMap(direct, this.getSuccessors.bind(this)));
  }
  
}

