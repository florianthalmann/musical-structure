import * as _ from 'lodash';
import { DirectedGraph, Node, Edge, edge } from '../src/graphs/graph-theory';
import { GraphPartition } from '../src/graphs/graph-partition';

describe("a partition", () => {

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

  it("", async () => {
    const partition = new GraphPartition(graph, []);
    partition.insertPartition([nodes[1], nodes[2]], 0);
    partition.insertPartition([nodes[0], nodes[3]], 1);
    partition.insertPartition([nodes[5]], 2);
    expect(partition.getConnectionMatrix()).toEqual([[1,2,0],[2,0,0],[0,0,0]]);
    partition.addNode(nodes[4], 1);
    expect(partition.getConnectionMatrix()).toEqual([[1,2,0],[2,0,1],[0,1,0]]);
  });

});