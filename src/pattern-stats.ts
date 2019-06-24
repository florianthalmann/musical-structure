import * as _ from 'lodash';
import { OpsiatecResult } from 'siafun';
import { compareArrays } from 'arrayutils';
import { DirectedGraph, Node, saveGraph, loadGraph } from './graph-theory';
import { toIndexSeqMap } from './util';

interface ProtoNode {
  protoId: any
}

interface PatternNode extends Node {
  points: string[],
  npoints: number[][],
  size: number,
  count: number,
  versions: number[]
}

interface SegmentNode extends Node {
  point: number[],
  version: number
}

export function getHubPatternNFs(graph: DirectedGraph, maxDistance: number, minPatternCount?: number): string[][] {
  let normalForms: string[][] = [];
  while (graph.getSize() > 0) {
    const largest = getLargestHub(graph, maxDistance);
    normalForms.push(largest.map(n => n.id));
    largest.forEach(n => graph.removeNode(n));
    graph = graph.pruneIsolatedNodes();
  }
  return normalForms;
}

function getDensestHub(graph: DirectedGraph, maxDistance: number) {
  const largest = getDensestAdjacent(graph, maxDistance)[0];
  //if (largest[1].length > 2) console.log(largest[1].length+1, largest[2]);
  return _.union([largest[0]], largest[1]);
}

function getLargestHub(graph: DirectedGraph, maxDistance: number) {
  const largest = getMostAdjacents(graph, maxDistance)[0];
  //if (largest[1].length > 2) console.log(largest[1].length+1, largest[2]);
  return _.union([largest[0]], largest[1]);
}

export function getMostCommonPatternNFs(path: string) {
  const graph = loadGraph(path);
  const nodes = <PatternNode[]>graph.getNodes();
  nodes.sort((a,b) => b.count-a.count);
  return nodes.map(n => n.id);
}

export function analyzePatternGraph(path: string, top = 5) {
  const graph = loadGraph(path);
  const nodes = <PatternNode[]>graph.getNodes();
  console.log('nodes:', nodes.length);
  console.log('edges:', graph.getEdges().length);
  nodes.sort((a,b) => b.count-a.count);
  console.log('most common:', nodes.slice(0,top).map(n => n.count + ': ' + n.id));
  
  const adjacents = getMostAdjacents(graph);
  console.log('most adjacent:', adjacents.slice(0,top).map(a => a[2] + ', ' + a[0].count + ': ' + a[0].id));
  
  /*const neighbors = <PatternNode[][]>nodes.map(n => graph.getNeighbors(n));
  counts = neighbors.map(as => _.sum(as.map(n => n.count)));
  counts = _.zipWith(nodes, counts, (n,c) => (n.count + c)/n.size);
  nc = _.zip(nodes, counts);
  nc.sort((a,b) => b[1]-a[1]);
  console.log('most direct neighbors:', nc.slice(0,5));
  
  const recNeighbors = <PatternNode[][]>nodes.map(n =>
    graph.getNeighbors(n, 3));
  counts = recNeighbors.map(as => _.sum(as.map(n => n.count)));
  counts = _.zipWith(nodes, counts, (n,c) => n.count + c);
  nc = _.zip(nodes, counts);
  nc.sort((a,b) => b[1]-a[1]);
  console.log('most recursive neighbors:', nc.slice(0,5));*/
}

function getDensestAdjacent(graph: DirectedGraph, maxDistance = 1) {
  const adjacentsAndCounts = getAdjacentsAndCounts(graph, maxDistance);
  adjacentsAndCounts.sort((a,b) => (b[2]*b[2]/b[1].length)-(a[2]*a[2]/a[1].length));
  return adjacentsAndCounts;
}

function getMostAdjacents(graph: DirectedGraph, maxDistance = 1) {
  const adjacentsAndCounts = getAdjacentsAndCounts(graph, maxDistance);
  adjacentsAndCounts.sort((a,b) => b[2]-a[2]); //sort by count sum
  return adjacentsAndCounts;
}

function getAdjacentsAndCounts(graph: DirectedGraph, maxDistance = 1) {
  const nodes = <PatternNode[]>graph.getNodes();
  const adjacents = <PatternNode[][]>nodes.map(n => graph.getAdjacent(n, maxDistance));
  let counts = adjacents.map(as => _.sum(as.map(n => n.count)));
  counts = _.zipWith(nodes, counts, (n,c) => n.count + c);
  return _.zip(nodes, adjacents, counts);
}

export function createSimilaritySegmentGraph(path: string,
    resultsByVersion: OpsiatecResult[]) {
  //first strings of segments with seq edge type
  //then connections based on pattern graph
  const patternGraph = createSimilarityPatternGraph(resultsByVersion, false);
  const normsByVersion = resultsByVersion.map(v =>
    _.zipObject(v.patterns.map(p => JSON.stringify(toNormalForm(p.points))), v.patterns));
  
  //TODO THESE WILL BE GROUPS OF SIMILARS SOON!!!!!! so simulate now...
  const bestPatterns = <PatternNode[]>patternGraph.getNodes();
  bestPatterns.sort((a,b) => b.count-a.count);
  
  
  const nodes: SegmentNode[][] =
    resultsByVersion.map((v,i) =>
      v.points.map(p => ({id: i+", "+p, point: p, version: i})));
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

export function createSubsetPatternGraph(resultsByVersion: OpsiatecResult[],
    includeVecs: boolean, path?: string) {
  let graph = createPatternGraph(resultsByVersion, includeVecs,
    (p1, p2) => realSubset2(p1.points, p2.points));
  graph = graph.transitiveReduction();
  console.log('reduced:', graph.getEdges().length);
  if (path) saveGraph(path, graph);
  return graph;
}

export function createSimilarityPatternGraph(resultsByVersion: OpsiatecResult[],
    includeVecs: boolean, path?: string) {
  let graph = createPatternGraph(resultsByVersion, includeVecs,
    (p1, p2) => distinct(p1.versions, p2.versions)
      && topologicallySimilar(p1.npoints, p2.npoints, p1.id, p2.id, 0.8));
      //&& realSimilarSliding(p1.npoints, p2.npoints, p2.points, 0.8));
      //&& similar(p1.points, p2.points, 0.8));
      //&& realSameButN(p1.points, p2.points, 1));
  graph = graph.pruneIsolatedNodes();
  console.log('pruned nodes:', graph.getNodes().length);
  //console.log(graph.getEdges().map(e => e.source.id + " - " + e.target.id))
  if (path) saveGraph(path, graph);
  return graph;
}

export function getNormalFormsMap(resultsByVersion: OpsiatecResult[]) {
  const points = resultsByVersion.map(v => v.patterns.map(p => p.points));
  return toIndexSeqMap(points, p => JSON.stringify(toNormalForm(p)));
}

function createPatternGraph(resultsByVersion: OpsiatecResult[],
    includeVecs: boolean, edgeFunc: (p1: PatternNode, p2: PatternNode) => boolean) {
  
  console.log('versions:', resultsByVersion.length);
  const normsByVersion = includeVecs ? resultsByVersion.map(v =>
    _.flatten(v.patterns.map(p => toVectorNormalForms(p.points, p.vectors))))
    : resultsByVersion.map(v => v.patterns.map(p => toNormalForm(p.points)));
  
  //just in case... remove later
  /*const cc = normsByVersion.map(n => _.countBy(n.map(n => JSON.stringify(n))));
  cc.forEach((c,i) => //console.log(_.values(c).filter(c => c > 1)))
    _.forEach(c, (v,k) => v > 1 ? console.log(i, v, k) : null));*/
  
  return createGraph(_.flatten(normsByVersion.map((v,i) => 
    v.map(n => ({protoId: n, versions: i}))
  )), edgeFunc);
}

export function createGraph(protoNodes: ProtoNode[],
    edgeFunc: (p1: PatternNode, p2: PatternNode) => boolean) {
  console.log('nodes:', protoNodes.length);
  const grouped = _.groupBy(protoNodes, n => JSON.stringify(n.protoId));
  const ids = _.keys(grouped);
  console.log('distinct:', ids.length);
  const points = _.zipObject(ids, ids.map(s => stringToPoints(s)));
  const sizes = _.zipObject(ids, ids.map(i => JSON.parse(i).length));
  const combined = _.mapValues(grouped, g => combineProtoNodes(g));
  const nodes: PatternNode[] = ids.map(i => <PatternNode>
    Object.assign({
      id: i,
      points: points[i],
      npoints: JSON.parse(i),
      count: grouped[i].length,
      size: sizes[i]
    }, combined[i]));
  
  const graph = new DirectedGraph(nodes, []);
  console.log('adding edges...')
  const startTime = Date.now();
  nodes.forEach(n => nodes.forEach(m =>
    edgeFunc(n, m) ? graph.addEdge(n, m) : null));
  console.log('duration:', (Date.now()-startTime)/1000, 'secs');
  console.log('edges:', graph.getEdges().length);
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

//calculates similarity between multisets, based on intersection
function multiSimilar<T>(s1: T[], s2: T[], ratio: number): boolean {
  //first line optimizes by excluding impossible cases
  return 2 * Math.min(s1.length, s2.length) / (s1.length+s2.length) >= ratio
    && 2 * multiIntersection(s1, s2).length / (s1.length+s2.length) >= ratio;
}

//works for Ts lodash can sort, e.g. strings and numbers
function multiIntersection<T>(s1: T[], s2: T[]) {
  return _.flatten(_.intersection(s1, s2).map(i => _.times(
    Math.min(s1.filter(s => s === i).length, s2.filter(s => s === i).length),
    _.constant(i))));
}

function similar<T>(s1: T[], s2: T[], ratio: number): boolean {
  //first line optimizes by excluding impossible cases
  return 2 * Math.min(s1.length, s2.length) / (s1.length+s2.length) >= ratio
    && 2 * _.intersection(s1, s2).length / (s1.length+s2.length) >= ratio;
}

function realSimilar<T>(s1: T[], s2: T[], ratio: number) {
  return s1 !== s2 && similar(s1, s2, ratio);
}

function sameButN<T>(s1: T[], s2: T[], n: number) {
  const l = _.intersection(s1, s2).length;
  return l >= s1.length-n && l >= s2.length-n;
}

//same except n differring elements
function realSameButN<T>(s1: T[], s2: T[], n: number) {
  return s1 !== s2 && sameButN(s1, s2, n);
}

function realSimilarCardinality<T>(s1: T[], s2: T[], ratio: number) {
  return s1.length == s2.length && realSimilar(s1, s2, ratio);
}

function topologicallySimilar(s1: number[][], s2: number[][], s1nf: string, s2nf: string, ratio: number) {
  const t1 = getTopology(s1, s1nf);
  const t2 = getTopology(s2, s2nf);
  
  const minIsect = Math.ceil((s1.length+s2.length)/2 * ratio);
  if (Math.min(s1.length, s2.length) >= minIsect) {
    //not perfect but a good measure (works less well for smaller sets)
    const minConnections = minIsect*(minIsect-1)/2;
    //console.log(t1)
    //console.log(minIsect, s1.length, s2.length, minConnections, t1.length, t2.length);
    return multiIntersection(t1, t2).length >= minConnections;
  }
}


//4, 6 ---- 8/10     3-> 6/10

/*
1 0 
2 1
3 3
4 6*/

const topologies = new Map<string, string[]>();

function getTopology(s: number[][], snf: string) {
  if (!topologies.has(snf)) {
    const temp = temporal(s);
    const atemp = atemporal(s);
    topologies.set(snf, _.flatten(s.map((_,i) => s.slice(i+1).map((_,j) =>
      atemp[i]+(temp[j]-temp[i])+atemp[j]))));
  }
  return topologies.get(snf);
}

function similarSliding(s1: number[][], s2: number[][], s2s: string[], ratio: number) {
  //slide s1 along s2 within a range determined by ratio, slower the smaller ratio....
  //check if atemporal material intersects to see if worth sliding
  if (multiSimilar(atemporal(s1), atemporal(s2), ratio)) {
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
    return range.some(i => {
      const slid = addToElement(s1, 0, i);
      //first line speeds up! looks at temporal intersection...
      return similar(temporal(slid), temporal(s2), ratio)
        && similar(slid.map(s => JSON.stringify(s)), s2s, ratio);
    });
  }
}

function temporal(s: number[][]) {
  return s.map(s => s[0]);
}

function atemporal(s: number[][]) {
  return s.map(s => JSON.stringify(s.slice(1)));
}

function realSimilarSliding(s1: number[][], s2: number[][], s2s: string[], ratio: number) {
  return s1 !== s2 && similarSliding(s1, s2, s2s, ratio);
}

function addToElement(array: number[][], index: number, value: number) {
  return _.cloneDeep(array).map(vec => {
    vec[index] = vec[index]+value;
    return vec//JSON.stringify(vec);
  });
}

function distinct<T>(s1: T[], s2: T[]) {
  return _.intersection(s1, s2).length < _.union(s1, s2).length;
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