import * as _ from 'lodash';
import { DirectedGraph, Node } from './graph-theory';
import { allIndexesWith } from './util';

export class GraphPartition<NodeType extends Node> {
  
  private nodeLocations = new Map<string,number>(); //id -> partition index
  
  constructor(private graph: DirectedGraph<NodeType>,
      private partitions: NodeType[][],
      private connections = calculateConnectionMatrix(graph, partitions)) {
    partitions.forEach((p,i) =>
      p.forEach(n => this.nodeLocations.set(n.id, i)));
    partitions = partitions.map(p => p.map(n => graph.getNode(n.id)));
  }
  
  clone() {
    return new GraphPartition(this.graph,
      _.clone(this.partitions.map(t => _.clone(t))),
      _.cloneDeep(this.connections));
  }
  
  getGraph() {
    return this.graph;
  }
  
  getConnectionMatrix() {
    return this.connections;
    //return calculateConnectionMatrix(this.graph, this.partitions);
  }
  
  getPartitionCount() {
    return this.partitions.length;
  }
  
  getNodeCount() {
    return this.nodeLocations.size;
  }
  
  getPartitions() {
    return this.partitions;
  }
  
  getMaxPartitionSize() {
    return _.max(this.partitions.map(t => t.length));
  }
  
  toString() {
    return JSON.stringify(this.partitions.map(p => p.length));
  }
  
  addNode(node: NodeType, index: number) {
    if (!this.nodeLocations.has(node.id) && this.inRange(index)) {
      this.partitions[index].push(node);
      this.nodeLocations.set(node.id, index);
      this.incrementConnections(node, index);
      return true;
    }
  }
  
  removeNode(node: NodeType) {
    if (this.nodeLocations.has(node.id)) {
      const index = this.nodeLocations.get(node.id);
      this.nodeLocations.delete(node.id);
      this.partitions[index].splice(this.partitions[index].indexOf(node), 1);
      this.decrementConnections(node, index);
      return true;
    }
  }
  
  removeNodeAt(index: number, condition: (n: NodeType) => boolean) {
    const node = this.findNodeAt(index, condition);
    if (node) this.removeNode(node);
  }
  
  findNodeAt(index: number, condition: (n: NodeType) => boolean) {
    return this.partitions[index].find(n => condition(n));
  }
  
  moveNode(node: NodeType, index: number) {
    if (this.inRange(index)) {
      this.removeNode(node);
      return this.addNode(node, index);
    }
  }
  
  mergeNeighboringPartitions(condition: (n1: NodeType[], n2: NodeType[]) => boolean) {
    if (this.partitions.length > 1) {
      _.range(this.partitions.length-1, 0, -1).forEach(i => {
        if (condition(this.partitions[i-1], this.partitions[i]))
          this.mergePartitions(i-1, i);
      });
    }
  }
  
  //adds all elements at index2 to partition at index1
  mergePartitions(index1: number, index2: number) {
    if (index1 != index2) {
      const moved = this.partitions[index2];
      moved.forEach(n => this.nodeLocations.set(n.id, index1));
      this.decrementNodeLocations(index2+1);
      this.partitions[index1].push(...moved);
      this.partitions.splice(index2, 1);
      this.connections[index2].forEach((v,j) => this.connections[index1][j] += v);
      this.connections[index1][index1] += this.connections[index2][index2];
      this.removeConnectionsAt(index2);
      return this.partitions;
    }
  }
  
  removePartitions(indexes: number[]) {
    indexes = _.reverse(_.sortBy(indexes));
    return _.flatten(indexes.map(i => this.removePartition(i)));
  }
  
  removePartition(index: number) {
    const removed = this.partitions[index];
    removed.forEach(n => this.nodeLocations.delete(n.id));
    this.decrementNodeLocations(index+1);
    this.partitions.splice(index, 1);
    this.removeConnectionsAt(index);
    return removed;
  }
  
  removeEmptyPartitions() {
    return this.removeSmallPartitions(1);
  }
  
  removeSmallPartitions(minSize: number) {
    const tooSmall = allIndexesWith(this.partitions, p => p.length < minSize);
    return this.removePartitions(tooSmall);
  }
  
  insertPartition(partition: NodeType[], index: number) {
    partition = partition.filter(n => !this.nodeLocations.has(n.id));
    if (partition.length > 0 && 0 <= index && index <= this.getPartitionCount()) {
      this.incrementNodeLocations(index);
      partition.forEach(n => this.nodeLocations.set(n.id, index));
      this.partitions.splice(index, 0, _.clone(partition));
      this.insertConnectionsAt(index);
      partition.forEach(n => this.incrementConnections(n, index));
      this.connections[index][index] /= 2; //self-connections were added twice
      return true;
    }
  }
  
  private incrementNodeLocations(min: number) {
    this.nodeLocations.forEach((v,k) => {
      if (v >= min) this.nodeLocations.set(k, v+1); });
  }
  
  private decrementNodeLocations(min: number) {
    this.nodeLocations.forEach((v,k) => {
      if (v >= min) this.nodeLocations.set(k, v-1); });
  }
  
  private removeConnectionsAt(index: number) {
    this.connections.forEach(r => r.splice(index, 1));
    this.connections.splice(index, 1);
  }
  
  private insertConnectionsAt(index: number) {
    this.connections.forEach(r => r.splice(index, 0, 0));
    const newRow = _.times(this.connections.length+1, _.constant(0));
    this.connections.splice(index, 0, newRow);
  }
  
  private incrementConnections(node: NodeType, index: number) {
    this.getConnectionIndexes(node).forEach(j => {
      this.connections[index][j]++;
      if (index != j) this.connections[j][index]++;
    });
  }
  
  private decrementConnections(node: NodeType, index: number) {
    this.getConnectionIndexes(node).forEach(j => {
      this.connections[index][j]--;
      if (index != j) this.connections[j][index]--;
    });
  }
  
  private getConnectionIndexes(node: NodeType) {
    node = this.graph.getNode(node.id);
    const adjacents = this.graph.getDirectAdjacents(node);
    const connections = adjacents.map(a =>
      _.uniq(this.graph.findEdgesBetween(node, a)).length);
    const locations = adjacents.map(a => this.nodeLocations.get(a.id));
    return _.flatten(locations.map((l,i) =>
      _.times(connections[i], _.constant(l)))).filter(i => i != null);
  }
  
  private inRange(index: number) {
    return 0 <= index && index < this.partitions.length;
  }
  
}

function calculateConnectionMatrix<NodeType extends Node>(
    graph: DirectedGraph<NodeType>, partitions: NodeType[][]): number[][] {
  //assumes the nodes in the sequence may be clones of the nodes in the graph
  const nodes = _.zipObject(graph.getNodes().map(n => n.id), graph.getNodes());
  const halfMatrix = partitions.map((t,i) => partitions.map((s,j) => {
    if (i > j) return 0;
    const tn = t.map(n => nodes[n.id]);
    const sn = s.map(n => nodes[n.id]);
    return _.uniq(_.flatten(_.flatten(
      tn.map(t => sn.map(s => graph.findEdgesBetween(t,s)))))).length;
  }));
  //copy below diagonal (symmetric)
  return halfMatrix.map((t,i) => t.map((s,j) => i > j ? halfMatrix[j][i] : s));
}