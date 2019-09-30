import * as _ from 'lodash';
import { StructureResult } from 'siafun';
import { DirectedGraph, Node, saveGraph, loadGraph } from './graph-theory';
import { NodeGroupingOptions, getBestGroups, GROUP_RATING } from './graph-analysis';
import { SegmentNode } from './segment-analysis';
import { toIndexSeqMap, toNormalForm, toVectorNormalForms } from './util';

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

export function getPatternGroupNFs(graph: DirectedGraph<PatternNode>,
    options?: NodeGroupingOptions<PatternNode>, count = Infinity): string[][] {
  options.graph = graph;
  options.ratingMethod = GROUP_RATING.VALUE;
  options.valueFunction = nodes => _.sum(nodes.map(n => n.count));
  let normalForms: string[][] = [];
  while (graph.getSize() > 0 && count > 0) {
    const best = getBestGroups(options)[0].members;
    normalForms.push(best.map(n => n.id));
    best.forEach(n => graph.removeNode(n));
    graph = graph.pruneIsolatedNodes();
    count -= 1;
  }
  return normalForms;
}

export function analyzePatternGraph(path: string, top = 5) {
  const graph = loadGraph<PatternNode>(path);
  const nodes = graph.getNodes();
  console.log('nodes:', nodes.length);
  console.log('edges:', graph.getEdges().length);
  nodes.sort((a,b) => b.count-a.count);
  console.log('most common:', nodes.slice(0,top).map(n => n.count + ': ' + n.id));

  const groups = getBestGroups({
    graph: graph,
    ratingMethod: GROUP_RATING.VALUE,
    valueFunction: nodes => _.sum(nodes.map(n => n.count))
  })[0].members;
  console.log('most adjacent:', groups.slice(0,top).map(a => a[2] + ', ' + a[0].count + ': ' + a[0].id));

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
