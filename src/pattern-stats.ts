import * as _ from 'lodash';
import { StructureResult, IterativeSmithWatermanResult, Pattern } from 'siafun';
import { compareArrays } from 'arrayutils';
const SimpleLinearRegression = require('ml-regression-simple-linear');
import { DirectedGraph, Node, saveGraph, loadGraph } from './graph-theory';
import { toIndexSeqMap, powerset } from './util';
import { saveJsonFile } from './file-manager';

interface ProtoNode {
  protoId: any
}

export interface PatternNode extends Node {
  points: string[],
  npoints: number[][],
  size: number,
  count: number,
  versions: number[]
}

interface SegmentNode extends Node {
  point: number[],
  version: number,
  time: number
}

export enum PATTERN_RATING {
  CONNECTIONS, //most connections to anywhere (largest hubs)
  CONNECTIONS_AVG, //most connections to anywhere per pattern
  INTERNAL, //most internal connections within group
  COUNT, //highest pattern count
  COUNT_AVG, //highest pattern count per pattern
}

type GroupingCondition = (n: PatternNode, c?: PatternNode) => boolean

export interface PatternGroupingOptions {
  maxDistance?: number,
  rating?: PATTERN_RATING,
  condition?: GroupingCondition
}

interface PatternGroup {
  center: PatternNode,
  members: PatternNode[], //members don't include center
  totalCount: number
}

export function getConnectednessByVersion(graph: DirectedGraph<PatternNode>) {
  const nodes = graph.getNodes();
  const allVersions = _.uniq(_.flatten(nodes.map(n => n.versions)));
  const grouped = allVersions.map(v => nodes.filter(n => n.versions.indexOf(v) >= 0));
  const conns: number[] = [];
  allVersions.forEach((v,i) =>
    conns[v] = _.sum(grouped[i].map(n => graph.getAdjacents(n).length)));
  return conns;
}

export function getMostCommonPatternNFs(path: string) {
  const graph = loadGraph<PatternNode>(path);
  const nodes = graph.getNodes();
  nodes.sort((a,b) => b.count-a.count);
  return nodes.map(n => n.id);
}

export function getPatternGroupNFs(graph: DirectedGraph<PatternNode>, options: PatternGroupingOptions, count = Infinity): string[][] {
  let normalForms: string[][] = [];
  while (graph.getSize() > 0 && count > 0) {
    const best = getBestPatternGroup(graph, options);
    normalForms.push(best.map(n => n.id));
    best.forEach(n => graph.removeNode(n));
    graph = graph.pruneIsolatedNodes();
    count -= 1;
  }
  return normalForms;
}

function getBestPatternGroup(graph: DirectedGraph<PatternNode>, options: PatternGroupingOptions) {
  let ratingFunc: (a: PatternGroup) => number;
  if (!options.rating || options.rating === PATTERN_RATING.COUNT) {
    ratingFunc = g => g.totalCount;
  } else if (options.rating === PATTERN_RATING.COUNT_AVG) {
    ratingFunc = g => Math.pow(g.totalCount, 1)/g.members.length;
  }
  const adjacents = getAdjacents(graph, options.maxDistance, options.condition);
  adjacents.sort((a,b) => ratingFunc(b)-ratingFunc(a));

  console.log(adjacents[0].center.id, adjacents[0].members.length, ratingFunc(adjacents[0]));
  return _.concat([adjacents[0].center], adjacents[0].members);
}

function getAdjacents(graph: DirectedGraph<PatternNode>, maxDistance?: number,
    condition?: GroupingCondition): PatternGroup[] {
  const nodes = graph.getNodes();
  let adjacents = nodes.map(n =>
    maxDistance ? graph.getAdjacents(n, maxDistance) : []);
  if (condition) adjacents =
    adjacents.map((a,i) => a.filter(n => condition(n, nodes[i])));
  return nodes.map((n,i) =>({
    center: n,
    members: adjacents[i],
    totalCount: n.count + _.sum(adjacents[i].map(m => m.count))
  }));
}


export function analyzePatternGraph(path: string, top = 5) {
  const graph = loadGraph<PatternNode>(path);
  const nodes = graph.getNodes();
  console.log('nodes:', nodes.length);
  console.log('edges:', graph.getEdges().length);
  nodes.sort((a,b) => b.count-a.count);
  console.log('most common:', nodes.slice(0,top).map(n => n.count + ': ' + n.id));

  const adjacents = getBestPatternGroup(graph, {rating: PATTERN_RATING.COUNT});
  console.log('most adjacent:', adjacents.slice(0,top).map(a => a[2] + ', ' + a[0].count + ': ' + a[0].id));

  /*const neighbors = nodes.map(n => graph.getNeighbors(n));
  counts = neighbors.map(as => _.sum(as.map(n => n.count)));
  counts = _.zipWith(nodes, counts, (n,c) => (n.count + c)/n.size);
  nc = _.zip(nodes, counts);
  nc.sort((a,b) => b[1]-a[1]);
  console.log('most direct neighbors:', nc.slice(0,5));

  const recNeighbors = nodes.map(n =>
    graph.getNeighbors(n, 3));
  counts = recNeighbors.map(as => _.sum(as.map(n => n.count)));
  counts = _.zipWith(nodes, counts, (n,c) => n.count + c);
  nc = _.zip(nodes, counts);
  nc.sort((a,b) => b[1]-a[1]);
  console.log('most recursive neighbors:', nc.slice(0,5));*/
}

function getIndex(nodes: SegmentNode[], version: number) {
  const node = nodes.filter(n => n.version === version)[0]
  if (node) return node.time;
}

export function constructTimelineFromHybrids(versionPairs: [number,number][],
    results: StructureResult[]) {
  const COMPONENT_SIZE_THRESHOLD = versionPairs.length/4;
  const maxVersion = _.max(versionPairs.map(_.max));
  const timeline: SegmentNode[][] = [];
  
  const graph = createSegmentGraphFromHybrids(versionPairs, results, [0,1]);
  let components = graph.getConnectedComponents()
    .filter(c => c.length > COMPONENT_SIZE_THRESHOLD);
  
  const firsts = _.uniqBy(_.sortBy(components[0], n => n.time), c => c.version);
  console.log(JSON.stringify(firsts.map(n => n.time)))
  
  const seconds = _.uniqBy(_.sortBy(_.difference(components[0], firsts), n => n.time), c => c.version);
  console.log(JSON.stringify(seconds.map(n => n.time)))
  
  console.log(JSON.stringify(firsts.slice(0,10)))
  saveGraph('plots/d3/latest/slice.json', graph.getSubgraph(firsts));
  console.log(JSON.stringify(graph.getSubgraph(firsts).getNodes().slice(0,10)))
  //saveGraph('plots/d3/latest/slice2.json', graph.getSubgraph(seconds));
  
  console.log("total", JSON.stringify(components.map(c => c.map(n => n.version).length)))
  console.log("redundant", JSON.stringify(components.map(c => c.map(n => n.version).length - _.uniq(c.map(n => n.version)).length)))
  
  //filter out 
  //components = components.map()
  
  //sort components temporally
  components.sort((a,b) => _.range(0, maxVersion).some(v =>
    getIndex(a, v) < getIndex(b, v)) ? -1 : 1);
  console.log(components[0][0].time, _.last(components)[0].time)
  
  //now gradually add to timeline (disjunct at same time!)
  components.forEach((c,i) =>
    i > 0 && differentVersions(c, components[i-1]) ?
      c.forEach(s => _.last(timeline).push(s))
      : timeline.push(c));
  console.log(components.length, timeline.length);
  
  const print = _.zip(...timeline.map(t => _.range(0, maxVersion).map(i =>
    t.filter(s => s.version === i).length > 0 ? '.' : ' ')));
  //print.forEach(p => console.log(p.join('')))
}

function differentVersions(nodes1: SegmentNode[], nodes2: SegmentNode[]) {
  const versions = (nodes: SegmentNode[]) => nodes.map(n => n.version);
  //console.log(nodes1.length, nodes2.length, _.intersection(versions(nodes1), versions(nodes2)).length)
  return _.intersection(versions(nodes1), versions(nodes2)).length == 0;
}

export function createSegmentGraphFromHybrids(versionPairs: [number,number][],
    results: StructureResult[], patternIndexes: number[], path?: string) {
  //recover points for all versions from results
  const vIndexes: [number,number][] = [];
  versionPairs.forEach((vs,i) => vs.forEach((v,j) => vIndexes[v] = [i,j]));
  const versionsPoints = vIndexes.map(ij =>
    ij[1] == 0 ? results[ij[0]].points : (<IterativeSmithWatermanResult[]>results)[ij[0]].points2)
  //create nodes and a map to find them quickly
  const nodes: SegmentNode[][] = versionsPoints.map((ps,i) =>
    ps.map((p,j) => ({id: i+", "+p, point: p, version: i, time: j})));
  const nodesByVersionByPoint = nodes.map(v =>
    _.zipObject(v.map(n => JSON.stringify(n.point)), v));
  //initialize graph
  let graph = new DirectedGraph(_.flatten(nodes), []);
  
  //reduce patterns using linear regression
  const versionStringPoints = versionsPoints.map(v => v.map(p => JSON.stringify(p)));
  let patterns = results.map(r => r.patterns);
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
  
  //TODO NOW REMOVE ALL OVERLAPS!!!!!!
  
  //add alignment connections
  _.zip(versionPairs, results).forEach(([vs,r]) =>
    r.patterns.filter((_,i) => patternIndexes.indexOf(i) >= 0).forEach(pn => pn.points.map((_,i) => {
      const nodes = vs.map((v,j) =>
        nodesByVersionByPoint[v][JSON.stringify(pn.occurrences[j][i])]);
      //if (i < 20)
      graph.addEdge(nodes[0], nodes[1]);
    })));
  
  console.log(graph.getSize())
  
  graph = graph.pruneIsolatedNodes();
  
  console.log("pruned", graph.getSize(), graph.getEdges().length)
  
  //REMOVE ALL NODES WITH SMALL DEGREES
  /*graph = graph.getSubgraph(graph.getNodes().filter(n => graph.getDegree(n) > 2));
  console.log("degrees", graph.getSize(), graph.getEdges().length)*/
    
  //KEEP ONLY BIDIRECTIONAL EDGES (BAD IDEA IF NOT ALL POSSIBLE PAIRS ALIGNED...)
  /*graph = graph.getBidirectionalSubgraph();
  console.log("bidirectional", graph.getSize(), graph.getEdges().length)*/
  
  //REMOVE ALL EDGES THAT DON'T HAVE A THIRD!!
  
  graph = graph.pruneIsolatedNodes();
  console.log("pruned", graph.getSize(), graph.getEdges().length)
  
  const v0nodes = versionsPoints[0].map(p => nodesByVersionByPoint[0][JSON.stringify(p)]);
  const v0conn = v0nodes.map(n =>
    graph.getConnectedComponent(n).filter((m:SegmentNode) => m.version != n.version).length);
  
  console.log(graph.getSize(), JSON.stringify(v0conn))
  
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

export function createSimilaritySegmentGraph(path: string,
    resultsByVersion: StructureResult[]) {
  //first strings of segments with seq edge type
  //then connections based on pattern graph
  const patternGraph = createSimilarityPatternGraph(resultsByVersion, false);
  const normsByVersion = resultsByVersion.map(v =>
    _.zipObject(v.patterns.map(p => JSON.stringify(toNormalForm(p.points))), v.patterns));

  //TODO THESE WILL BE GROUPS OF SIMILARS SOON!!!!!! so simulate now...
  const bestPatterns = patternGraph.getNodes();
  bestPatterns.sort((a,b) => b.count-a.count);


  const nodes: SegmentNode[][] =
    resultsByVersion.map((v,i) =>
      v.points.map((p,j) => ({id: i+", "+p, point: p, version: i, time: j})));
  const nodesByVersionByPoint = nodes.map(v =>
    _.zipObject(v.map(n => JSON.stringify(n.point)), v));

  let graph = new DirectedGraph(_.flatten(nodes), []);

  //TODO NOW ADD REMAINING SUCCESSIVE NODE CONNECTIONS....
  resultsByVersion.forEach((v,vi) => v.points.forEach((p,pi) => {
    if (pi > 0) {
      const previous = nodesByVersionByPoint[vi][JSON.stringify(v.points[pi-1])];
      const current = nodesByVersionByPoint[vi][JSON.stringify(p)];
      if (previous && current)
        graph.addEdge(previous, current)["linear"] = true;
    }
  }));

  console.log(bestPatterns.length)

  bestPatterns.forEach(pn => {
    //TODO HERE MAKE UNION OF PATTERNS SOON

    const pointGroups = pn.points.map(p => _.flatten(pn.versions.map(v => {
      const pattern = normsByVersion[v][pn.id];
      //get pos of norm point in pattern
      const pi = toNormalForm(pattern.points).map(p => JSON.stringify(p)).indexOf(p);
      //get points at pos in all occurrences
      const ps = pattern.occurrences.map(o => o[pi]);
      //get points from nodesByVersionByPoint
      return ps.map(p => nodesByVersionByPoint[v][JSON.stringify(p)]);
    })));

    //now connect all groups of associated points
    /*pointGroups.forEach(pg => pg.forEach(p => pg.forEach(q =>
      p !== q ? graph.addEdge(p, q) : null
    )));*/

    pointGroups.forEach(pg => graph.contract(pg));
  });

  //TODO REMOVE AT SOME POINT?
  graph = graph.pruneIsolatedNodes();

  const remainingNodes = graph.getNodes();
  const remainingNodesMaps = nodesByVersionByPoint.map(v =>
    _.pickBy(v, n => remainingNodes.indexOf(n) >= 0));

  /*//TODO NOW ADD REMAINING SUCCESSIVE NODE CONNECTIONS....
  resultsByVersion.forEach((v,vi) => v.points.forEach((p,pi) => {
    if (pi > 0) {
      const previous = remainingNodesMaps[vi][JSON.stringify(v.points[pi-1])];
      const current = remainingNodesMaps[vi][JSON.stringify(p)];
      if (previous && current)
        graph.addEdge(previous, current)["linear"] = true;
    }
  }));*/

  /*const cliques = _.groupBy(graph.getMaximalCliques(), c => c.length);
  const sizes = _.reverse(_.sortBy(_.keys(cliques), c => parseInt(c)));
  sizes.slice(0,1).forEach(s => cliques[s].forEach(c => graph.contract(c)));*/

  saveGraph(path, graph);
}

export function createHistogramGraph(histograms: number[][][][], path?: string) {
  const nodes = _.flatten(histograms.map((hs,i) => hs.map(h => ({protoId: h, type:i}))));
  const graph = createGraph(nodes,
    (p1, p2) => realSimilar(p1.points, p2.points, 0.6));
  graph.getNodes().forEach(n => n["type"] = _.mean(n["type"]));
  if (path) saveGraph(path, graph);
}

export function createSubsetPatternGraph(resultsByVersion: StructureResult[],
    includeVecs: boolean, path?: string) {
  let graph = createPatternGraph(resultsByVersion, includeVecs,
    (p1, p2) => realSubset2(p1.points, p2.points));
  graph = graph.transitiveReduction();
  console.log('reduced:', graph.getEdges().length);
  if (path) saveGraph(path, graph);
  return graph;
}

export function createSimilarityPatternGraph(resultsByVersion: StructureResult[],
    includeVecs: boolean, path?: string, minPatternOcurrence?: number, log = true) {
  let graph = createPatternGraph(resultsByVersion, includeVecs,
    (p1, p2) => p1 !== p2 &&
      //topologicallySimilar(p1.npoints, p2.npoints, p1.points, p2.points, p1.id, p2.id, 0.95),
      //realSameButNSliding(p1.npoints, p2.npoints, p1.points, p2.points, 1),
      realSimilarSliding(p1.npoints, p2.npoints, p1.points, p2.points, 0.8),
      //similar(p1.points, p2.points, 0.8),
      //realSameButN(p1.points, p2.points, 1),
    minPatternOcurrence, log);
  graph = graph.pruneIsolatedNodes();
  if (log) console.log('pruned nodes:', graph.getNodes().length);
  //console.log(graph.getEdges().map(e => e.source.id + " - " + e.target.id))
  if (path) saveGraph(path, graph);
  return graph;
}

export function getPatternSimilarities(results: StructureResult[], file?: string, mpo = 1) {
  //count nodes with multiple versions like edges, ignore one-version edges...
  let graph: DirectedGraph<PatternNode>;
  if (file) {
    graph = loadGraph(file);
  }
  if (!graph){
    graph = createSimilarityPatternGraph(results, false, undefined, mpo, true);
    saveGraph(file, graph);
  }

  let sims = results.map((_,i) => {
    const iNodes = (graph.getNodes()).filter(n => n.versions.indexOf(i) >= 0);
    const iEdges = graph.getEdges().filter(e =>
      e.source.versions.indexOf(i) >= 0 || e.target.versions.indexOf(i) >= 0);
    return results.slice(i+1).map((_,j) => {
      const identical = iNodes.filter(n => n.versions.indexOf(j+i+1) >= 0);
      const similar = iEdges.filter(e =>
        (e.source.versions.indexOf(i) >= 0 && e.target.versions.indexOf(j+i+1) >= 0)
        || (e.target.versions.indexOf(i) >= 0 && e.source.versions.indexOf(j+i+1) >= 0));
      return identical.length + similar.length/// / (v.patterns.length + w.patterns.length);
    })
  });

  //make symmetric
  sims = results.map((_,i) => results.map((_,j) =>
    i < j ? sims[i][j-i-1] : i > j ? sims[j][i-j-1] : 0));

  return sims;
}

export function getNormalFormsMap(resultsByVersion: StructureResult[]) {
  const points = resultsByVersion.map(v => v.patterns.map(p => p.points));
  return toIndexSeqMap(points, p => JSON.stringify(toNormalForm(p)));
}

function createPatternGraph(resultsByVersion: StructureResult[],
    includeVecs: boolean, edgeFunc: (p1: PatternNode, p2: PatternNode) => boolean,
    minPatternOcurrence?: number, log = false) {

  if (log) console.log('versions:', resultsByVersion.length);
  const normsByVersion = includeVecs ? resultsByVersion.map(v =>
    _.flatten(v.patterns.map(p => toVectorNormalForms(p.points, p.vectors))))
    : resultsByVersion.map(v => v.patterns.map(p => toNormalForm(p.points)));

  //just in case... remove later
  /*const cc = normsByVersion.map(n => _.countBy(n.map(n => JSON.stringify(n))));
  cc.forEach((c,i) => //console.log(_.values(c).filter(c => c > 1)))
    _.forEach(c, (v,k) => v > 1 ? console.log(i, v, k) : null));*/


  const nodeFilter = minPatternOcurrence ?
    (n: PatternNode) => n.count >= minPatternOcurrence : undefined;

  return createGraph(_.flatten(normsByVersion.map((v,i) =>
    v.map(n => ({protoId: n, versions: i}))
  )), edgeFunc, nodeFilter, log);
}

export function createGraph(protoNodes: ProtoNode[],
    edgeFunc: (p1: PatternNode, p2: PatternNode) => boolean,
    nodeFilter?: (p1: PatternNode) => boolean, log = false) {
  if (log) console.log('nodes:', protoNodes.length);
  const grouped = _.groupBy(protoNodes, n => JSON.stringify(n.protoId));
  const ids = _.keys(grouped);
  if (log) console.log('distinct:', ids.length);
  const points = _.zipObject(ids, ids.map(s => stringToPoints(s)));
  const sizes = _.zipObject(ids, ids.map(i => JSON.parse(i).length));
  const combined = _.mapValues(grouped, g => combineProtoNodes(g));
  let nodes: PatternNode[] = ids.map(i => <PatternNode>
    Object.assign({
      id: i,
      points: points[i],
      npoints: JSON.parse(i),
      count: grouped[i].length,
      size: sizes[i]
    }, combined[i]));

  if (nodeFilter) {
    nodes = nodes.filter(n => nodeFilter(n));
    if (log) console.log('filtered:', nodes.length);
  }

  const graph = new DirectedGraph(nodes, []);
  if (log) console.log('adding edges...')
  const startTime = Date.now();
  nodes.forEach(n => nodes.forEach(m =>
    edgeFunc(n, m) ? graph.addEdge(n, m) : null));
  if (log) console.log('duration:', (Date.now()-startTime)/1000, 'secs');
  if (log) console.log('edges:', graph.getEdges().length);
  return graph;
}

function combineProtoNodes(objects: ProtoNode[]): {} {
  const keys = _.keys(objects[0]).filter(k => k !== "protoId");
  return _.mapValues(_.pick(objects[0], keys), (v,k) => _.map(objects, k));
}

function stringToPoints(s: string): string[] {
  return (<number[][]>JSON.parse(s)).map(p => JSON.stringify(p));
}

function subset<T>(s1: Set<T>, s2: Set<T>) {
  return [...s1.values()].every(s => s2.has(s));
}

function realSubset<T>(s1: Set<T>, s2: Set<T>) {
  return s1.size < s2.size && subset(s1, s2);
}

function subset2<T>(s1: T[], s2: T[]) {
  return s1.every(s => s2.indexOf(s) >= 0);
}

function realSubset2<T>(s1: T[], s2: T[]) {
  return s1.length < s2.length && subset2(s1, s2);
}

//works for sorted T[], multi true returns a multiset intersection
function intersection<T>(s1: T[], s2: T[], multi: boolean) {
  let i = 0, j = 0;
  const intersection = [];
  while (i < s1.length && j < s2.length) {
    if (s1[i] === s2[j]) {
      if (multi || s1[i] !== _.last(intersection)) {
        intersection.push(s1[i]);
      }
      i++; j++;
    }
    else if (s1[i] < s2[j]) i++;
    else j++;
  }
  return intersection;
}

//works for sorted T[], multi true returns a multiset union
function union<T>(s1: T[], s2: T[], multi: boolean) {
  let i = 0, j = 0;
  const union = [];
  while (i < s1.length || j < s2.length) {
    if (i < s1.length && (j >= s2.length || s1[i] <= s2[j])) {
      if (multi || s1[i] !== _.last(union)) {
        union.push(s1[i]);
      }
      i++;
      if (s1[i] === s2[j]) j++;
    } else if (j < s2.length) {
      if (multi || s2[j] !== _.last(union)) {
        union.push(s2[j]);
      }
      j++;
    }
  }
  return union;
}

//sørensen-dice
function sorensenDice<T>(s1: T[], s2: T[], ratio: number): boolean {
  //first line optimizes by excluding impossible cases
  return 2 * Math.min(s1.length, s2.length) / (s1.length+s2.length) >= ratio
    && 2 * intersection(s1, s2, true).length / (s1.length+s2.length) >= ratio;
}

function jaccard<T>(s1: T[], s2: T[], ratio: number): boolean {
  //first line optimizes by excluding impossible cases
  return Math.min(s1.length, s2.length) / Math.max(s1.length, s2.length) >= ratio
    && intersection(s1, s2, true).length / union(s1, s2, true).length >= ratio;
}

function realSimilar<T>(s1: T[], s2: T[], ratio: number) {
  return s1 !== s2 && jaccard(s1, s2, ratio);
}

function sameButN<T>(s1: T[], s2: T[], n: number) {
  return Math.abs(s1.length - s2.length) <= n
    && intersection(s1, s2, true).length >= Math.min(s1.length, s2.length) - n;
}

//same except n differring elements
function realSameButN<T>(s1: T[], s2: T[], n: number, minSize = 0) {
  return Math.min(s1.length, s2.length) >= minSize
    && s1 !== s2 && sameButN(s1, s2, n);
}

function realSimilarCardinality<T>(s1: T[], s2: T[], ratio: number) {
  return s1.length == s2.length && realSimilar(s1, s2, ratio);
}

function topologicallySimilar(s1: number[][], s2: number[][], s1s: string[], s2s: string[], s1nf: string, s2nf: string, ratio: number) {
  const t1 = getTopology(s1, s1s, s1nf);
  const t2 = getTopology(s2, s2s, s2nf);

  const minIsect = Math.ceil((s1.length+s2.length)/2 * ratio);
  if (Math.min(s1.length, s2.length) >= minIsect) {
    //not perfect but a good measure (works less well for smaller sets)
    const minConnections = minIsect*(minIsect-1)/2;
    //console.log(t1)
    //console.log(minIsect, s1.length, s2.length, minConnections, t1.length, t2.length);
    return intersection(t1, t2, true).length >= minConnections;
  }
}


//4, 6 ---- 8/10     3-> 6/10

/*
1 0
2 1
3 3
4 6*/

const topologies = new Map<string, string[]>();

function getTopology(s: number[][], st: string[], snf: string) {
  if (!topologies.has(snf)) {
    const temp = temporal(s);
    const atemp = atemporal(s, st);
    const topo = _.sortBy(_.flatten(s.map((_,i) => s.slice(i+1).map((_,j) =>
      atemp[i]+(temp[j]-temp[i])+atemp[j]))));
    topologies.set(snf, topo);
  }
  return topologies.get(snf);
}

function similarSliding(s1: number[][], s2: number[][], s1s: string[], s2s: string[], ratio: number) {
  //slide s1 along s2 within a range determined by ratio, slower the smaller ratio....
  //check if atemporal material intersects to see if worth sliding
  if (jaccard(atemporal(s1, s1s), atemporal(s2, s2s), ratio)) {
    const minsize = Math.ceil(ratio * (s1.length+s2.length)/2);
    const s1max = s1[minsize-1][0];
    const s1min = s1[s1.length-minsize][0];
    const s1last = _.last(s1)[0];
    const s2max = s2[minsize-1][0];
    const s2min = s2[s2.length-minsize][0];
    const s2last = _.last(s2)[0];
    const bottom = Math.max(s2max-s1last, -1*s1min);
    const top = Math.min(s2last-s1max, s2min);
    const range = _.range(bottom, top+1);
    const result = range.some(i => {
      const slid = addToElement(s1, 0, i);
      //first line speeds up! looks at temporal intersection...
      return jaccard(temporal(slid), temporal(s2), ratio)
        && jaccard(slid.map(s => JSON.stringify(s)), s2s, ratio);
    });
    return result;
  }
}

function realSameButNSliding(s1: number[][], s2: number[][], s1s: string[], s2s: string[], n: number, minSize?: number) {
  //slide s1 along s2 within a range determined by ratio, slower the smaller ratio....
  //check if atemporal material intersects to see if worth sliding
  if (realSameButN(atemporal(s1, s1s), atemporal(s2, s2s), n, minSize)) {
    const minsize = Math.min(s1.length, s2.length) - n;
    const s1max = s1[minsize-1][0];
    const s1min = s1[s1.length-minsize][0];
    const s1last = _.last(s1)[0];
    const s2max = s2[minsize-1][0];
    const s2min = s2[s2.length-minsize][0];
    const s2last = _.last(s2)[0];
    const bottom = Math.max(s2max-s1last, -1*s1min);
    const top = Math.min(s2last-s1max, s2min);
    const range = _.range(bottom, top+1);
    return range.some(i => {
      const slid = addToElement(s1, 0, i);
      //first line speeds up! looks at temporal intersection...
      return realSameButN(temporal(slid), temporal(s2), n, minSize)
        && realSameButN(slid.map(s => JSON.stringify(s)), s2s, n, minSize);
    });
  }
}

function temporal(s: number[][]) {
  return s.map(s => s[0]);
}

const sortedAtemporals = new Map<string[],string[]>();

function atemporal(s: number[][], st: string[]) {
  if (!sortedAtemporals.has(st)) {
    sortedAtemporals.set(st, _.sortBy(s.map(s => JSON.stringify(s.slice(1)))));
  }
  return sortedAtemporals.get(st);
}

function realSimilarSliding(s1: number[][], s2: number[][], s1s: string[], s2s: string[], ratio: number) {
  return s1 !== s2 && similarSliding(s1, s2, s1s, s2s, ratio);
}

function addToElement(array: number[][], index: number, value: number) {
  return _.cloneDeep(array).map(vec => {
    vec[index] = vec[index]+value;
    return vec//JSON.stringify(vec);
  });
}

function distinct<T>(s1: T[], s2: T[]) {
  return intersection(s1, s2, false).length < union(s1, s2, false).length;
}

function toNormalForm(points: number[][]): number[][] {
  const normalForm = _.cloneDeep(points);
  normalForm.sort(compareArrays);
  const offset = normalForm[0][0];
  normalForm.forEach(p => p[0] -= offset);
  return normalForm;
}

function toVectorNormalForms(points: number[][], vectors: number[][]): number[][][] {
  const norm = toNormalForm(points);
  return vectors.filter(v => v.some(c => c !== 0)).map(v => _.concat(norm, [v]));
}

export function mapToTimegrid(times: number[], patterns: number[][][], timegrid: number[], round?: boolean): number[][][] {
  return patterns.map(p => p.map(o => {
    const start = times[_.first(o)];
    const end = times[_.last(o)+1];
    let iStart = timegrid.findIndex(t => t > start) - 1;
    let iEnd = timegrid.findIndex(t => t > end) - 1;
    iStart = iStart >= 0 ? iStart : 0;
    iEnd = iEnd >= 0 ? iEnd : timegrid.length-1;
    if (round) {
      iStart += indexOfClosest(start, [timegrid[iStart], timegrid[iStart+1]]);
      iEnd += indexOfClosest(end, [timegrid[iEnd], timegrid[iEnd+1]]);
    }
    return _.range(iStart, iEnd);
  }));
}

/** returns a normalized copy of the pattern (filled gaps and equal *
  * occurrence lengths) */
export function normalize(patterns: number[][][]) {
  return patterns.map(p => {
    const lengths = p.map(o => o[o.length-1] - o[0] + 1);
    const mode = parseInt(_(lengths).countBy().entries().maxBy('[1]')[0]);
    return p.map(o => _.range(o[0], o[0]+mode));
  });
}

function indexOfClosest(b: number, as: number[]): number {
  const absDists = as.map(a => Math.abs(b-a));
  return absDists.reduce((iMin,d,i) => d < absDists[iMin] ? i : iMin, 0);
}
