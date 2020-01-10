import * as _ from 'lodash';
import { DirectedGraph } from '../graphs/graph-theory';
import { getPartitionConnectionMatrix } from '../graphs/graph-analysis';
import { SegmentNode, SequenceImprovementOptions, SeqConstImprovementOptions } from './types';
import { getCompletedNumberArray2 } from './util';

export function improveSequence(sequence: SegmentNode[][],
    graph: DirectedGraph<SegmentNode>, options: SequenceImprovementOptions) {
  
  sequence = _.clone(sequence.map(t => _.clone(t)));
  
  if (options.merge) {
    //merge neighboring slices where possible
    const tempLength = sequence.length;
    sequence = mergeNeighboringPartitions(sequence);
    console.log("partitions merged", tempLength-sequence.length);
  }
  
  //SEPARATE THIS OUT AT SOME POINT (RATHER TOGETHER WITH ADD SEGMENTS...)
  if (options.missing) {
    addMissing(sequence, graph);
  }
  
  if (options.missingIgnore) {
    addMissing(sequence, graph, false, true);
  }
  
  if (options.blurs) {
    //remove all with connections to neighboring slices
    const blurs = _.flatten(sequence.map((t,i) => i < sequence.length-1 ?
      getInterGroupEdges(t, sequence[i+1], graph).map(e => e.source) : []));
    console.log("blurs removed", blurs.length);
    sequence = sequence.map(t => t.filter(n => blurs.indexOf(n) < 0));
  }
  
  if (options.cycles) {
    //remove all nodes not in cycles
    let tempNodeCount = _.flatten(sequence).length;
    sequence = sequence.map(t =>
      graph.getSubgraph(t).pruneEdgesNotInCycles().pruneIsolatedNodes().getNodes())
    const currentNodeCount = _.flatten(sequence).length;
    console.log("non-cycles removed", tempNodeCount-currentNodeCount);
  }
  
  if (options.minSizeFactor) {
    //remove all time points with too few nodes
    let tempNodeCount = _.flatten(sequence).length;
    let max = _.max(sequence.map(t => t.length));
    sequence = _.clone(sequence.filter(t => t.length > max/options.minSizeFactor));
    /*const smallest = _.sortBy(currentSequence, t => t.length).slice(0,currentSequence.length/4);
    currentSequence = currentSequence.filter(t => smallest.indexOf(t) < 0);*/
    const currentNodeCount = _.flatten(sequence).length;
    console.log("small removed", tempNodeCount-currentNodeCount);
    console.log("current count", currentNodeCount);
  }
  
  return sequence;
}

//constant cardinality
export function improveSequenceConstant(sequence: SegmentNode[][],
    graph: DirectedGraph<SegmentNode>, options: SeqConstImprovementOptions) {
  
  sequence = _.clone(sequence.map(t => _.clone(t)));
  
  if (options.swap) {
    const matrix = getPartitionConnectionMatrix(sequence, graph);
    const coords = matrix.map((r,i) => r.findIndex((v,j) => j > i && v > 0));
    const replaced = [];
    coords.forEach((j,i) => {
      if (j >= 0) {
        const ijc = sequence[i].map(n =>
          graph.getAdjacents(n).filter(a => sequence[j].indexOf(a) >= 0));
        const jjc = sequence[j].map(n =>
          graph.getAdjacents(n).filter(a => sequence[j].indexOf(a) >= 0));
        if (_.flatten(ijc).length == 1) {
          const ii = ijc.findIndex(c => c.length > 0);
          const jj = sequence[j].findIndex(n => n.version === sequence[i][ii].version);
          //console.log(ii, jj, ijc[ii], jjc[jj]);
          if (jj >= 0 && ijc[ii].length > jjc[jj].length) {
            sequence[j][jj] = sequence[i][ii];
            sequence[i].splice(ii, 1);
            replaced.push(sequence[j][jj]);
          } else if (jj < 0) {
            sequence[j].push(sequence[i][ii]);
            sequence[i].splice(ii, 1);
          }
        }
      }
    });
    console.log("swapped", replaced.length)
    addSegmentsAtBestSpots(replaced, sequence, graph, false, true);
    addSegmentsAtBestSpots(replaced, sequence, graph, true, true);
  }
  
  if (options.slide) {
    const INCL_DISCONN = true;
    const adjacents = sequence.map(s => s.map(n => graph.getDirectAdjacents(n)));
    const connections = adjacents.map(as => as.map(a =>
      sequence.map(s => s.filter(n => _.find(a, m => m.id === n.id)).length)));
    const minMax = INCL_DISCONN ? 0 : 1;
    const alts = _.flatten(_.flatten(connections.map((r,i) => r.map((cs,j) => {
      const max = _.max(cs);
      return cs.map((c,i2) => c === max && max >= minMax && i2 !== i ? i2 : -1)
        .filter(i2 => i2 >= 0).map(i2 => [sequence[i][j].version,i,i2,i2-i]);
    })))).filter(a=>a.length>0);
    const maxVersion = _.max(_.flatten(sequence).map(n => n.version));
    const altsByVersion = _.range(0, maxVersion+1).map(v =>
      alts.filter(a => a[0] === v));
    
    const longest = altsByVersion.map((as,v) => {
      const byVector = _.groupBy(as, a => a[3]);
      const gaps = sequence.map((s,i) => !s.find(n => n.version === v) ? i : null).filter(i=>i);
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
            x+a[3] < 0 || x+a[3] > sequence.length //can be pushed out of range
            || recMoveable(as, x, gaps) //empty or can be moved by the same vector
          )
      })})
      //REMOVE ALL OUT OF BOUNDS....
      .map(l =>
        l.filter(a=>0 <= a[1] && a[1] < sequence.length && 0 <= a[2] && a[2] < sequence.length));
      
      //if (v == 28) console.log(JSON.stringify(possible))
      
      const max = _.max(possible.map(v => v.length));
      return possible.find(s => s.length === max);
    }).filter(l=>l && l.length > 0).map(l =>
      ({first: _.first(l)[1], last: _.last(l)[1], delta: _.first(l)[3], version: _.first(l)[0]}));
    console.log(JSON.stringify(longest.map(l=>l?l.last-l.first+1:0)))
    
    //NOW SLIDE!!!!
    //const chosen = _.reverse(_.sortBy(longest, l => l.last-l.first)).slice(0, 2);
    const chosen = _.sampleSize(longest, 2);
    //console.log(chosen.map(c => c.version))
    chosen.forEach(l => {
      const range = l.delta < 0 ? _.range(l.first, l.last+1) : _.range(l.last, l.first-1, -1);
      range.forEach(i => moveNode(sequence, l.version, i, i+l.delta));
    });
    console.log("nodes slid", _.sum(chosen.map(l => l.last-l.first+1)))
  }
  
  return sequence;
}

function moveNode(sequence: SegmentNode[][], version: number, from: number, to: number) {
  if (0 <= to && to < sequence.length && 0 <= from && from < sequence.length) {
    const toIndex = sequence[to].findIndex(n => n.version === version);
    if (toIndex >= 0) sequence[to].splice(toIndex, 1);
    const fromIndex = sequence[from].findIndex(n => n.version === version);
    if (fromIndex >= 0) sequence[to].push(sequence[from].splice(fromIndex, 1)[0]);
    console.log(JSON.stringify(sequence.map(s =>
      s.filter(n => n.version === version).length)), from, to, fromIndex, toIndex)
  }
}

function mergeNeighboringPartitions(partitions: SegmentNode[][]): SegmentNode[][] {
  return partitions.reduce<SegmentNode[][]>((p,t,i) =>
    i > 0 && _.last(p) && differentVersions(t, _.last(p)) ?
      p.map(s => s === _.last(p) ? _.concat(s, t) : s)
      : _.concat(p,[t]), []);
}

export function addMissing(sequence: SegmentNode[][], graph: DirectedGraph<SegmentNode>,
    insertSegments?: boolean, ignoreAdjacents?: boolean) {
  //add any other missing nodes wherever most appropriate
  let missing = _.differenceBy(graph.getNodes(), _.flatten(sequence), n => n.id);
  console.log("missing", missing.length);
  while (missing.length > 0) {
    const added = addSegmentsAtBestSpots(missing, sequence, graph, insertSegments, ignoreAdjacents);
    if (added.length > 0) {
      missing = _.difference(missing, added);
      //console.log("m", missing.length)
    } else break;
  }
  console.log("still missing", missing.length);
}

function addSegmentsAtBestSpots(segments: SegmentNode[],
    sequence: SegmentNode[][], graph: DirectedGraph<SegmentNode>,
    insert?: boolean, ignoreAdjacents?: boolean) {
  const added: SegmentNode[] = [];
  _.sortBy(segments, s => s.id).forEach(n => {
    //console.log(n.id)
    //all current times for version
    const times = sequence.map(t =>
      _.min(t.filter(m => m.version === n.version).map(m => m.time)));
    //console.log("times", JSON.stringify(times))
    //gaps filled
    const filled = getCompletedNumberArray2(times);
    //console.log("filled", JSON.stringify(filled))
    const places = times.map((_,i) =>
      !times.slice(0,i+1).some(t => t > n.time)
      && !times.slice(i).some(t => t < n.time));
    //console.log("places", JSON.stringify(places))
    const adjacents = sequence.map((t,i) => places[i] ?
     (ignoreAdjacents ? 1 : graph.getDirectAdjacents(n).filter(a => t.indexOf(a) >= 0).length)
     : 0);
    const dists = sequence.map((_,i) => Math.abs(filled[i]-n.time));
    const maxAdj = _.max(adjacents);
    if (maxAdj > 0) {
      const candidateIndexes = adjacents
        .map((a,i) => a === maxAdj ? i : null).filter(i => i != null);
      const ratings = sequence.map((_t,i) =>
        candidateIndexes.indexOf(i) >= 0 ? 1/(dists[i]+1) : 0);
      //console.log("matches", JSON.stringify(matches))
      const max = _.max(ratings);
      if (max > 0) {
        const index = ratings.indexOf(max);
        sequence[index].push(n);
        added.push(n);
      }
    } else if (insert) {
      const next = sequence.find(t =>
        t.find(m => m.version === n.version && m.time > n.time) != null);
      if (next) {
        const index = sequence.indexOf(next);
        //console.log("next", n.id, next.filter(m=>m.version === n.version).map(m=>m.id), index, sequence.length)
        if (index > 0 && !sequence[index-1].find(m => m.version === n.version)) {
          sequence[index-1].push(n);
          /*console.log(JSON.stringify(sequence[index-1].map(n=>n.id)),
            JSON.stringify(sequence[index].map(n=>n.id)))*/
          //console.log(index, JSON.stringify(sequence.slice(index-2, index+1).map(s=>s.map(n=>n.id))))
        } else {
          //console.log("splice", n.id, index)
          sequence.splice(index, 0, [n]);
        }
      } else {
        const previous = _.reverse(_.clone(sequence)).find(t =>
          t.find(m => m.version === n.version && m.time < n.time) != null);
        if (!previous) console.log("none", n.id)
        if (previous) {
          //console.log("prev", n.id, previous.filter(m=>m.version == n.version).map(m=>m.id))
          const index = sequence.indexOf(previous);
          if (index >= 0 && index < sequence.length-1) {
            if (!sequence[index+1].find(m => m.version === n.version)) {
              sequence[index+1].push(n);
              //console.log(index, sequence.slice(index, index+3).map(s=>s.map(n=>n.id)))
            } else {
              sequence.splice(index+1, 0, [n]);
              //console.log(index, JSON.stringify(sequence.slice(index, index+2).map(s=>s.map(n=>n.id))))
            }
          } else {
            sequence.push([n]);
          }
        }
      }
      added.push(n);
    }
  });
  return added;
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