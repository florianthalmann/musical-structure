import * as _ from 'lodash';
import * as fs from 'fs';
import { Pattern, MultiStructureResult } from 'siafun';
const SimpleLinearRegression = require('ml-regression-simple-linear');
import { DirectedGraph, saveGraph, loadGraph } from '../graphs/graph-theory';
import { getPartition, GROUP_RATING, GroupingCondition,
  getPartitionConnectionMatrix } from '../graphs/graph-analysis';
import { saveJsonFile, loadJsonFile } from '../files/file-manager';
import { SegmentNode } from './types';
import { addMissing } from './sequence-improvement';
import { ensureSequenceValidity } from './sequence-validity';
import { improveSequence } from './sequence-improvement';
import { addNewSegments } from './sequence-addition';

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
  
  const connectionMatrix = getPartitionConnectionMatrix(timeline, fullGraph);

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

  return partition;
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
    partition = hillClimbConstructPartition(graph, groupingCondition);
    //partition = iterativeGetIndexBasedPartition(graph, groupingCondition);
    saveJsonFile(path, partition);
  }
  partition = ensureSequenceValidity(partition, graph, {uniqueness: true});
  //add all missing while maintaining validity
  addMissing(partition, graph, false, true);
  //addMissing(partition, graph, true, true);
  
  //partition.forEach(printPartition);
  //printVersion(24, partition);
  
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
    candidates.push(improveSequence(currentSequence, graph,
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
    candidates.push(improveSequence(currentSequence, graph,
      {slide: true}));
    candidates.push(improveSequence(currentSequence, graph,
      {missingIgnore: true}));
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

  while (previousNodeCounts.filter(m => m >= currentNodeCount).length <= 5) {
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
  const connectionMatrix = getPartitionConnectionMatrix(sequence, graph);
  console.log("2")
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
  return Math.pow(numNodes, 0.7) * diaProp / (gapEntropy+1) / (adjProp+1) //* numNodes / (adjDiagonals+1); //* connectedness * compactness * cleanliness;
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

function uniqueVersions(nodes: SegmentNode[]) {
  return _.uniq(nodes.map(n => n.version)).length === nodes.length;
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
  const matrix = row.map(_m => _.fill(new Array(versionsPoints[versions[1]].length), 0));
  const occIndexes = toOccurrenceIndexes(patterns, versions, versionsPoints);
  occIndexes.forEach(os =>
    _.range(0, os[0].length).forEach(i => matrix[os[0][i]][os[1][i]] = 1));
  return matrix;
}