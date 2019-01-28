import * as fs from 'fs';
import * as _ from 'lodash';

export function parseAnnotations(filename: string): [number[], number[][][]] {
  const sections = fs.readFileSync(filename, 'utf8')
    .split('\n').map(t => t.split('\t'));
  const times = sections.map(t => parseFloat(t[0]));
  const labels = sections.map(t => t[1].split(','));
  console.log(sections.slice(0,3))
  //map with all major sections with index and length
  const major: Map<number, number> = new Map();
  const mj: [string, number, number][] = [];
  labels.forEach((ls,i) => ls.length > 1 && ls[0] == _.toUpper(ls[0]) ?
    mj.push([ls[0], i, 0]) : null); //label, index
  mj.forEach((m,i) => i < mj.length-1 ? m[2] = mj[i+1][1]-i : null);//set lengths
  mj.forEach(m => major.set(m[1], m[2]));
  console.log(mj[0])
  //map with section names and occurrence indices of all reoccurring sections
  const patterns: Map<string, number[][]> = new Map();
  //add all reoccurring major sections
  mj.forEach(m => addMultiOccurrences(patterns, m[0], labels, true));
  console.log([...patterns.values()][0])
  //add all reoccurring minor sections
  labels.map(_.last).forEach(l => l == _.toLower(l) ?
    addMultiOccurrences(patterns, l, labels, false) : null);
  //add all indices for entire duration of major sections
  patterns.forEach((ps,n) => patterns.set(n, ps.map(p =>
    major.has(p[0]) ? _.range(p[0], p[0]+major.get(p[0])) : p)));
  console.log([...patterns.values()][0])
  return [times, [...patterns.values()]];
}

function addMultiOccurrences(patterns: Map<string, number[][]>, label: string, labels: string[][], first: boolean) {
  const occurrences = findOccurrences(label, labels, first);
  if (occurrences.length > 1 && !patterns.has(label)) {
    patterns.set(label, occurrences.map(o => [o]));
  }
}

function findOccurrences(label: string, labels: string[][], first: boolean): number[] {
  const selected = labels.map(ls => first ? _.first(ls) : _.last(ls));
  return selected.reduce((is,l,i) => l==label ? is.concat(i) : is, []);
}