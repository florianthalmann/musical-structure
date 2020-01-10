import * as _ from 'lodash';
import * as fs from 'fs';
import { Pattern, MultiStructureResult } from 'siafun';
const SimpleLinearRegression = require('ml-regression-simple-linear');
import { DirectedGraph, Node, saveGraph, loadGraph } from './graph-theory';
import { getPartition, GROUP_RATING, GroupingCondition, getBestGroups,
  removeGroupAndNodes } from './graph-analysis';
import { saveJsonFile, loadJsonFile } from '../files/file-manager';

export interface SegmentNode extends Node {
  point: number[],
  version: number,
  time: number
}

const DIFF_VERSIONS: GroupingCondition<SegmentNode>
  = (n, os) => os.every(o => o.version !== n.version);

const MIN_DISTANCE = 8;
const DIFF_VERSIONS_MIN_DIST: GroupingCondition<SegmentNode>
  = (n, os) => !os.some(o => o.version == n.version
    && Math.abs(o.time-n.time) < MIN_DISTANCE);

const DIFF_VERSIONS_MAX_EDGES: GroupingCondition<SegmentNode>
  = (n, os, g) => {
    if (os[0].version === n.version) return false; //do not replace first node (center)
    if (os.every(o => o.version !== n.version)) return true;
    const existing = os.find(o => o.version === n.version);
    const edges1 = g.getAllEdges(os);
    const edges2 = g.getAllEdges(os.map(o => o === existing ? n : o));
    if (edges1.length < edges2.length) {
      os.splice(os.indexOf(existing), 1, n);
      return true;
    }
    return false;
  }


export function inferStructureFromAlignments(versionPairs: [number,number][],
    results: MultiStructureResult[], filebase?: string) {

  const timeline = constructTimelineFromAlignments(versionPairs, results,
    DIFF_VERSIONS, false, filebase);
  
  const fullGraph: DirectedGraph<SegmentNode> =
    createSegmentGraphFromAlignments(versionPairs, results, false, filebase+'-graph.json');
  
  const connectionMatrix = getConnectionMatrix(timeline, fullGraph);

  if (filebase) {
    saveJsonFile(filebase+'-matrix.json', connectionMatrix);
    //saveGraph(filebase+'-graph-seg.json', fullGraph.getSubgraph(_.flatten(timeline.slice(75, 79))));
  }
  //console.log(timeline.slice(75, 79).map(t => t.map(n => n.id)));

  return timeline;
}

function constructTimelineFromAlignments(versionPairs: [number,number][],
    results: MultiStructureResult[], groupingCondition: GroupingCondition<SegmentNode>,
    postprocess = true, filebase?: string) {
  //const MIN_COMPONENT_SIZE = _.uniq(_.flatten(versionPairs)).length/8;
  
  const path = filebase ? (postprocess ? filebase+'-procgraph.json' : filebase+'-graph.json'): null;
  const graph = createSegmentGraphFromAlignments(versionPairs, results, postprocess, path);
  
  console.log(graph.getSize())

  //divide graph into connected components
  //let components = getSegmentGraphPartitions(graph, MIN_COMPONENT_SIZE, groupingCondition);
  const partition = constructFullPartition(graph, groupingCondition, filebase);//iterativeGetIndexBasedPartition(graph, groupingCondition);

  //saveGraph('plots/d3/latest/slice2.json', graph.getSubgraph(components[0]));

  return constructTimeline(partition)//, MIN_COMPONENT_SIZE);
}

function getSegmentGraphPartitions(graph: DirectedGraph<SegmentNode>,
    minComponentSize = 0, groupingCondition: GroupingCondition<SegmentNode>) {
  //divide graph into connected components, filter out small ones
  let components = graph.getConnectedComponents();
  console.log("components", components.length);
  components = components.filter(c => c.length > minComponentSize)
    //.map(c => graph.getSubgraph(c).pruneEdgesNotInCycles());
  console.log("large", components.length, JSON.stringify(components.slice(0,20).map(c => c.length)), "...");
  console.log("non-unique", components.filter(c => !uniqueVersions(c)).length);

  //(previous technique based on cycles)
  //let grouped = components.map(c => groupByPositionAndCycles(graph.getSubgraph(c)));

  //partition connected components with more than one node per version
  components = _.flatten(components.map(c => !uniqueVersions(c) ? getPartition({
      graph: graph.getSubgraph(c),
      condition: groupingCondition,
      ratingMethod: GROUP_RATING.INTERNAL,
      maxDistance: 0
    }).map(g => g.members)
    : [c]));
  console.log("split", components.filter(c => !uniqueVersions(c)).length);
  console.log(components.slice(0,20).map(c => c.length));
  saveGraph('plots/d3/latest/best.json', graph.getSubgraph(components[1]));

  return components;
}

function constructFullPartition(graph: DirectedGraph<SegmentNode>,
    groupingCondition: GroupingCondition<SegmentNode>, filebase: string) {
  const path = filebase+'-timeline.json';
  let partition: SegmentNode[][];
  if (fs.existsSync(path)) {
    partition = loadJsonFile(path);
  } else {
    //partition = hillClimbConstructPartition(graph, groupingCondition);
    partition = iterativeGetIndexBasedPartition(graph, groupingCondition);
    saveJsonFile(path, partition);
  }
  partition = ensureSequenceValidity(partition, graph, {uniqueness: true});
  //add all missing while maintaining validity
  addMissing(partition, graph, false, true);
  /*addMissing(partition, graph, true, true);
  partition = ensureSequenceValidity(partition, graph, {affinity: true})
  partition = partition.filter(p=>p.length)
  addMissing(partition, graph, true, true);
  partition = ensureSequenceValidity(partition, graph, {affinity: true})
  partition = partition.filter(p=>p.length)
  addMissing(partition, graph, true, true);*/
  
  
  /*console.log(JSON.stringify(partition.map(p=>p.map(n=>n.version))));
  console.log(JSON.stringify(partition.map((p,i) => i > 0 ?
    _.intersectionBy(p, partition[i-1], n => n.version).map(n=>n.version) : [])));*/
  /*console.log(JSON.stringify(partition.map((p,i) => i > 0 ?
    _.intersectionBy(p, partition[i-1], n => n.version).map(n=>n.version).length : 0)));
  
  
  partition.forEach(printPartition);*/
  
  partition = hillClimbImprovePartition(partition, graph);
  //console.log(graph.getAdjacents(partition[i2][0]))
  return partition;
}

//without removing any nodes
function hillClimbImprovePartition(partition: SegmentNode[][],
    graph: DirectedGraph<SegmentNode>) {
  let bestSequence: SegmentNode[][] = partition;
  let currentSequence: SegmentNode[][] = partition;
  let bestRating = getSequenceRating(partition, graph);
  let pastRatings = [bestRating];
  console.log(bestRating)
  
  while (pastRatings.filter(r => r >= _.last(pastRatings)).length <= 5) {
    let candidates: SegmentNode[][][] = [];
    
    candidates.push(improveSequence(currentSequence, graph,
      {merge: true}));
    /*candidates.push(improveSequenceConstant(currentSequence, graph,
      {swap: true}));*/
    candidates.push(improveSequenceConstant(currentSequence, graph,
      {slide: true}));
    candidates.push(improveSequence(currentSequence, graph,
      {missingIgnore: true}));
    
    //should not be necessary!!!!!
    candidates = candidates.map(c => ensureSequenceValidity(c, graph,
      {versions: true, uniqueness: true, order: true}))
    
    console.log(JSON.stringify(candidates.map(c => _.uniq(_.flatten(c)).length)))
    
    //candidates = candidates.map(c => addSegmentsAtBestSpots(, sequence, graph, true, true));
    
    const ratings = candidates.map(c => getSequenceRating(c, graph));
    console.log(JSON.stringify(ratings))
    
    const max = _.max(ratings);
    if (max != null && max > bestRating) {
      currentSequence = candidates[ratings.indexOf(max)];
      bestSequence = _.cloneDeep(currentSequence);
      bestRating = max;
      console.log(_.flatten(currentSequence).length, getSequenceRating(currentSequence, graph));
      console.log(JSON.stringify(currentSequence.map(t => t.length)));
      //console.log(JSON.stringify(currentSequence.map(t => graph.getSubgraph(t).getEdges().length)))
    } else if (max != null) { //&& max > _.last(pastRatings)) {
      currentSequence = candidates[ratings.indexOf(max)];
    }
    pastRatings.push(max);
  }
  return bestSequence;
}

interface SeqConstImprovementOptions {
  merge?: boolean,
  slide?: boolean,
  swap?: boolean
}

//constant cardinality
function improveSequenceConstant(sequence: SegmentNode[][],
    graph: DirectedGraph<SegmentNode>, options: SeqConstImprovementOptions) {
  
  sequence = _.clone(sequence.map(t => _.clone(t)));
  
  if (options.swap) {
    const matrix = getConnectionMatrix(sequence, graph);
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

function hillClimbConstructPartition(graph: DirectedGraph<SegmentNode>,
    groupingCondition: GroupingCondition<SegmentNode>) {
  
  let bestSequence: SegmentNode[][] = [];
  let currentSequence: SegmentNode[][] = [];
  let bestRating = -Infinity;
  let pastRatings = [0];
  let minSizeFactor = 3;
  
  while (pastRatings.filter(r => r >= _.last(pastRatings)).length <= 5) {
    let candidates: SegmentNode[][][] = [];
    candidates.push(improveSequence(currentSequence, graph,
      {merge: true}));
    candidates.push(improveSequence(currentSequence, graph,
      {missing: true}));
    candidates.push(improveSequence(currentSequence, graph,
      {blurs: true}));
    /*candidates.push(improveSequence(currentSequence, graph,
      {blurs: true, missing: true}));*/
    candidates.push(improveSequence(currentSequence, graph,
      {cycles: true}));
    candidates.push(improveSequence(currentSequence, graph,
      {minSizeFactor: minSizeFactor}));
    /*candidates.push(ensureSequenceValidity(currentSequence, graph,
      {connected: true}));
    candidates.push(ensureSequenceValidity(currentSequence, graph,
      {affinity: true}));*/
    
    candidates = candidates.map(c => ensureSequenceValidity(c, graph,
      {versions: true, uniqueness: true, order: true, minSizeFactor: minSizeFactor}))//{connected: true, affinity: true, multiples: true, order: true }));
    
    const ratings = candidates.map(c => getSequenceRating(c, graph));
    console.log(JSON.stringify(ratings))
    
    const max = _.max(ratings);
    if (max != null && max > bestRating) {
      currentSequence = candidates[ratings.indexOf(max)];
      bestSequence = _.cloneDeep(currentSequence);
      bestRating = max;
      console.log(_.flatten(currentSequence).length, getSequenceRating(currentSequence, graph));
      console.log(JSON.stringify(currentSequence.map(t => t.length)));
      console.log(JSON.stringify(currentSequence.map(t => graph.getSubgraph(t).getEdges().length)))
    } else if (max != null && max > _.last(pastRatings)) {
      currentSequence = candidates[ratings.indexOf(max)];
    } else {
      const previousLength = currentSequence.length;
      candidates = [];
      while (!candidates.some(c => c.length > previousLength)) {
        candidates.push(addNewSegments(currentSequence, graph,
          {graphAdjacentsSearch: true, minSizeFactor: minSizeFactor,
            groupingCondition: groupingCondition, maxNumSegments: 5}));
        candidates.push(addNewSegments(currentSequence, graph,
          {indexNeighborSearch: true, minSizeFactor: minSizeFactor,
            groupingCondition: groupingCondition, maxNumSegments: 5}));
        if (!candidates.some(c => c.length > previousLength)) minSizeFactor++;
      }
      const ratings = candidates.map(c => c.length > previousLength ? getSequenceRating(c, graph) : 0);
      console.log(JSON.stringify(ratings))
      currentSequence = candidates[ratings.indexOf(_.max(ratings))];
    }
    pastRatings.push(max);
  }
  return bestSequence;
}

function iterativeGetIndexBasedPartition(graph: DirectedGraph<SegmentNode>,
    groupingCondition: GroupingCondition<SegmentNode>) {
  
  let minSizeFactor = 3;
  let currentSequence: SegmentNode[][] = [];
  let bestSequence: SegmentNode[][] = [];
  let previousNodeCounts = [];
  let currentNodeCount = 0;

  while (previousNodeCounts.filter(m => m >= currentNodeCount).length <= 10) {
    if (previousNodeCounts.filter(m => m >= currentNodeCount).length > 6) {
      minSizeFactor++;
      console.log("MIN SIZE FACTOR", minSizeFactor);
    }
    
    //ADD NEW SEGMENT PARTITIONS
    const quickSearch = currentSequence.length > 0
      && _.last(previousNodeCounts) !== currentNodeCount;
    currentSequence = addNewSegments(currentSequence, graph,
      {graphAdjacentsSearch: !quickSearch, indexNeighborSearch: quickSearch,
        minSizeFactor: minSizeFactor, groupingCondition: groupingCondition});
    
    //ADD IMPROVEMENTS
    currentSequence = improveSequence(currentSequence, graph,
      {merge: true, missing: true, blurs: true, minSizeFactor: minSizeFactor});
    
    //ENSURE VALIDITY
    currentSequence = ensureSequenceValidity(currentSequence, graph,
      {connected: true, affinity: true, versions: true, order: true });
    
    previousNodeCounts.push(currentNodeCount);
    currentNodeCount = getSequenceRating(currentSequence, graph)//_.flatten(currentSequence).length;
      
    //CHECK IF BETTER
    if (previousNodeCounts.every(m => currentNodeCount > m)) {
      console.log(currentNodeCount, getSequenceRating(currentSequence, graph));
      bestSequence = _.clone(currentSequence);
      console.log(JSON.stringify(currentSequence.map(t => t.length)));
      console.log(JSON.stringify(currentSequence.map(t => graph.getSubgraph(t).getEdges().length)));
    }
  }

  console.log(JSON.stringify(bestSequence.map(t =>
    graph.getSubgraph(t).getConnectedComponents().length)));

  /*//move nodes between neighboring bins if appropriate
  let neighboring = bestSequence.reduce<number>((n,s,i) =>
    i > 0 ? n+getInterGroupEdges(s, bestSequence[i-1], graph).length : 0, 0);
  let previousN = Infinity;
  while (neighboring < previousN) {
    bestSequence.forEach((t,i) => {
      if (i > 0) {
        const edges = getInterGroupEdges(t, bestSequence[i-1], graph);
        const sourceGraph = graph.getSubgraph(t);
        const targetGraph = graph.getSubgraph(bestSequence[i-1]);
        edges.forEach(e => {
          console.log(sourceGraph.getDirectAdjacents(e.source).length,
            targetGraph.getDirectAdjacents(e.source).length,
            sourceGraph.getDirectAdjacents(e.target).length,
            targetGraph.getDirectAdjacents(e.target).length);
        });
        neighboring = bestSequence.reduce<number>((n,s,i) =>
          i > 0 ? n+graph.getSubgraph(_.concat(s, bestSequence[i-1])).getEdges().length : 0, 0);
      }
    });
  }*/

  return bestSequence;
}

//assumes that the sequence is a valid one (no double occs, no double versions, lin ordered)
function getSequenceRating(sequence: SegmentNode[][], graph: DirectedGraph<SegmentNode>) {
  const numNodes = _.flatten(sequence).length;
  //const numSegs = sequence.length;
  const connectionMatrix = getConnectionMatrix(sequence, graph);
  const nonEmptyBins = _.flatten(connectionMatrix).filter(b => b > 0);
  /*const avgBinStrength = _.mean(nonEmptyBins);
  //proportion of horizontal adjacencies of nonzero bins
  const adjacentConns = _.flatten(connectionMatrix.map(r =>
      r.map((v,i) => i > 0 && v > 0 && r[i-1] > 0)))
    .filter(n => n).length/(1+nonEmptyBins.length);
  const binsTotal = _.sum(_.flatten(connectionMatrix));
  const adjacentConnsTotal = _.sum(_.flatten(connectionMatrix.map(r =>
      r.map((v,i) => i > 0 && v > 0 && r[i-1] > 0 ? Math.min(v, r[i-1]) : 0)))
    .filter(n => n));*/
  const diaProp = _.flatten(connectionMatrix.map((r,i) =>
      r.map((v,j) => i > 0 && j > 0 && v > 0 && connectionMatrix[i-1][j-1] > 0)))
    .filter(v => v).length/(1+nonEmptyBins.length);
  /*const loneDiagonals = _.flatten(connectionMatrix.map((r,i) =>
      r.map((v,j) => i > 0 && j > 0 && v > 0 && connectionMatrix[i-1][j-1] > 0 && r[i-1] == 0)))
    .filter(v => v).length/(1+nonEmptyBins.length);
  const adjDiagonals = _.flatten(connectionMatrix.map((r,i) =>
      r.map((v,j) => i > 0 && j > 0 && v > 0 && connectionMatrix[i-1][j-1] > 0 && r[i-1] > 0)))
    .filter(v => v).length/(1+nonEmptyBins.length);
  const mainDiagonal = connectionMatrix.map((r,i) => r.filter((_v,j) => i == j));
  //console.log(diagonals, loneDiagonals, adjacentBins, numNodes*loneDiagonals/(adjacentBins+1))
  const cleanliness = loneDiagonals / (adjacentConnsTotal / binsTotal + 1);
  const compactness = numNodes / numSegs;
  const connectedness = _.sum(mainDiagonal) / numSegs;
  const maxesPerLine = _.sum(_.reverse(_.sortBy(connectionMatrix.map(r => r.filter(c => c).length))).slice(0,5));
  const maxPerLine = _.max(connectionMatrix.map(r => r.filter(c => c).length));*/
  const hIndexes =
    _.flatten(connectionMatrix).map((v,i) => v ? i : null).filter(i => i);
  const hGaps = hIndexes.map((v,i) => i > 0 ? v-hIndexes[i-1] : 0).slice(1);
  const gapHisto = toHistogram(hGaps);
  const gapEntropy = getEntropy(toDistribution(gapHisto.slice(1)));
  //console.log(JSON.stringify(hGaps));
  const adjProp = gapHisto[0]/_.sum(gapHisto);
  console.log(JSON.stringify(gapHisto), numNodes, diaProp, gapEntropy, adjProp);
  return Math.sqrt(numNodes) * diaProp / (gapEntropy+1) / (adjProp+1) //* numNodes / (adjDiagonals+1); //* connectedness * compactness * cleanliness;
}

function toHistogram(vals: number[]) {
  const grouped = _.groupBy(vals);
  return _.range(_.min(vals), _.max(vals)+1)
    .map(v => grouped[v] ? grouped[v].length : 0);
}

function toDistribution(histo: number[]) {
  const total = _.sum(histo);
  return histo.map(h => h/total);
}

function getEntropy(data: number[]) {
  return -1 * _.sum(data.map(d => d ? d*Math.log(d) : 0));
}

function getConnectionMatrix(sequence: SegmentNode[][], graph: DirectedGraph<SegmentNode>): number[][] {
  //assumes the nodes in the sequence may be clones of the nodes in the graph
  const nodes = _.zipObject(graph.getNodes().map(n => n.id), graph.getNodes());
  const edges = graph.getEdges();
  return sequence.map(t => sequence.map(s => {
    const tn = t.map(n => nodes[n.id]);
    const sn = s.map(n => nodes[n.id]);
    return edges.filter(e => (tn.indexOf(e.source) >= 0 && sn.indexOf(e.target) >= 0)
      || (tn.indexOf(e.target) >= 0 && sn.indexOf(e.source) >= 0)).length;
  }));
}

interface AddSegmentsOptions {
  graphAdjacentsSearch?: boolean, //graph search algorithm that finds adjacent well-rated segments
  graphBestRatedSearch?: boolean, //graph search algorithm that finds disjunct best-rated segments
  groupingCondition?: GroupingCondition<SegmentNode> //for graph search
  indexNeighborSearch?: boolean, //quick and efficient search algorithm that finds neighbors of existing segments
  minSizeFactor?: number,
  maxNumSegments?: number
}

//adds new segments at the appropriate position in time
function addNewSegments(sequence: SegmentNode[][],
    graph: DirectedGraph<SegmentNode>, options: AddSegmentsOptions) {
  sequence = _.clone(sequence);
  const maxSegSize = _.max(sequence.map(t => t.length));
  const missing = _.difference(graph.getNodes(), _.flatten(sequence));
  const graphOfMissing = graph.getSubgraph(missing);
  console.log("graph", graphOfMissing.getSize(), graphOfMissing.getEdges().length)
  
  let addition: SegmentNode[][];
  
  if (options.indexNeighborSearch) {
    console.log("quickly getting neighboring segments")
    addition = getNeighboringGraphSegmentsForSequence(sequence, graphOfMissing,
      options.minSizeFactor);
  }
  
  if (options.graphAdjacentsSearch) {
    console.log("searching graph for adjacents")
    addition = getBestIndexBasedPartition(graphOfMissing, options.groupingCondition)
      .filter(s => maxSegSize ? s.length > maxSegSize/options.minSizeFactor : s);
  }
  
  if (options.graphBestRatedSearch) {
    console.log("searching graph for best rated")
    addition = getBestDisjunctPartition(graphOfMissing, options.groupingCondition,
      maxSegSize/options.minSizeFactor);
  }
  
  if (options.maxNumSegments) addition = 
    _.reverse(_.sortBy(addition, a => a.length)).slice(0, options.maxNumSegments);
  
  console.log("added slices", JSON.stringify(addition.map(a => a.length)));
  sequence.push(...addition);
  sortPartitionsTemporally(sequence);
  return sequence;
}

function getNeighboringGraphSegmentsForSequence(sequence: SegmentNode[][],
    graph: DirectedGraph<SegmentNode>, minSizeFactor: number) {
  let addition: SegmentNode[][] = [];
  let lastAdded = sequence;
  let numLastAdded = Infinity;
  while (numLastAdded) {
    const succ = lastAdded.map(t => t.map(n => graph.getNodes()
      .find(m => m.version === n.version && m.time === n.time+1)).filter(m=>m));
    const pred = lastAdded.map(t => t.map(n => graph.getNodes()
      .find(m => m.version === n.version && m.time === n.time-1)).filter(m=>m));
    const succGs = succ.map(s => graph.getSubgraph(s).pruneIsolatedNodes().getNodes())
      .filter(s => s.length > 1);
    const predGs = pred.map(p => graph.getSubgraph(p).pruneIsolatedNodes().getNodes())
      .filter(p => p.length > 1);
    let max = _.max(sequence.map(t => t.length));
    lastAdded = _.concat(predGs, succGs).filter(s => s.length > max/minSizeFactor);
    numLastAdded = lastAdded.length;
    if (numLastAdded) {
      addition.push(...lastAdded);
      //numLastAdded = 0; //(REVERT TO JUST ADDING SOME PER ITERATION)
      graph = graph.getSubgraph(_.difference(graph.getNodes(), _.flatten(addition)));
    }
  }
  return addition;
}

interface SequenceValidityOptions {
  connected?: boolean, //all nodes connected to at least one other one
  component?: boolean, //each segment a single component
  affinity?: boolean, //all nodes in segment to which they are most connected
  versions?: boolean //ensure all slices include only one node per version
  uniqueness?: boolean, //every node appears only once
  order?: boolean, //segments are strictly ordered in time
  minSizeFactor?: number
}

//make order of these constraints flexible at some point!
function ensureSequenceValidity(sequence: SegmentNode[][],
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

interface SequenceImprovementOptions {
  merge?: boolean, //merge neighboring partitions with distinct versions
  missing?: boolean, //add any missing segments at best spots
  missingIgnore?: boolean,
  blurs?: boolean, //remove all nodes with connections to neighboring slices
  cycles?: boolean,
  minSizeFactor?: number
}

function improveSequence(sequence: SegmentNode[][],
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

function addMissing(sequence: SegmentNode[][], graph: DirectedGraph<SegmentNode>,
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

//returns all edges between the two given groups
export function getInterGroupEdges(group1: SegmentNode[], group2: SegmentNode[],
    graph: DirectedGraph<SegmentNode>) {
  return _.differenceBy(graph.getSubgraph(_.concat(group1, group2)).getEdges(),
    _.concat(graph.getSubgraph(group1).getEdges(), graph.getSubgraph(group2).getEdges()),
    e => e.source.id+e.target.id);
}

//quick and dirty successive groups, not disjunct
function getSuccessiveGroups(graph: DirectedGraph<SegmentNode>,
    groupingCondition: GroupingCondition<SegmentNode>, existingSeq: SegmentNode[][] = []) {
  const options = {
    graph: graph,
    condition: groupingCondition,
    ratingMethod: GROUP_RATING.INTERNAL,
    maxDistance: 0
  };
  const groups = getBestGroups(options).slice(0,500);
  
  /*let sequence = sortComponentsTemporally(groups.map(g => g.members));
  let numSucc = sequence.map((t,i) => i > 0 ?
    getDirectSuccessors(sequence[i-1], t).length : 0);
  sequence = sequence.filter((_,i) => numSucc[i] > 1 || numSucc[i+1] > 1);
  numSucc = sequence.map((t,i) => i > 0 ?
    getDirectSuccessors(sequence[i-1], t).length : 0);
  console.log(JSON.stringify(numSucc));*/
  
  let sequence = sortPartitionsTemporally(_.concat(existingSeq, groups.map(g => g.members)));
  let numSucc = sequence.map((t,i) => i > 0 ?
    getDirectSuccessors(sequence[i-1], t).length : 0);
  sequence = sequence.filter((_,i) => numSucc[i] > 1 || numSucc[i+1] > 1);
  numSucc = sequence.map((t,i) => i > 0
    && (existingSeq.indexOf(t) < 0 || existingSeq.indexOf(sequence[i-1]) < 0) ?
    getDirectSuccessors(sequence[i-1], t).length : 0); //ignore succ between pairs of existing
  console.log(JSON.stringify(numSucc));
  
  const max = _.max(numSucc);
  let best = sequence.filter((_,i) => numSucc[i] === max || numSucc[i+1] === max);
  let bbest = best;
  best = best.filter(b => existingSeq.indexOf(b) < 0);
  console.log("best", bbest.length, best.length)
  
  return best;
}

function getBestDisjunctPartition(graph: DirectedGraph<SegmentNode>,
    groupingCondition: GroupingCondition<SegmentNode>, minSize: number,
    count = Infinity) {
  const options = {
    graph: graph,
    condition: groupingCondition,
    ratingMethod: GROUP_RATING.INTERNAL,
    maxDistance: 0
  };
  const groups = getBestGroups(options).slice(0,100);
  let sequence: SegmentNode[][] = [];
  let remainingGroups = _.clone(groups);
  let lastAdded = groups[0];
  sequence.push(lastAdded.members);
  while (lastAdded && remainingGroups.length > 0 && sequence.length < count) {
    remainingGroups = removeGroupAndNodes(remainingGroups, lastAdded, options)
      .filter(g => g.members.length > 1);
    if (remainingGroups.length > 0) {
      //does have to be calculated every time since the remaining groups change
      lastAdded = _.maxBy(remainingGroups, g => g.members.length);
      if (lastAdded.members.length > minSize) {//more than a third are direct succ
        sequence.push(lastAdded.members);
      } else {
        lastAdded = null;
      }
    }
  }
  return sequence;
}

function getBestIndexBasedPartition(graph: DirectedGraph<SegmentNode>,
    groupingCondition: GroupingCondition<SegmentNode>) {
  const options = {
    graph: graph,
    condition: groupingCondition,
    ratingMethod: GROUP_RATING.INTERNAL,
    maxDistance: 0
  };
  const groups = getBestGroups(options).slice(0, 300);
  //groups.slice(0,10).forEach(g => console.log(JSON.stringify(g.members.map(m => m.id))));

  //start with best group (most interconnected)
  let currentStart = 0;
  //find group with most successors/predecessors, add to sequence, and so on
  let sequence: SegmentNode[][] = [];
  let remainingGroups = _.clone(groups);
  let lastAdded = groups[currentStart];
  sequence.push(lastAdded.members);
  while (lastAdded) {
    remainingGroups = removeGroupAndNodes(remainingGroups, lastAdded, options)
      .filter(g => g.members.length > 1);
    if (remainingGroups.length > 0) {
      //does have to be calculated every time since the remaining groups change
      const succRatings = remainingGroups.map(g =>
        getDirectSuccessors(_.last(sequence), g.members).length);
        //g.rating * getDirectSuccessors(currentComp.members, g.members).length);
      const predRatings = remainingGroups.map(g =>
        getDirectSuccessors(g.members, _.first(sequence)).length);
        //g.rating * getDirectSuccessors(g.members, currentComp.members).length))[0];
      //console.log(_.max(predRatings), _.max(succRatings));
      if (_.max(succRatings) >= _.max(predRatings)) {
        const candidate = remainingGroups[succRatings.indexOf(_.max(succRatings))];
        const succ = getDirectSuccessors(_.last(sequence), candidate.members);
        if (succ.length > candidate.members.length/3) {//more than a third are direct succ
          lastAdded = candidate;
          sequence.push(lastAdded.members);
        } else {
          if (sequence.length == 1) {//try harder if no pair found
            currentStart++;
            remainingGroups = _.clone(groups).slice(currentStart);
            lastAdded = remainingGroups[0];
            sequence = [lastAdded.members];
          } else {
            lastAdded = null;
          }
        }
      } else {
        lastAdded = remainingGroups[predRatings.indexOf(_.max(predRatings))];
        const pred = getDirectSuccessors(lastAdded.members, _.first(sequence));
        if (pred.length > lastAdded.members.length/3) {//more than a third are direct pred
          sequence.unshift(lastAdded.members);
        } else {
          if (sequence.length == 1) {//try harder if no pair found
            currentStart++;
            remainingGroups = _.clone(groups).slice(currentStart);
            lastAdded = remainingGroups[0];
            sequence = [lastAdded.members];
          } else {
            lastAdded = null;
          }
        }
      }
    } else {
      lastAdded = null;
    }
  }

  return sequence;
}

function getCompletedNumberArray2(nums: number[]) {
  nums = _.clone(nums);
  while (nums.findIndex(n => n == null) >= 0) {
    const nextNullStart = nums.findIndex(n => n == null);
    let nextNullEnd = nums.slice(nextNullStart).findIndex(n => n != null);
    nextNullEnd = nextNullEnd >= 0 ? nextNullStart+nextNullEnd : nums.length;
    const length = nextNullEnd - nextNullStart;
    const low = nums[nextNullStart-1] != null ? nums[nextNullStart-1] : 0;
    const high = nextNullEnd && nums[nextNullEnd] ?
      nums[nextNullEnd] : low+length;
    _.range(nextNullStart, nextNullEnd)
      .forEach((n,i) => nums[n] = low+((i+1)*((high-low)/(length+1))));
  }
  return nums;
}

function getCompletedNumberArray(nums: number[]) {
  nums = _.clone(nums);
  //fill gaps and end
  nums.forEach((n,i) => {
    if (n == null && nums[i-1] != null) {
      const next = nums.slice(i).find(t => t != null);
      nums[i] = next ? Math.min(nums[i-1]+1, next) : nums[i-1]+1;
    }
  });
  //fill beginning
  nums = _.reverse(nums);
  nums.forEach((n,i) => nums[i] = n != null ? n : Math.max(nums[i-1]-1, 0));
  return _.reverse(nums);
}

//successors in time! (not graph)
function getDirectSuccessors(before: SegmentNode[], after: SegmentNode[]) {
  return after.filter(a => before.filter(b => b.version === a.version)
    .some(b => b.time+1 === a.time));
}

function constructTimeline(partitions: SegmentNode[][], minTimepointSize = 0) {
  console.log("partitions", partitions.length)

  sortPartitionsTemporally(partitions);

  //now gradually add to timeline (disjunct at same time!)
  let timeline = mergeNeighboringPartitions(partitions);
  console.log("timeline", timeline.length);
  timeline = mergeNeighboringPartitions(partitions);
  console.log("timeline", timeline.length);

  /*timeline = timeline.filter(c => c.length > minTimepointSize);
  console.log("simple", timeline.length);*/
  console.log("points", _.flatten(_.flatten((timeline))).length);

  console.log("irregularities", getNumberOfIrregularties(timeline));

  /*printVersion(mostCommonVersion(components[0]), timeline);
  printVersion(0, timeline);
  printVersion(5, timeline);
  printVersion(10, timeline);*/
  /*printVersion(50, timeline);
  printVersion(76, timeline);
  printVersion(84, timeline);
  printVersion(69, timeline);*/

  /*const print = _.zip(...timeline.map(t => _.range(0, MAX_VERSION).map(i =>
    t.filter(s => s.version === i).length > 0 ? '.' : ' ')));*/
  //print.forEach(p => console.log(p.join('')))

  return timeline;
}

function mergeNeighboringPartitions(partitions: SegmentNode[][]): SegmentNode[][] {
  return partitions.reduce<SegmentNode[][]>((p,t,i) =>
    i > 0 && _.last(p) && differentVersions(t, _.last(p)) ?
      p.map(s => s === _.last(p) ? _.concat(s, t) : s)
      : _.concat(p,[t]), []);
}

//modifies the given array
function sortPartitionsTemporally(components: SegmentNode[][]) {
  /*components.sort((a,b) => _.range(0, NUM_VERSIONS).some(v =>
    getIndex(a, v) < getIndex(b, v)) ? -1 : 1);*/
  //components.sort((a,b) => _.mean(a.map(n => n.time)) < _.mean(b.map(n => n.time)) ? -1 : 1);
  //new sorting method based on common versions!!
  components.sort((a,b) => {
    const versions = _.intersection(a.map(n => n.version), b.map(n => n.version));
    const aversions = a.filter(n => versions.indexOf(n.version) >= 0);
    const bversions = b.filter(n => versions.indexOf(n.version) >= 0);
    return _.mean(aversions.map(n => n.time)) < _.mean(bversions.map(n => n.time)) ? -1 : 1
  });
  return components;
}

function printVersion(v: number, g: SegmentNode[][]) {
  console.log(JSON.stringify(g.map(g =>
    g.filter(n => n.version === v)).map(s =>
      _.pad(s.length > 0 ?
        _.sortBy(s.map(n => n.id.split(".")[1])).join("/") : "-", 6)).join(" ")));
}

function printComponent(c: SegmentNode[]) {
  console.log(JSON.stringify(_.sortBy(c.map(n => n.version+"."+n.time))));
}

function printPartition(partition: SegmentNode[]) {
  const versions: number[] = _.times(_.max(partition.map(n=>n.version)), _.constant(0));
  partition.forEach(n => versions[n.version] = 1);
  console.log(versions.map(v => v == 1 ? "." : " ").join(''));
}

function getNumberOfIrregularties(timeline: SegmentNode[][]) {
  return getContradictions(timeline, false).length;
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

export function createSegmentGraphFromAlignments(versionPairs: [number,number][],
    results: MultiStructureResult[],
    postprocessPatterns: boolean, path?: string): DirectedGraph<SegmentNode> {
  
  if (path && fs.existsSync(path)) {
    return loadGraph(path);
  }
  
  //recover points for all versions from results
  const vIndexes: [number,number][] = [];
  versionPairs.forEach((vs,i) => vs.forEach((v,j) => vIndexes[v] = [i,j]));
  let versionsPoints = vIndexes.map(ij =>
    ij[1] == 0 ? results[ij[0]].points : results[ij[0]].points2)
  /*const versions = _.sortBy(_.uniq(_.flatten(versionPairs)));
  console.log(versions);
  const versionsPoints = versions.map(v => )*/
  
  //create nodes and a map to find them quickly
  const nodes: SegmentNode[][] = versionsPoints.map((ps,i) =>
    ps.map((p,j) => ({id: i+"."+j, point: p, version: i, time: j})));
  console.log("made nodes")
  const nodesByVersionByPoint = nodes.map(v =>
    _.zipObject(v.map(n => JSON.stringify(n.point)), v));
  //initialize graph
  let graph = new DirectedGraph(_.flatten(nodes), []);

  let patterns = results.map(r => r.patterns);
  
  //plot all matrices
  /*const versionStringPoints = versionsPoints.map(v => v.map(p => JSON.stringify(p)));
  patterns.forEach((ps,i) =>
    saveJsonFile('results/sw-post2/sw_'+i+'.json',
      {'segmentMatrix': toMatrix(ps, versionPairs[i], versionStringPoints)}));*/

  console.log("processing patterns")

  if (postprocessPatterns) {
    console.log("reduce")
    //reduce patterns using linear regression
    const versionStringPoints = versionsPoints.map(v => v.map(p => JSON.stringify(p)));
    patterns = patterns.map((ps,i) =>
      findMostCoherentAlignments(ps, versionPairs[i], versionStringPoints));

    console.log("overlaps")
    //remove overlaps
    patterns = patterns.map((ps,i) =>
      removePatternOverlaps(ps, versionPairs[i], versionStringPoints));
    //plot processed matrices
    patterns.forEach((ps,i) =>
      saveJsonFile('results/sw-post/sw_'+i+'o.json',
        {'segmentMatrix': toMatrix(ps, versionPairs[i], versionStringPoints)}));
    /*console.log(results.slice(0,10).map(r => r.patterns.length), " => ",
      bestPatterns.slice(0,10).map(p => p.length))*/
  }

  console.log("done")

  //add alignment connections
  _.zip(versionPairs, patterns).forEach(([vs,ps]) =>
    ps.forEach(pn => pn.points.map((_,i) => {
      const nodes = vs.map((v,j) =>
        nodesByVersionByPoint[v] ?
        nodesByVersionByPoint[v][JSON.stringify(pn.occurrences[j][i])] : null);
      //console.log(JSON.stringify(nodes), JSON.stringify(vs))
      if (nodes[0] && nodes[1]) {
        graph.addEdge(nodes[0], nodes[1]);
      }
    })));

  console.log("\nfull", graph.getSize(), graph.getEdges().length)

  graph = graph.pruneIsolatedNodes();
  console.log("pruned", graph.getSize(), graph.getEdges().length)

  //REMOVE ALL NODES WITH SMALL DEGREES (ALL DEGREES ARE RELATIVELY SMALL THOUGH...)
  /*graph = graph.getSubgraph(graph.getNodes().filter(n => graph.getDegree(n) > 2));
  console.log("degrees", graph.getSize(), graph.getEdges().length)*/

  //KEEP ONLY BIDIRECTIONAL EDGES (BAD IDEA IF NOT ALL POSSIBLE PAIRS ALIGNED...)
  /*graph = graph.getBidirectionalSubgraph();
  console.log("bidirectional", graph.getSize(), graph.getEdges().length)*/

  //REMOVE ALL EDGES NOT IN CYCLES (TOO STRICT)
  /*graph = graph.pruneEdgesNotInCycles();
  console.log("pruned2", graph.getSize(), graph.getEdges().length)*/

  //print number of nodes connected to each slice of version 0
  /*const v0nodes = versionsPoints[0].map(p => nodesByVersionByPoint[0][JSON.stringify(p)]);
  const v0conn = v0nodes.map(n =>
    graph.getConnectedComponent(n).filter((m:SegmentNode) => m.version != n.version).length);
  console.log(graph.getSize(), JSON.stringify(v0conn))*/

  /*const components = graph.getConnectedComponents().slice(0,10);

  console.log(components.map(c => c.length));

  console.log(_.reverse(_.sortBy(graph.getConnectedComponents()[0].map(n =>
    graph.getDirectAdjacents(n).length))).slice(0,10))

  graph = graph.getSubgraph(components[0])
  console.log(graph.getSize(), graph.getEdges().length);

  const edges = graph.getEdges();
  const dists = edges.map(e => graph.getShortestDistance(e.source, e.target, [e]));
  console.log("prune")
  const pruned = new DirectedGraph(graph.getNodes(), edges.filter((_,i) => dists[i] < 3)).pruneIsolatedNodes();
  console.log(pruned.getSize());
  //const randomEdges = _.sampleSize(graph.getEdges(), 5);
  //console.log(randomEdges)
  //console.log(randomEdges.map(e => graph.getShortestDistance(e.source, e.target, [e])));*/

  if (path) saveGraph(path, graph);

  return graph;
}

function getIndex(nodes: SegmentNode[], version: number) {
  const node = nodes.filter(n => n.version === version)[0];
  if (node) return node.time;
}

function differentVersions(nodes1: SegmentNode[], nodes2: SegmentNode[]) {
  return _.intersection(nodes1.map(n => n.version), nodes2.map(n => n.version))
    .length === 0;
}

function uniqueVersions(nodes: SegmentNode[]) {
  return _.uniq(nodes.map(n => n.version)).length === nodes.length;
}

function mostCommonVersion(nodes: SegmentNode[]) {
  return _.reverse(_.sortBy(_.values(
    _.groupBy(nodes, n => n.version)), v => v.length))[0][0].version;
}

function getFirstPositions(nodes: SegmentNode[], count = 1) {
  const result: SegmentNode[] = [];
  let remaining = nodes;
  _.range(0,count).forEach(i => {
    result.push(..._.uniqBy(_.sortBy(remaining, n => n.time), c => c.version));
    remaining = _.difference(remaining, result);
  });
  return result;
}

function getLastPositions(nodes: SegmentNode[]) {
  return _.uniqBy(_.reverse(_.sortBy(nodes, n => n.time)), c => c.version);
}

function groupByPositions(graph: DirectedGraph<SegmentNode>, posPerGroup = 1) {
  const grouped: SegmentNode[][] = [];
  let remainingNodes = graph.getNodes();
  while (remainingNodes.length > 0) {
    const currentFirsts = getFirstPositions(remainingNodes, posPerGroup);
    grouped.push(currentFirsts);
    remainingNodes = _.difference(remainingNodes, currentFirsts);
  }
  return grouped;
}

function groupByPositionAndCycles(graph: DirectedGraph<SegmentNode>) {
  let byPosition = groupByPositions(graph);
  console.log("positions", JSON.stringify(byPosition.map(c => c.length)), byPosition.length);
  const byCycle: SegmentNode[][] = [];
  let remaining: SegmentNode[] = [];
  byPosition.forEach(nodes => {
    remaining.push(...nodes);
    const currentCycles = graph.getSubgraph(getFirstPositions(remaining))
      .pruneEdgesNotInCycles().pruneIsolatedNodes().getNodes();
    byCycle.push(currentCycles);
    remaining = _.difference(remaining, currentCycles);
  });
  console.log("cycles", JSON.stringify(byCycle.map(c => c.length)), remaining.length)
  /*console.log("more last", JSON.stringify(_.range(0,20).map(i => {
    const last = getLastPositions(remaining);
    const size = graph.getSubgraph(last).pruneEdgesNotInCycles().pruneIsolatedNodes().getSize()
    remaining = _.difference(remaining, last);
    return size;
  })))
  console.log("more first", JSON.stringify(_.range(0,10).map(i => {
    const first = getFirstPositions(remaining);
    const size = graph.getSubgraph(first).pruneEdgesNotInCycles().pruneIsolatedNodes().getSize()
    remaining = _.difference(remaining, first);
    return size;
  })))*/
  /*remaining.slice(0,5).map(r => console.log(JSON.stringify(byCycle.map(nodes =>
    graph.getSubgraph(_.concat(nodes, [r])).getIncidentEdges(r).length))));*/

  //POSTPROCESS
  /*const last = getLastPositions(remaining);
  byCycle.map((c,i) => {
    const concat = _.concat(c,last);
    const first = getFirstPositions(concat);
    const order = first.filter(f =>
      _.concat(_.flatten(byCycle.slice(0, i)).filter(c => c.time > f.time),
      _.flatten(byCycle.slice(i+1)).filter(c => f.time > c.time)).length === 0);
    const addition = graph.getSubgraph(order).pruneEdgesNotInCycles().pruneIsolatedNodes().getSize()-c.length
    console.log(concat.length, first.length, order.length, addition);
  })*/
  /*const first = getFirstPositions(remaining);
  byCycle.map((c,i) => {
    const concat = _.concat(c,first);
    const first2 = getFirstPositions(concat);
    const order = first2.filter(f =>
      _.concat(_.flatten(byCycle.slice(0, i)).filter(c => c.time > f.time),
      _.flatten(byCycle.slice(i+1)).filter(c => f.time > c.time)).length === 0);
    const addition = graph.getSubgraph(order).pruneEdgesNotInCycles().pruneIsolatedNodes().getSize()-c.length
    console.log(c.length, concat.length, first2.length, order.length, addition);
  })*/
  /*const first = getFirstPositions(remaining);
  additions = byCycle.map(c => graph.getSubgraph(_.concat(first,c)).pruneEdgesNotInCycles().pruneIsolatedNodes().getSize()-c.length)
  console.log("first additions", JSON.stringify(additions))*/
  return byCycle;
}

function findMostCoherentAlignments(patterns: Pattern[],
    versions: [number, number], versionsPoints: string[][]) {
  const occurrenceIndexes = toOccurrenceIndexes(patterns, versions, versionsPoints);
  const toIndexes = (ps: Pattern[]) =>
    ps.map(p => occurrenceIndexes[patterns.indexOf(p)]);
  //return longest most coherent set of aligment segments
  let currentSet = _.clone(patterns);
  let currentRating = getCoherenceRating(toIndexes(currentSet));
  while (currentSet.length > 1) {
    const ratings = currentSet.map(p =>
      getCoherenceRating(toIndexes(_.without(currentSet, p))));
    const max = _.max(ratings);
    if (max > currentRating) {
      currentRating = max;
      currentSet = _.without(currentSet, currentSet[ratings.indexOf(max)]);
    } else return currentSet;
  }
  return currentSet;
}

function getCoherenceRating(occurrenceIndexes: number[][][]) {
  if (occurrenceIndexes.length == 0) return 0;
  const xy = _.zip(...occurrenceIndexes).map(_.flatten);
  const r = new SimpleLinearRegression(xy[0], xy[1]).score(xy[0], xy[1]).r;
  //all unique indexes on both x and y axes
  const minUniqs = Math.min(_.uniq(xy[0]).length, _.uniq(xy[1]).length);
  return Math.pow(minUniqs, 1) * r //heuristic based on indexes and r
}

function removePatternOverlaps(patterns: Pattern[],
    versions: [number, number], versionsPoints: string[][]) {
  let occurrenceIndexes = toOccurrenceIndexes(patterns, versions, versionsPoints);
  occurrenceIndexes = _.reverse(_.sortBy(occurrenceIndexes, o => o[0].length));
  patterns = _.reverse(_.sortBy(patterns, p => p.points.length));
  const xy = [[],[]];
  const toRemove = occurrenceIndexes.map(occs => {
    const existing = _.range(0, occs[0].length).filter(i =>
      occs.some((o,oi) => xy[oi].indexOf(o[i]) >= 0));
    occs.forEach((o,oi) => xy[oi].push(..._.flatten(o)));
    return existing;
  });
  return patterns.map((p,i) => removePointsAt(p, toRemove[i]));
}

function removePointsAt(pattern: Pattern, indexes: number[]) {
  pattern.points = pattern.points.filter((_,i) => indexes.indexOf(i) < 0);
  pattern.occurrences = pattern.occurrences.map(o =>
    o.filter((_,i) => indexes.indexOf(i) < 0));
  return pattern;
}

function toOccurrenceIndexes(patterns: Pattern[], versions: [number, number],
    versionsPoints: string[][]) {
  return patterns.map(p => p.occurrences.map((os,i) => os.map(o =>
    versionsPoints[versions[i]].indexOf(JSON.stringify(o)))));
}

function toMatrix(patterns: Pattern[], versions: [number, number],
    versionsPoints: string[][]) {
  const row = _.fill(new Array(versionsPoints[versions[0]].length), 0);
  const matrix = row.map(m => _.fill(new Array(versionsPoints[versions[1]].length), 0));
  const occIndexes = toOccurrenceIndexes(patterns, versions, versionsPoints);
  occIndexes.forEach(os =>
    _.range(0, os[0].length).forEach(i => matrix[os[0][i]][os[1][i]] = 1));
  return matrix;
}
