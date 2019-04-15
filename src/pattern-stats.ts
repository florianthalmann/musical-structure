import * as _ from 'lodash';
import { OpsiatecResult } from 'siafun';
import { compareArrays } from 'arrayutils';
import { edge, DirectedGraph, Node, saveGraph, loadGraph } from './graph-theory';

interface ProtoNode {
  protoId: any
}

interface PatternNode extends Node {
  points: string[],
  size: number,
  count: number,
  versions: number[]
}

export function analyzePatternGraph(path: string) {
  const graph = loadGraph(path);
  const nodes = <PatternNode[]>graph.getNodes();
  console.log('nodes:', nodes.length);
  console.log('edges:', graph.getEdges().length);
  nodes.sort((a,b) => b.count-a.count);
  console.log('most common:', nodes.slice(0,5));
  
  const adjacents = <PatternNode[][]>nodes.map(n => graph.getAdjacent(n));
  let counts = adjacents.map(as => _.sum(as.map(n => n.count)));
  counts = _.zipWith(nodes, counts, (n,c) => n.count + c);
  let nc = _.zip(nodes, counts);
  nc.sort((a,b) => b[1]-a[1]);
  console.log('most adjacent:', nc.slice(0,5));
  
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

export function saveSubsetPatternGraph(path: string,
    resultsByVersion: OpsiatecResult[], includeVecs: boolean) {
  let graph = createPatternGraph(resultsByVersion, includeVecs,
    (p1, p2) => realSubset2(p1.points, p2.points));
  graph = graph.transitiveReduction();
  console.log('reduced:', graph.getEdges().length);
  saveGraph(path, graph);
}

export function saveSimilarityPatternGraph(path: string,
    resultsByVersion: OpsiatecResult[], includeVecs: boolean) {
  let graph = createPatternGraph(resultsByVersion, includeVecs,
    (p1, p2) => distinct(p1.versions, p2.versions)
      && realSimilar(p1.points, p2.points, 0.9));
  graph = graph.pruneIsolatedNodes();
  console.log('pruned:', graph.getNodes().length);
  saveGraph(path, graph);
}

function createPatternGraph(resultsByVersion: OpsiatecResult[],
    includeVecs: boolean, edgeFunc: (p1: PatternNode, p2: PatternNode) => boolean) {
  
  console.log('versions:', resultsByVersion.length);
  const normsByVersion = includeVecs ? resultsByVersion.map(v =>
    _.flatten(v.patterns.map(p => toVectorNormalForms(p.points, p.vectors))))
    : resultsByVersion.map(v => v.patterns.map(p => toNormalForm(p.occurrences[0])));
  
  //just in case... remove later
  const cc = normsByVersion.map(n => _.countBy(n.map(n => JSON.stringify(n))));
  cc.forEach((c,i) => //console.log(_.values(c).filter(c => c > 1)))
    _.forEach(c, (v,k) => v > 1 ? console.log(i, v, k) : null));
  
  return createGraph(_.flatten(normsByVersion.map(ns =>
    ns.map((n,i) => ({protoId: n, versions: i})))), edgeFunc);
}

function createGraph(protoNodes: ProtoNode[],
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
      count: grouped[i].length,
      size: sizes[i]
    }, combined[i]));
  
  const edges = [];
  console.log('adding edges...')
  const startTime = Date.now();
  nodes.forEach(n => nodes.forEach(m =>
    edgeFunc(n, m) ? edges.push(edge(n, m)) : null));
  console.log('duration:', (Date.now()-startTime)/1000, 'secs');
  let result = new DirectedGraph(nodes, edges);
  console.log('edges:', result.getEdges().length);
  return result;
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

function similar<T>(s1: T[], s2: T[], ratio: number): boolean {
  return 2 * _.intersection(s1, s2).length / (s1.length+s2.length) > ratio;
}

function realSimilar<T>(s1: T[], s2: T[], ratio: number) {
  return s1 !== s2 && similar(s1, s2, ratio);
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