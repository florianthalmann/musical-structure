import * as _ from 'lodash';
import { DirectedGraph, Node, Edge, edge } from '../src/graphs/graph-theory';

describe("a graph", () => {

  const nodes: Node[] =
    [{id: "1"}, {id: "2"}, {id: "3"}, {id: "4"}, {id: "5"}, {id: "6"}];
  const edges: Edge<Node>[] = [
    edge(nodes[0], nodes[1]),
    edge(nodes[1], nodes[0]),
    edge(nodes[1], nodes[2]),
    edge(nodes[4], nodes[5])
  ];
  let graph: DirectedGraph<Node>;

  beforeEach(async () => {
    graph = new DirectedGraph(nodes, edges);
  });

  it("offers basic functions", async () => {
    expect(graph.getSize()).toBe(6);
    expect(graph.getNodes().length).toBe(6);
    expect(graph.getEdges().length).toBe(4);
    expect(graph.getDegree(nodes[1])).toBe(3); //multigraph
    expect(graph.getDegree(nodes[4])).toBe(1);
    expect(graph.getDegree(nodes[3])).toBe(0);
    expect(graph.getConnectedComponents().map(c => c.length)).toEqual([3,2,1]);
    expect(graph.findEdgesBetween(nodes[0], nodes[1]).length).toBe(2);
    expect(graph.findEdgesBetween(nodes[4], nodes[5]).length).toBe(1);
    expect(graph.findEdgesBetween(nodes[3], nodes[5]).length).toBe(0);
    expect(graph.getDirectAdjacents(nodes[0]).length).toBe(1);
    expect(graph.getDirectAdjacents(nodes[5]).length).toBe(1);
    expect(graph.getAdjacents(nodes[0]).length).toBe(1);
    expect(graph.getAdjacents(nodes[0], 2).length).toBe(2);
    expect(graph.getAdjacents(nodes[0], 0).length).toBe(2);
  });
  
  it("can be cloned", async () => {
    const clone = graph.clone();
    //equivalent
    expect(clone.getNodes().toString()).toEqual(graph.getNodes().toString());
    expect(clone.getEdges().toString()).toEqual(graph.getEdges().toString());
    //nodes same
    expect(_.intersection(clone.getNodes(), graph.getNodes()).length).toBe(6);
    expect(_.union(clone.getNodes(), graph.getNodes()).length).toBe(6);
    //but edges not
    expect(_.intersection(clone.getEdges(), graph.getEdges()).length).toBe(0);
    expect(_.union(clone.getEdges(), graph.getEdges()).length).toBe(8);
  });
  
  //TODO should be checked, somehow gets rid of multi edges...
  it("can be contracted", async () => {
    graph.contract([nodes[0], nodes[1]]);
    expect(graph.getNodes().length).toBe(5);
    expect(graph.getEdges().length).toBe(3);
  });

});
