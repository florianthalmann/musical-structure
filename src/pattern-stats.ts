import * as _ from 'lodash';
import { node, edge, graph, transitiveReduction } from './graph-theory';

type Pattern = number[][];
type Occurrences = Pattern[];

export function createPatternGraph(occsByVersion: Occurrences[][]) {
  occsByVersion = occsByVersion//.slice(0, 10)
  console.log('versions:', occsByVersion.length);
  const norms = occsByVersion.map(ps => ps.map(p => toNormalForm(p)));
  console.log('patterns:', _.flatten(norms).length);
  const counts = _.countBy(_.flatten(norms).map(n => JSON.stringify(n)));
  const ids = _.keys(counts);
  console.log('distinct:', ids.length);
  const points = _.zipObject(ids, ids.map(s => stringToPoints(s)));
  const nodes = ids.map(p => node(p));
  const edges = [];
  console.log('adding edges...')
  nodes.forEach(n => nodes.forEach(m =>
    realSubset(points[n.id], points[m.id]) ? edges.push(edge(n, m)) : null
  ));
  let result = graph(nodes, edges);
  console.log('edges:', result.edges.length);
  result = transitiveReduction(result);
  console.log('reduced:', result.edges.length);
}

function stringToPoints(s: string): string[] {
  return (<number[][]>JSON.parse(s)).map(p => JSON.stringify(p));
}

export function comparePatterns(occsByVersion: Occurrences[][]) {
  const norms = occsByVersion.map(ps => ps.map(p => toNormalForm(p)));
  const counts = _.toPairs(_.countBy(_.flatten(norms).map(n => JSON.stringify(n))));
  counts.sort((a,b)=>b[1]-a[1]);
  console.log("TOTAL DISTINCT PATTERNS:", counts.length);
  console.log("MOST COMMON PATTERN", counts[0][1], "TIMES:", counts[0][0]);
  const superCount = countSuperPatternsByVersions(norms);
  const lengths = norms.map(v => v.map(p => Math.pow(p.length, 1.4)));
  const products = norms.map((v,i) =>
    _.zipWith(superCount[i], lengths[i], (a:number, b:number) => a*b));
  const superList = _.flatten(superCount.map((v,i) => v.map((p,j) => [p,i,j])));
  superList.sort((a,b)=>b[0]-a[0]);
  
  /*const iOfMs: number[] = products.map(p => indexOfMax(p));
  const maxes = iOfMs.map((i,k) => products[k][i]);
  const maxmax: number = indexOfMax(maxes);
  console.log("BEST SUBPATTERN", JSON.stringify(norms[maxmax][iOfMs[maxmax]]),
    "VERSIONS:", superCount[maxmax][iOfMs[maxmax]]);*/
  console.log("BEST SUBPATTERNS", superList.slice(0,10).map(s =>
    JSON.stringify(norms[s[1]][s[2]]) + "VERSIONS:" + s[0]));
  //console.log(counts.slice(0,20));
}

function countSuperPatternsByVersions(patternsByVersion: Pattern[][]): number[][] {
  const stringPs = patternsByVersion.map(v =>
    v.map(ps => ps.map(p => JSON.stringify(p))));
  return stringPs.map(v => v.map(p =>
    stringPs.map(w => hasSuperPatternIn(p, w))
      .reduce((s,b) => b == true ? s+1 : s, 0)));
}

function hasSuperPatternIn(pattern: string[], others: string[][]) {
  return others.some(o => subset(pattern, o));
}

//returns for each pattern the number of other patterns which contain it
//(including identical ones)
function countSuperPatterns(patterns: Pattern[]): number[] {
  const stringPs = patterns.map(ps => ps.map(p => JSON.stringify(p)));
  return stringPs.map(p1 => stringPs.map(p2 => subset(p1, p2)))
    .map(ps => ps.reduce((s,b) => b == true ? s+1 : s, 0));
}

function subset(s1: string[], s2: string[]) {
  return s1.every(s => s2.indexOf(s) >= 0);
}

function realSubset(s1: string[], s2: string[]) {
  return s1.length < s2.length && subset(s1, s2);
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