import * as _ from 'lodash';
import { edge, DirectedGraph, Node, saveGraph, loadGraph } from './graph-theory';
import { compareArrays } from 'arrayutils';

type Pattern = number[][];
type Occurrences = Pattern[];

interface PatternNode extends Node {
  count: number
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
  const nc = _.zip(nodes, counts);
  nc.sort((a,b) => b[1]-a[1]);
  console.log('most adjacent:', nc.slice(0,5));
}

export function savePatternGraph(path: string, occsByVersion: Occurrences[][]) {
  console.log('versions:', occsByVersion.length);
  const norms = occsByVersion.map(v => v.map(p => toNormalForm(p)));
  
  //console.log(JSON.stringify(_.zip(occsByVersion[0], norms[0])))
  
  //just in case... remove later
  const cc = norms.map(n => _.countBy(n.map(n => JSON.stringify(n))));
  cc.forEach((c,i) => //console.log(_.values(c).filter(c => c > 1)))
    _.forEach(c, (v,k) => v > 1 ? console.log(i, v, k) : null));
  
  console.log('patterns:', _.flatten(norms).length);
  const counts: {} = _.countBy(_.flatten(norms).map(n => JSON.stringify(n)));
  const ids = _.keys(counts);
  console.log('distinct:', ids.length);
  const points = _.zipObject(ids, ids.map(s => stringToPoints(s)));
  const nodes: PatternNode[] = ids.map(p => ({id: p, count: counts[p]}));
  const edges = [];
  console.log('adding edges...')
  const startTime = Date.now()
  nodes.forEach(n => nodes.forEach(m =>
    realSubset2(points[n.id], points[m.id]) ? edges.push(edge(n, m)) : null
  ));
  console.log('duration:', (Date.now()-startTime)/1000, 'secs');
  let result = new DirectedGraph(nodes, edges);
  console.log('edges:', result.getEdges().length);
  result = result.transitiveReduction();
  console.log('reduced:', result.getEdges().length);
  //console.log('duration:', (Date.now()-startTime)/1000, 'secs');
  saveGraph(path, result);
}

function stringToPoints(s: string): string[] {
  return (<number[][]>JSON.parse(s)).map(p => JSON.stringify(p));
}

/*function countSuperPatternsByVersions(patternsByVersion: Pattern[][]): number[][] {
  const stringPs = patternsByVersion.map(v =>
    v.map(ps => ps.map(p => JSON.stringify(p))));
  return stringPs.map(v => v.map(p =>
    stringPs.map(w => hasSuperPatternIn(p, w))
      .reduce((s,b) => b == true ? s+1 : s, 0)));
}

function hasSuperPatternIn(pattern: string[], others: string[][]) {
  return others.some(o => subset(pattern, o));
}*/

//returns for each pattern the number of other patterns which contain it
//(including identical ones)
/*function countSuperPatterns(patterns: Pattern[]): number[] {
  const stringPs = patterns.map(ps => ps.map(p => JSON.stringify(p)));
  return stringPs.map(p1 => stringPs.map(p2 => subset(p1, p2)))
    .map(ps => ps.reduce((s,b) => b == true ? s+1 : s, 0));
}*/

function subset<T>(s1: Set<T>, s2: Set<T>) {
  return [...s1.values()].every(s => s2.has(s));
}

function realSubset<T>(s1: Set<T>, s2: Set<T>) {
  return s1.size < s2.size && subset(s1, s2);
}

function subset2<T>(s1: string[], s2: string[]) {
  return s1.every(s => s2.indexOf(s) >= 0);
}

function realSubset2<T>(s1: string[], s2: string[]) {
  return s1.length < s2.length && subset2(s1, s2);
}

function toNormalForm(pattern: number[][][]) {
  const normalForm = _.cloneDeep(pattern[0]);
  normalForm.sort(compareArrays);
  const offset = normalForm[0][0];
  normalForm.forEach(p => p[0] -= offset);
  return normalForm;
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