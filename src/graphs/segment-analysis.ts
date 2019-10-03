import * as _ from 'lodash';
import { StructureResult, IterativeSmithWatermanResult, Pattern } from 'siafun';
const SimpleLinearRegression = require('ml-regression-simple-linear');
import { DirectedGraph, Node, saveGraph } from './graph-theory';
import { getPartition, GROUP_RATING, GroupingCondition } from './graph-analysis';
import { powerset } from './util';
import { saveJsonFile } from '../files/file-manager';

export interface SegmentNode extends Node {
  point: number[],
  version: number,
  time: number
}

export function inferStructureFromAlignments(versionPairs: [number,number][],
    results: StructureResult[]) {
  const MIN_COMPONENT_SIZE = _.uniq(_.flatten(versionPairs)).length/4;
  const MIN_DISTANCE = 16;
  
  //divide graph into connected components
  const graph = createSegmentGraphFromAlignments(versionPairs, results, [0,1], false);
  let components = getSegmentGraphPartitions(graph, MIN_COMPONENT_SIZE,
    (n, os) => !os.some(o => o.version == n.version
      && Math.abs(o.time-n.time) < MIN_DISTANCE));
  return constructTimeline(components, MIN_COMPONENT_SIZE);
}

export function inferStructureFromAlignments2(versionPairs: [number,number][],
    results: StructureResult[], path?: string) {
  
  const timeline = constructTimelineFromAlignments(versionPairs, results);
  const fullGraph = createSegmentGraphFromAlignments(versionPairs, results, [0,1], false);
  const nodes = _.zipObject(fullGraph.getNodes().map(n => n.id), fullGraph.getNodes());
  const edges = fullGraph.getEdges();
  
  const connections = timeline.map((t,i) => timeline.map((s,j) => {
    const tn = t.map(n => nodes[n.id]);
    const sn = s.map(n => nodes[n.id]);
    //return i != j ?
    return edges.filter(e => (tn.indexOf(e.source) >= 0 && sn.indexOf(e.target) >= 0)
      || (tn.indexOf(e.target) >= 0 && sn.indexOf(e.source) >= 0)).length// : 0;
  }));
  
  if (path) saveJsonFile(path, connections);
}

export function constructTimelineFromAlignments(versionPairs: [number,number][],
    results: StructureResult[]) {
  const MIN_COMPONENT_SIZE = _.uniq(_.flatten(versionPairs)).length/4;
  
  //divide graph into connected components
  const graph = createSegmentGraphFromAlignments(versionPairs, results, [0,1], true);
  let components = getSegmentGraphPartitions(graph, MIN_COMPONENT_SIZE,
    (n, os) => !os.some(o => o.version == n.version));
  
  //(previous technique based on cycles)
  //let grouped = components.map(c => groupByPositionAndCycles(graph.getSubgraph(c)));
  
  saveGraph('plots/d3/latest/slice2.json', graph.getSubgraph(components[0]));
  
  return constructTimeline(components);
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
  
  //partition connected components with more than one node per version
  components = _.flatten(components.map(c => !uniqueVersions(c) ? getPartition({
    graph: graph.getSubgraph(c),
    condition: groupingCondition,
    ratingMethod: GROUP_RATING.INTERNAL,
    maxDistance: 0
  }).map(g => g.members)
  : [c]));
  console.log("split", components.filter(c => !uniqueVersions(c)).length);
  return components;
}

function constructTimeline(components: SegmentNode[][], minTimepointSize = 0) {
  //sort components temporally
  /*components.sort((a,b) => _.range(0, NUM_VERSIONS).some(v =>
    getIndex(a, v) < getIndex(b, v)) ? -1 : 1);*/
  components.sort((a,b) => _.mean(a.map(n => n.time)) < _.mean(b.map(n => n.time)) ? -1 : 1);
  
  //now gradually add to timeline (disjunct at same time!)
  let timeline: SegmentNode[][] = [];
  components.forEach((c,i) =>
    i > 0 && differentVersions(c, components[i-1]) ?
      _.last(timeline).push(...c)
      : timeline.push(c));
  console.log("timeline", timeline.length);
  
  timeline = timeline.filter(c => c.length > minTimepointSize);
  console.log("simple", timeline.length);
  console.log("points", _.flatten(_.flatten((timeline))).length);
  
  console.log("irregularities", getNumberOfIrregularties(timeline));
  
  /*printVersion(mostCommonVersion(components[0]), timeline);
  printVersion(0, timeline);
  printVersion(50, timeline);
  printVersion(76, timeline);
  printVersion(84, timeline);
  printVersion(69, timeline);*/
  
  /*const print = _.zip(...timeline.map(t => _.range(0, MAX_VERSION).map(i =>
    t.filter(s => s.version === i).length > 0 ? '.' : ' ')));*/
  //print.forEach(p => console.log(p.join('')))
  
  return timeline;
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

function getNumberOfIrregularties(timeline: SegmentNode[][]) {
  const versions = _.uniq(_.flatten(timeline.map(t => t.map(n => n.version))));
  return _.sum(versions.map(v => {
    const ts = timeline.map(t =>
      _.sortBy(t.filter(n => n.version === v), n => n.time)[0]).filter(n => n);
    return ts.reduce((count, n, i) => i > 0
      && ts.slice(0,i).some(t => t.time > n.time) ? count+1 : count, 0);
  }));
}

export function createSegmentGraphFromAlignments(versionPairs: [number,number][],
    results: StructureResult[], patternIndexes: number[],
    postprocessPatterns: boolean, path?: string) {
  //recover points for all versions from results
  const vIndexes: [number,number][] = [];
  versionPairs.forEach((vs,i) => vs.forEach((v,j) => vIndexes[v] = [i,j]));
  const versionsPoints = vIndexes.map(ij =>
    ij[1] == 0 ? results[ij[0]].points : (<IterativeSmithWatermanResult[]>results)[ij[0]].points2)
  //create nodes and a map to find them quickly
  const nodes: SegmentNode[][] = versionsPoints.map((ps,i) =>
    ps.map((p,j) => ({id: i+"."+j, point: p, version: i, time: j})));
  const nodesByVersionByPoint = nodes.map(v =>
    _.zipObject(v.map(n => JSON.stringify(n.point)), v));
  //initialize graph
  let graph = new DirectedGraph(_.flatten(nodes), []);
  
  let patterns = results.map(r => r.patterns);
  
  if (postprocessPatterns) {
    //reduce patterns using linear regression
    const versionStringPoints = versionsPoints.map(v => v.map(p => JSON.stringify(p)));
    patterns = patterns.map((ps,i) =>
      findMostCoherentAlignments(ps, versionPairs[i], versionStringPoints));
    
    //remove overlaps
    patterns = patterns.map((ps,i) =>
      removePatternOverlaps(ps, versionPairs[i], versionStringPoints));
    patterns.forEach((ps,i) =>
      saveJsonFile('results/sw-post/sw_'+i+'o.json',
        {'segmentMatrix': toMatrix(ps, versionPairs[i], versionStringPoints)}));
    /*console.log(results.slice(0,10).map(r => r.patterns.length), " => ",
      bestPatterns.slice(0,10).map(p => p.length))*/
  }
  
  //add alignment connections
  _.zip(versionPairs, patterns).forEach(([vs,ps]) =>
    ps.filter((_,i) => patternIndexes.indexOf(i) >= 0).forEach(pn => pn.points.map((_,i) => {
      const nodes = vs.map((v,j) =>
        nodesByVersionByPoint[v][JSON.stringify(pn.occurrences[j][i])]);
      //if (i < 20)
      graph.addEdge(nodes[0], nodes[1]);
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
  //return longest most coherent set of aligment segments
  return _.maxBy(powerset(patterns), ps => {
    if (ps.length == 0) return 0;
    const indexes = ps.map(p => occurrenceIndexes[patterns.indexOf(p)]);
    const xy = _.zip(...indexes).map(_.flatten);
    const r = new SimpleLinearRegression(xy[0], xy[1]).score(xy[0], xy[1]).r;
    //all unique indexes on both x and y axes
    const minUniqs = Math.min(_.uniq(xy[0]).length, _.uniq(xy[1]).length);
    return Math.pow(minUniqs, 1) * r; //heuristic based on indexes and r
  });
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