import * as _ from 'lodash';
import { DirectedGraph } from '../graphs/graph-theory';
import { SegmentNode, SequenceValidityOptions } from './types';

//make order of these constraints flexible at some point!
export function ensureSequenceValidity(sequence: SegmentNode[][],
    graph: DirectedGraph<SegmentNode>, options: SequenceValidityOptions) {
  
  let messages: string[] = [];
  
  if (options.connected) {
    //then remove all nodes with no connections to their own slice
    let nodeCount = _.flatten(sequence).length;
    sequence = sequence.map(t => graph.getSubgraph(t).pruneIsolatedNodes().getNodes());
    messages.push("disconnected removed " + (nodeCount-_.flatten(sequence).length));
  }
  
  if (options.component) {
    //then keep only largest connected components per slice
    const minorComponents = _.flatten(sequence.map(t =>
      _.flatten(graph.getSubgraph(t).getConnectedComponents().slice(1))));
    messages.push("minor components removed " + minorComponents.length);
    sequence = sequence.map(t => t.filter(n => minorComponents.indexOf(n) < 0));
  }
  
  if (options.affinity) {
    //then remove all nodes not in slices to which they have the most connections
    const misplaced = getInconsistencies(sequence, graph);
    messages.push("stray nodes removed " + misplaced.length);
    sequence = sequence.map(t => t.filter(n => misplaced.indexOf(n) < 0));
  }
  
  if (options.versions) {
    //then remove all nodes in slices with more than one per version
    const unique = sequence.map(t => _.uniqBy(t, n => n.version));
    const multi = _.difference(_.flatten(sequence), _.flatten(unique));
    messages.push("multiples removed " + multi.length);
    sequence = unique;
  }
  
  if (options.uniqueness) {
    //remove all nodes reoccurring more than once
    //works only if multiples removed before!
    const unique = _.uniqBy(_.flatten(sequence), n => n.id);
    const filtered = sequence.map(t => t.filter(n => {
      const index = _.findIndex(unique, m => m.id === n.id);
      if (index >= 0) {
        unique.splice(index, 1);
        return true;
      }
    }));
    messages.push("non-unique removed " +
      (_.flatten(sequence).length - _.flatten(filtered).length));
    sequence = filtered;
  }
  
  if (options.order) {
    //remove all nodes involved in contradictions (ensure strict order)
    const removed = getContradictions(sequence, true);
    messages.push("order contradictions removed " + removed.length);
    sequence = sequence.map(t => t.filter(n => removed.indexOf(n) < 0));
  }
  
  if (options.minSizeFactor) {
    //remove all time points with too few nodes
    let tempNodeCount = _.flatten(sequence).length;
    let max = _.max(sequence.map(t => t.length));
    sequence = _.clone(sequence.filter(t => t.length > max/options.minSizeFactor));
    const currentNodeCount = _.flatten(sequence).length;
    messages.push("small removed " + (tempNodeCount-currentNodeCount));
  }
  
  console.log(messages.join(", "));
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

function getInconsistencies(timeline: SegmentNode[][], graph: DirectedGraph<SegmentNode>): SegmentNode[] {
  return _.flatten(timeline.map((t,i) => t.filter(n => {
    const adjacents = graph.getDirectAdjacents(n);
    const connections =
      timeline.map(t => t.filter(n => _.includes(adjacents, n)).length);
    return connections[i] < _.max(connections);
  })));
}