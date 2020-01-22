import * as _ from 'lodash';
import * as fs from 'fs';
import { Pattern, MultiStructureResult } from 'siafun';
const SimpleLinearRegression = require('ml-regression-simple-linear');
import { DirectedGraph, saveGraph, loadGraph } from '../graphs/graph-theory';
import { getPartition, GROUP_RATING, GroupingCondition } from '../graphs/graph-analysis';
import { GraphPartition } from '../graphs/graph-partition';
import { saveJsonFile, loadJsonFile } from '../files/file-manager';
import { SegmentNode } from './types';
import { ensureSequenceValidity } from './sequence-validity';
import { improveSequence, addMissing } from './sequence-improvement';
import { addNewSegments } from './sequence-addition';
import { getSequenceRating } from './sequence-heuristics';
import { BeamSearch, GeneratorOutput } from '../graphs/beam-search';

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
    results: MultiStructureResult[], filebase?: string): SegmentNode[][] {

  const timeline = constructTimelineFromAlignments(versionPairs, results,
    DIFF_VERSIONS, false, filebase);
  
  const connectionMatrix = timeline.getConnectionMatrix();

  if (filebase) {
    saveJsonFile(filebase+'-matrix.json', connectionMatrix);
    //saveGraph(filebase+'-graph-seg.json', fullGraph.getSubgraph(_.flatten(timeline.slice(75, 79))));
  }
  //console.log(timeline.slice(75, 79).map(t => t.map(n => n.id)));

  return timeline.getPartitions();
}

function constructTimelineFromAlignments(versionPairs: [number,number][],
    results: MultiStructureResult[], groupingCondition: GroupingCondition<SegmentNode>,
    postprocess = true, filebase?: string) {
  //const MIN_COMPONENT_SIZE = _.uniq(_.flatten(versionPairs)).length/8;
  
  const path = filebase ? (postprocess ? filebase+'-procgraph.json' : filebase+'-graph.json'): null;
  const graph = createSegmentGraphFromAlignments(versionPairs, results, postprocess, path);
  
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
  let partition: GraphPartition<SegmentNode>;
  /*if (fs.existsSync(path)) {
    const sequence: SegmentNode[][] = loadJsonFile(path);
    console.log(JSON.stringify(sequence.map(p => p.length)))
    partition = new GraphPartition(graph, sequence);
  } else {*/
    const initial = addNewSegments(new GraphPartition(graph, []),
      {graphAdjacentsSearch: true, minSizeFactor: 3,
        groupingCondition: DIFF_VERSIONS, maxNumSegments: 5}).value
    
    partition = beamSearchGenerateSequence(graph)//, initial);
    //partition = iterativeGetIndexBasedPartition(graph, groupingCondition);
    saveJsonFile(path, partition.getPartitions());
  //}
  partition = ensureSequenceValidity(partition, {uniqueness: true});
  //add all missing while maintaining validity
  //addMissing(partition, false, true);
  //addMissing(partition, true, true);
  
  //partition.forEach(printPartition);
  //printVersion(24, partition);
  
  //partition = beamSearchGenerateSequence(graph, partition);
  //console.log(graph.getAdjacents(partition[i2][0]))
  return partition;
}

function beamSearchGenerateSequence(graph: DirectedGraph<SegmentNode>,
    initialSequence?: GraphPartition<SegmentNode>): GraphPartition<SegmentNode> {
  
  graph = initialSequence ? initialSequence.getGraph() : graph;
  initialSequence = initialSequence ? initialSequence.clone() : new GraphPartition(graph, []);
  
  const result = new BeamSearch(generateSolutions, validateSolution,
      getSequenceRating)//, generateSolutionsByAdding)
    .searchFrom(initialSequence);
  
  console.log(result.process)
  return result.value;
}

function generateSolutions(sequence: GraphPartition<SegmentNode>) {
  return _.concat(
    improveSequence(sequence, {merge: true}),
    //improveSequence(sequence, {swap: true}),
    improveSequence(sequence, {slide: true}),
    improveSequence(sequence, {missing: true}),
    improveSequence(sequence, {missingIgnore: true}),
    improveSequence(sequence, {missingInsert: true}),
    improveSequence(sequence, {blurs: 10}),
    improveSequence(sequence, {blurs: 50}),
    improveSequence(sequence, {minor: 1}),
    improveSequence(sequence, {minor: 5}),
    improveSequence(sequence, {cycles: 10}),
    improveSequence(sequence, {affinity: 10}),
    improveSequence(sequence, {minSizeFactor: 3}),
    {value: ensureSequenceValidity(sequence, {connected: true}), info: 'connected'},
    {value: ensureSequenceValidity(sequence, {component: true}), info: 'component'},
    generateSolutionsByAdding(sequence)
  );
}

function validateSolution(sequence: GraphPartition<SegmentNode>) {
  return ensureSequenceValidity(sequence,
    {versions: true, uniqueness: true, order: true});//affinity, connected, component
}

function generateSolutionsByAdding(sequence: GraphPartition<SegmentNode>) {
  let minSizeFactor = 3;
  const previousLength = sequence.getPartitionCount();
  let candidates: GeneratorOutput<GraphPartition<SegmentNode>>[] = [];
  while (!candidates.length) {
    candidates.push(addNewSegments(sequence,
      {graphAdjacentsSearch: true, minSizeFactor: minSizeFactor,
        groupingCondition: DIFF_VERSIONS, maxNumSegments: 10}));
    candidates.push(addNewSegments(sequence,
      {indexNeighborSearch: true, minSizeFactor: minSizeFactor,
        groupingCondition: DIFF_VERSIONS, maxNumSegments: 10}));
    candidates.filter(c => c.value.getPartitionCount() > previousLength);
    if (!candidates.length) minSizeFactor++;
  }
  //console.log("ADDED", JSON.stringify(candidates.map(c => getSequenceRating(c.value))))
  return candidates;
}

//baseline: handcrafted and works really well for some material
function iterativeGetIndexBasedPartition(graph: DirectedGraph<SegmentNode>,
    groupingCondition: GroupingCondition<SegmentNode>) {
  
  let minSizeFactor = 3;
  let currentSequence = new GraphPartition(graph, []);
  let bestSequence: GraphPartition<SegmentNode>;
  let previousNodeCounts = [];
  let currentNodeCount = 0;

  while (previousNodeCounts.filter(m => m >= currentNodeCount).length <= 5) {
    if (previousNodeCounts.filter(m => m >= currentNodeCount).length > 6) {
      minSizeFactor++;
      console.log("MIN SIZE FACTOR", minSizeFactor);
    }
    
    //ADD NEW SEGMENT PARTITIONS
    const quickSearch = currentSequence.getPartitionCount() > 0
      && _.last(previousNodeCounts) !== currentNodeCount;
    currentSequence = addNewSegments(currentSequence,
      {graphAdjacentsSearch: !quickSearch, indexNeighborSearch: quickSearch,
        minSizeFactor: minSizeFactor, groupingCondition: groupingCondition}).value;
    
    //ADD IMPROVEMENTS
    currentSequence = improveSequence(currentSequence,
      {merge: true, missing: true, blurs: 10000, minSizeFactor: minSizeFactor})[0].value;
    
    //ENSURE VALIDITY
    currentSequence = ensureSequenceValidity(currentSequence,
      {connected: true, affinity: true, versions: true, order: true });
    
    previousNodeCounts.push(currentNodeCount);
    currentNodeCount = getSequenceRating(currentSequence)//_.flatten(currentSequence).length;
      
    //CHECK IF BETTER
    if (previousNodeCounts.every(m => currentNodeCount > m)) {
      console.log(currentNodeCount, getSequenceRating(currentSequence));
      bestSequence = currentSequence.clone();
      console.log(JSON.stringify(currentSequence.getPartitions().map(t => t.length)));
      console.log(JSON.stringify(currentSequence.getPartitions().map(t =>
        graph.getSubgraph(t).getEdges().length)));
    }
  }

  console.log(JSON.stringify(bestSequence.getPartitions().map(t =>
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