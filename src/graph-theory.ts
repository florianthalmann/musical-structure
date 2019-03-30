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
  
  private sourceToEdges = new Map<Node, Edge[]>();
  
  constructor(public nodes: Node[], public edges: Edge[]) {
    nodes.forEach(n => this.sourceToEdges.set(n, []));
    edges.forEach(e => this.sourceToEdges.get(e.source).push(e));
  }
  
  clone(): DirectedGraph {
    return new DirectedGraph(_.clone(this.nodes), _.clone(this.edges));
  }
  
  private findEdges(source: Node, target?: Node): Edge[] {
    let result = source ? this.sourceToEdges.get(source) : this.edges;
    if (target) result = result.filter(e => e.target === target);
    return result;
  }
  
  removeEdges(source: Node, target: Node) {
    this.findEdges(source, target).forEach(e => {
      const s2e = this.sourceToEdges.get(source);
      s2e.splice(s2e.indexOf(e), 1);
      this.edges.splice(this.edges.indexOf(e), 1);
    });
  }
  
  transitiveReduction(): DirectedGraph {
    const reduced = this.clone();
    reduced.nodes.forEach(n => reduced.getDirectSuccessors(n).forEach(m =>
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

