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
  let partition: GraphPartition<Node>;

  beforeEach(() => {
    graph = new DirectedGraph(nodes, edges);
    partition = new GraphPartition(graph, []);
    partition.insertPartition([nodes[1], nodes[2]], 0);
    partition.insertPartition([nodes[0], nodes[3], nodes[4]], 1);
    partition.insertPartition([nodes[5]], 2);
  });
  
  it("offers basic functions", () => {
    expect(partition.getConnectionMatrix()).toEqual([[1,2,0],[2,0,1],[0,1,0]]);
    expect(partition.getPartitionCount()).toEqual(3);
    expect(partition.getNodeCount()).toEqual(6);
    expect(partition.getPartitions().map(p=>p.map(n=>parseInt(n.id))))
      .toEqual([[2,3],[1,4,5],[6]]);
    expect(partition.getMaxPartitionSize()).toEqual(3);
    expect(partition.toString()).toEqual("[2,3,1]");
  });

  it("offers basic node manipulation functions", () => {
    expect(partition.getConnectionMatrix()).toEqual([[1,2,0],[2,0,1],[0,1,0]]);
    expect(partition.findNodeAt(1, n => parseInt(n.id) > 4)).toEqual(nodes[4]);
    partition.addNode(nodes[1], 2);
    expect(partition.getNodeCount()).toEqual(6); //not added (already there)
    expect(partition.getNodePartitionIndex(nodes[1])).toEqual(0);
    partition.removeNode(nodes[0])
    expect(partition.getNodeCount()).toEqual(5);
    expect(partition.getNodePartitionIndex(nodes[0])).toBeUndefined();
    expect(partition.getConnectionMatrix()).toEqual([[1,0,0],[0,0,1],[0,1,0]]);
    partition.addNode(nodes[0], 2);
    expect(partition.getNodeCount()).toEqual(6);
    expect(partition.getNodePartitionIndex(nodes[0])).toEqual(2);
    expect(partition.getConnectionMatrix()).toEqual([[1,0,2],[0,0,1],[2,1,0]]);
    partition.moveNode(nodes[4], 2);
    expect(partition.getNodeCount()).toEqual(6);
    expect(partition.getConnectionMatrix()).toEqual([[1,0,2],[0,0,0],[2,0,1]]);
    partition.removeNodeAt(2, n => parseInt(n.id) > 5);
    expect(partition.getNodeCount()).toEqual(5);
    expect(partition.getConnectionMatrix()).toEqual([[1,0,2],[0,0,0],[2,0,0]]);
  });
  
  it("offers basic partition manipulation functions", () => {
    //merge
    expect(partition.getConnectionMatrix()).toEqual([[1,2,0],[2,0,1],[0,1,0]]);
    let clone = partition.clone();
    expect(clone.getConnectionMatrix()).toEqual([[1,2,0],[2,0,1],[0,1,0]]);
    clone.mergePartitions(0,2);
    expect(clone.getConnectionMatrix()).toEqual([[1,3],[3,0]]);
    clone = partition.clone();
    clone.mergePartitions(0,1);
    expect(clone.getNodeCount()).toEqual(6);
    expect(clone.getConnectionMatrix()).toEqual([[3,1],[1,0]]);
    //remove, reinsert
    clone = partition.clone();
    clone.removePartition(1);
    expect(clone.getPartitionCount()).toEqual(2);
    expect(clone.getNodeCount()).toEqual(3);
    expect(clone.getConnectionMatrix()).toEqual([[1,0],[0,0]]);
    clone.insertPartition([nodes[0], nodes[3], nodes[4]], 1);
    expect(partition.getConnectionMatrix()).toEqual([[1,2,0],[2,0,1],[0,1,0]]);
    //remove small
    clone = partition.clone();
    clone.removeSmallPartitions(3);
    expect(clone.getPartitionCount()).toEqual(1);
    expect(clone.getNodeCount()).toEqual(3);
    expect(clone.getConnectionMatrix()).toEqual([[0]]);
  });

});