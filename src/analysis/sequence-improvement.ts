import * as _ from 'lodash';
import { DirectedGraph } from '../graphs/graph-theory';
import { GraphPartition } from '../graphs/graph-partition';
import { SegmentNode, SequenceImprovementOptions } from './types';
import { getCompletedNumberArray2, allIndexesOf, allIndexesWith } from './util';

export function improveSequence(sequence: GraphPartition<SegmentNode>,
    options: SequenceImprovementOptions): GraphPartition<SegmentNode>[] {
  
  sequence = sequence.clone();
  let result: GraphPartition<SegmentNode>[] = [];
  
  if (options.merge) {
    const previousSize = sequence.getPartitionCount();
    mergeNeighboringPartitions(sequence);
    console.log("partitions merged", previousSize-sequence.getPartitionCount());
  }
  
  if (options.swap) {
    const numSwapped = swapSegments(sequence);
    console.log("swapped", numSwapped);
  }
  
  if (options.slide) {
    result = slideSegments(sequence, true);
    //console.log("nodes slid", numSlid);
  }
  
  //SEPARATE THIS OUT AT SOME POINT (RATHER TOGETHER WITH ADD SEGMENTS...)
  if (options.missing) {
    result = addMissing2(sequence);
  }
  
  if (options.missingIgnore) {
    result = addMissing2(sequence, false, true);
  }
  
  if (options.missingInsert) {
    result = addMissing2(sequence, true, true);
  }
  
  if (options.blurs) {
    //remove all with connections to neighboring slices
    const partitions = sequence.getPartitions();
    const blurs = _.flatten(partitions.slice(0, -1).map((t,i) =>
      getInterGroupEdges(t, partitions[i+1], sequence.getGraph()).map(e => e.source)));
    blurs.forEach(b => sequence.removeNode(b));
    console.log("blurs removed", blurs.length);
  }
  
  if (options.cycles) {
    //remove all nodes not in cycles
    const noncyc = _.flatten(sequence.getPartitions()
      .map(t => sequence.getGraph().getSubgraph(t).getNodesNotInCycles()));
    noncyc.forEach(b => sequence.removeNode(b));
    console.log("non-cycles removed", noncyc.length);
  }
  
  if (options.minSizeFactor) {
    //remove all time points with too few nodes
    const minSize = sequence.getMaxPartitionSize()/options.minSizeFactor;
    const tooSmall =
      allIndexesWith(sequence.getPartitions(), p => p.length < minSize);
    const removed = sequence.removePartitions(tooSmall);
    console.log("small partitions removed", removed.length);
  }
  
  if (!result) result = [sequence];
  return result;
}

function moveNode(sequence: GraphPartition<SegmentNode>,
    version: number, from: number, to: number) {
  sequence.removeNodeAt(to, n => n.version === version);
  const toMove = sequence.findNodeAt(from, n => n.version === version);
  if (toMove) sequence.moveNode(toMove, to);
  /*console.log(JSON.stringify(sequence.getPartitions().map(s =>
    s.filter(n => n.version === version).length)), from, to);*/
}

function mergeNeighboringPartitions(sequence: GraphPartition<SegmentNode>) {
  sequence.mergeNeighboringPartitions(differentVersions);
}

function slideSegments(sequence: GraphPartition<SegmentNode>,
    includeDisconnected: boolean): GraphPartition<SegmentNode>[] {
  const partitions = sequence.getPartitions();
  const adjacents = partitions.map(s => s.map(n =>
    sequence.getGraph().getDirectAdjacents(n)));
  const connections = adjacents.map(as => as.map(a =>
    partitions.map(s => s.filter(n => _.find(a, m => m.id === n.id)).length)));
  const minMax = includeDisconnected ? 0 : 1;
  const alts = _.flatten(_.flatten(connections.map((r,i) => r.map((cs,j) => {
    const max = _.max(cs);
    return cs.map((c,i2) => c === max && max >= minMax && i2 !== i ? i2 : -1)
      .filter(i2 => i2 >= 0).map(i2 => [partitions[i][j].version,i,i2,i2-i]);
  })))).filter(a=>a.length>0);
  const maxVersion = _.max(_.flatten(partitions).map(n => n.version));
  const altsByVersion = _.range(0, maxVersion+1).map(v =>
    alts.filter(a => a[0] === v));
  
  const longest = altsByVersion.map((as,v) => {
    const byVector = _.groupBy(as, a => a[3]);
    const gaps = partitions.map((s,i) => !s.find(n => n.version === v) ? i : null)
      .filter(i=>i != null);
    //if (v == 28) console.log(JSON.stringify(gaps))
    
    const recMoveable = (as: number[][], x: number, gaps: number[]) => {
      const target = as.find(a => a[1] === x);
      return _.includes(gaps, x) ||
        (target != null && recMoveable(as, target[2], gaps))
    };
    
    const possible = _.values(byVector).map(as => {
      /*const relevantGaps = gaps.filter(i => !as.find(a => a[1] === i))
        .map(i => [v,i,i+as[0][3],as[0][3]]);
      const all = _.sortBy(_.concat(as, relevantGaps), a => a[1]);
      if (v == 0) console.log(JSON.stringify(all))*/
      return as.filter(a => {
        const range = a[1] < a[2] ? _.range(a[1]+1, a[2]+1) : _.range(a[1]-1, a[2]-1, -1);
        return range.every(x => 
          x+a[3] < 0 || x+a[3] > partitions.length //can be pushed out of range
          || recMoveable(as, x, gaps) //empty or can be moved by the same vector
        )
    })})
    //REMOVE ALL OUT OF BOUNDS....
    .map(l => l.filter(a => 0 <= a[1] && a[1] < partitions.length
      && 0 <= a[2] && a[2] < partitions.length));
    
    //if (v == 28) console.log(JSON.stringify(possible))
    
    const max = _.max(possible.map(v => v.length));
    return possible.find(s => s.length === max);
  }).filter(l=>l && l.length > 0).map(l =>
    ({first: _.first(l)[1], last: _.last(l)[1], delta: _.first(l)[3], version: _.first(l)[0]}));
  //console.log(JSON.stringify(longest.map(l=>l?l.last-l.first+1:0)))
  
  //NOW SLIDE!!!!
  //const chosen = _.reverse(_.sortBy(longest, l => l.last-l.first)).slice(0, 3);
  //const chosen = _.sampleSize(longest, 2);
  //console.log(chosen.map(c => c.version))
  return longest.map(l => {
    const seq = sequence.clone();
    const range = l.delta < 0 ? _.range(l.first, l.last+1) : _.range(l.last, l.first-1, -1);
    range.forEach(i => moveNode(seq, l.version, i, i+l.delta));
    return seq;
  });
  //return _.sum(chosen.map(l => l.last-l.first+1));
}

export function swapSegments(sequence: GraphPartition<SegmentNode>) {
  const matrix = sequence.getConnectionMatrix();
  const partitions = sequence.getPartitions();
  const coords = matrix.map((r,i) => r.findIndex((v,j) => j > i && v > 0));
  const replaced = [];
  coords.forEach((j,i) => {
    if (j >= 0) {
      const ijc = partitions[i].map(n =>
        sequence.getGraph().getAdjacents(n).filter(a => partitions[j].indexOf(a) >= 0));
      const jjc = partitions[j].map(n =>
        sequence.getGraph().getAdjacents(n).filter(a => partitions[j].indexOf(a) >= 0));
      if (_.flatten(ijc).length == 1) {
        const ii = ijc.findIndex(c => c.length > 0);
        const jj = partitions[j].findIndex(n => n.version === partitions[i][ii].version);
        //console.log(ii, jj, ijc[ii], jjc[jj]);
        if (jj >= 0 && ijc[ii].length > jjc[jj].length) {
          partitions[j][jj] = partitions[i][ii];
          partitions[i].splice(ii, 1);
          replaced.push(partitions[j][jj]);
        } else if (jj < 0) {
          partitions[j].push(partitions[i][ii]);
          partitions[i].splice(ii, 1);
        }
      }
    }
  });
  return replaced.length;
}

export function addMissing(sequence: GraphPartition<SegmentNode>,
    insertSegments?: boolean, ignoreAdjacents?: boolean) {
  //add any other missing nodes wherever most appropriate
  const present = _.flatten(sequence.getPartitions());
  let missing = _.differenceBy(sequence.getGraph().getNodes(), present, n => n.id);
  //console.log("missing", missing.length);
  while (missing.length > 0) {
    const chunks = _.chunk(missing, missing.length/10);
    const added = addSegmentsAtBestSpots(missing, sequence, insertSegments, ignoreAdjacents);
    if (added.length > 0) {
      missing = _.difference(missing, added);
    } else break;
  }
  //console.log("still missing", missing.length);
}

export function addMissing2(sequence: GraphPartition<SegmentNode>,
    insertSegments?: boolean, ignoreAdjacents?: boolean) {
  //add any other missing nodes wherever most appropriate
  const present = _.flatten(sequence.getPartitions());
  let missing = _.differenceBy(sequence.getGraph().getNodes(), present, n => n.id);
  //console.log("missing", missing.length);
  return _.chunk(missing, missing.length/10).map(c => {
    const seq = sequence.clone();
    addSegmentsAtBestSpots(c, seq, insertSegments, ignoreAdjacents);
    return seq;
  });
    
    
  //console.log("still missing", missing.length);
}

function add(segments: SegmentNode[], sequence: GraphPartition<SegmentNode>,
    insertSegments?: boolean, ignoreAdjacents?: boolean) {
  
}

//returns an array with all added segments
function addSegmentsAtBestSpots(segments: SegmentNode[],
    sequence: GraphPartition<SegmentNode>,
    insert?: boolean, ignoreAdjacents?: boolean): SegmentNode[] {
  return _.sortBy(segments, s => s.id).filter(n =>
    addSegmentAtBestSpot(n, sequence, insert, ignoreAdjacents));
}

function addSegmentAtBestSpot(segment: SegmentNode,
    sequence: GraphPartition<SegmentNode>,
    insert?: boolean, ignoreAdjacents?: boolean): boolean {
  const partitions = sequence.getPartitions(); 
  //all times for version currently in sequence
  const times = partitions.map(t =>
    _.min(t.filter(m => m.version === segment.version).map(m => m.time)));
  //times with temporal gaps filled accordingly
  const filled = getCompletedNumberArray2(times);
  //potential locations where the given segment can be inserted
  const places = times.map((_,i) =>
    !times.slice(0,i+1).some(t => t > segment.time)
    && !times.slice(i).some(t => t < segment.time));
  //number of adjacents to the given segment in all potential locations
  const adjacents = places.map((p,i) => !p ? 0 : ignoreAdjacents ? 1
    : numDirectAdjacents(segment, partitions[i], sequence.getGraph()));
  const maxAdj = _.max(adjacents);
  if (maxAdj > 0) {
    const candidateIndexes = allIndexesOf(adjacents, maxAdj);
    const dists = filled.map(f => Math.abs(f-segment.time));
    const ratings = dists.map((d,i) =>
      _.includes(candidateIndexes, i) ? 1/(d+1) : 0);
    const max = _.max(ratings);
    if (max > 0) {
      return sequence.addNode(segment, ratings.indexOf(max));
    }
  }
  if (insert) {
    return insertSegment(segment, sequence);
  }
}

function insertSegment(segment: SegmentNode,
    sequence: GraphPartition<SegmentNode>) {
  const partitions = sequence.getPartitions();
  const next = partitions.find(t =>
    t.find(m => m.version === segment.version && m.time > segment.time) != null);
  if (next) {
    const index = partitions.indexOf(next);
    return sequence.insertPartition([segment], index);
  }
  const previous = _.reverse(_.clone(partitions)).find(t =>
    t.find(m => m.version === segment.version && m.time < segment.time) != null);
  if (previous) {
    const index = partitions.indexOf(previous);
    sequence.insertPartition([segment], index+1);
  }
}

function numDirectAdjacents(node: SegmentNode, nodes: SegmentNode[],
    graph: DirectedGraph<SegmentNode>) {
  return graph.getDirectAdjacents(node).filter(a => _.includes(nodes, a)).length;
}

function differentVersions(nodes1: SegmentNode[], nodes2: SegmentNode[]) {
  return _.intersection(nodes1.map(n => n.version), nodes2.map(n => n.version))
    .length === 0;
}

//returns all edges between the two given groups
export function getInterGroupEdges(group1: SegmentNode[], group2: SegmentNode[],
    graph: DirectedGraph<SegmentNode>) {
  return _.differenceBy(graph.getSubgraph(_.concat(group1, group2)).getEdges(),
    _.concat(graph.getSubgraph(group1).getEdges(), graph.getSubgraph(group2).getEdges()),
    e => e.source.id+e.target.id);
}