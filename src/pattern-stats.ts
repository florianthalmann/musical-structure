import * as _ from 'lodash';
import { edge, DirectedGraph, Node, saveGraph, loadGraph } from './graph-theory';

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
}

export function savePatternGraph(path: string, occsByVersion: Occurrences[][]) {
  //occsByVersion = occsByVersion.slice(0, 120)
  console.log('versions:', occsByVersion.length);
  const norms = occsByVersion.map(ps => ps.map(p => toNormalForm(p)));
  console.log('patterns:', _.flatten(norms).length);
  const counts: {} = _.countBy(_.flatten(norms).map(n => JSON.stringify(n)));
  const ids = _.keys(counts);
  console.log('distinct:', ids.length);
  const points = _.zipObject(ids, ids.map(s => new Set<string>(stringToPoints(s))));
  const nodes: PatternNode[] = ids.map(p => ({id: p, count: counts[p]}));
  const edges = [];
  console.log('adding edges...')
  nodes.forEach(n => nodes.forEach(m =>
    realSubset(points[n.id], points[m.id]) ? edges.push(edge(n, m)) : null
  ));
  let result = new DirectedGraph(nodes, edges);
  console.log('edges:', result.getEdges().length);
  const startTime = Date.now()
  result = result.transitiveReduction();
  console.log('reduced:', result.getEdges().length);
  console.log('duration:', (Date.now()-startTime)/1000, 'secs');
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

function toNormalForm(pattern: number[][][]) {
  const normalForm = pattern[0];
  normalForm.sort((a,b)=>a[0]-b[0]);
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