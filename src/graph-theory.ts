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
  
  getEdges(source?: Node, target?: Node): Edge[] {
    let result = this.edges;
    if (source) result = result.filter(e => e.source === source);
    if (target) result = result.filter(e => e.target === target);
    return result;
  }
  
  transitiveReduction(): DirectedGraph {
    const edges = _.clone(this.edges);
    this.nodes.forEach(n => this.getDirectSuccessors(n).forEach(m =>
      this.getSuccessors(m).forEach(s => {
        const e = this.getEdges(n, s)[0];
        if (e && edges.indexOf(e) >= 0) edges.splice(edges.indexOf(e), 1);
      })
    ));
    return new DirectedGraph(_.clone(this.nodes), edges);
  }
  
  private getDirectSuccessors(node: Node): Node[] {
    return this.getEdges(node).map(e => e.target);
  }
  
  private getSuccessors(node: Node): Node[] {
    const direct = this.getDirectSuccessors(node);
    return direct.concat(_.flatMap(direct, this.getSuccessors.bind(this)));
  }
  
}

