import * as _ from 'lodash';
import { GraphPartition } from '../graphs/graph-partition';
import { SegmentNode, SequenceValidityOptions } from './types';

//make order of these constraints flexible at some point!
export function ensureSequenceValidity(sequence: GraphPartition<SegmentNode>,
    options: SequenceValidityOptions) {
  
  sequence = sequence.clone();
  let messages: string[] = [];
  
  if (options.connected) {
    //then remove all nodes with no connections to their own slice
    const isolated = _.flatten(sequence.getPartitions().map(t =>
      sequence.getGraph().getSubgraph(t).getIsolatedNodes()));
    isolated.forEach(n => sequence.removeNode(n));
    messages.push("disconnected removed " + isolated.length);
  }
  
  if (options.component) {
    //then keep only largest connected components per slice
    const nodesInMinorComponents = _.flatten(sequence.getPartitions().map(t =>
      _.flatten(sequence.getGraph().getSubgraph(t).getConnectedComponents().slice(1))));
    nodesInMinorComponents.forEach(n => sequence.removeNode(n));
    messages.push("minor components removed " + nodesInMinorComponents.length);
  }
  
  if (options.affinity) {
    //then remove all nodes not in slices to which they have the most connections
    const unaffine = getInconsistencies(sequence);
    unaffine.forEach(n => sequence.removeNode(n));
    messages.push("stray nodes removed " + unaffine.length);
  }
  
  if (options.versions) {
    //then remove all nodes in slices with more than one per version
    const partitions = sequence.getPartitions();
    const unique = partitions.map(t => _.uniqBy(t, n => n.version));
    const multiples = _.difference(_.flatten(partitions), _.flatten(unique));
    multiples.forEach(n => sequence.removeNode(n));
    messages.push("multiples removed " + multiples.length);
  }
  
  if (options.uniqueness) {
    //remove all nodes reoccurring more than once
    const partitions = sequence.getPartitions();
    const unique = _.uniqBy(_.flatten(partitions), n => n.id);
    const multiples = _.difference(_.flatten(partitions), _.flatten(unique));
    multiples.forEach(n => sequence.removeNode(n));
    messages.push("non-unique removed " + multiples.length);
  }
  
  if (options.order) {
    //remove all nodes involved in contradictions (ensure strict order)
    const disorder = getContradictions(sequence.getPartitions(), true);
    disorder.forEach(n => sequence.removeNode(n));
    messages.push("order contradictions removed " + disorder.length);
  }
  
  sequence.removeEmptyPartitions();
  
  //console.log(messages.join(", "));
  return sequence;
}

//includeAll false => only later points that contradict earlier are returned
//true => earlier points part of contradiction are also included
function getContradictions(timeline: SegmentNode[][], includeAll: boolean): SegmentNode[] {
  const versions = _.uniq(_.flatten(timeline.map(t => t.map(n => n.version))));
  return _.uniq(_.flatten(versions.map(v => {
    //get only earliest time point per version in each slice
    const ts = timeline.map(t =>
      _.sortBy(t.filter(n => n.version === v), n => n.time)[0]).filter(n => n);
    //keep all nodes with contradictory times
    return ts.reduce<SegmentNode[]>((contras, n, i) => {
      if (i > 0) {
        const earlyLater = ts.slice(0,i).find(t => t.time > n.time);
        if (earlyLater) {
          return _.concat(contras, includeAll ? [earlyLater, n] : [n]);
        }
      }
      return contras;
    }, []);
  })));
}

function getInconsistencies(sequence: GraphPartition<SegmentNode>): SegmentNode[] {
  const partitions = sequence.getPartitions();
  return _.flatten(partitions.map((t,i) => t.filter(n => {
    const adjacents = sequence.getGraph().getDirectAdjacents(n);
    const connections =
      partitions.map(t => t.filter(n => _.includes(adjacents, n)).length);
    return connections[i] < _.max(connections);
  })));
}