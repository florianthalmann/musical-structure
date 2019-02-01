import * as fs from 'fs';
import * as _ from 'lodash';

interface Section {
  label: string,
  index: number,
  length: number
}

/** if ignoreVariations is true, section variations are considered identical,
    e.g. A == A' */
export function parseAnnotations(filename: string, ignoreVariations?: boolean): [number[], number[][][]] {
  const sections = fs.readFileSync(filename, 'utf8')
    .split('\n').map(t => t.split('\t'));
  const times = sections.map(t => parseFloat(t[0]));
  const labels = sections.map(t => t[1].split(',').map(l => _.trim(l)));
  //map with section names and occurrence indices of all reoccurring sections
  const patterns: Map<string, number[][]> = new Map();
  //add all reoccurring major sections (capital letters)
  const major = findSections(labels, l => l.length <= 2 && l == _.toUpper(l));
  major.forEach(s => addMultiOccurrences(patterns, s, major, ignoreVariations));
  //add all reoccurring minor sections
  const minor = findSections(labels, l => l.length <= 2 && l == _.toLower(l))
  minor.forEach(s => addMultiOccurrences(patterns, s, minor, ignoreVariations));
  return [times, [...patterns.values()]];
}

function findSections(labels: string[][], condition: (s: string) => boolean): Section[] {
  const secs: [string, number][] = <[string, number][]>
    labels.map((ls,i) => [ls.find(condition), i]).filter(s => s[0]);
  return secs.map((s,i) => ({
    label: s[0],
    index: s[1],
    length: i < secs.length-1 ? secs[i+1][1]-s[1] : 1
  }));
}

/** adds all sections that occur multiple times to the pattern map*/
function addMultiOccurrences(patterns: Map<string, number[][]>, section: Section, sections: Section[], ignoreVariations?: boolean) {
  if (ignoreVariations) {
    section.label = section.label.replace('\'', '');
    sections.forEach(s => s.label = s.label.replace('\'', ''));
  }
  const occurrences = sections.filter(s => s.label === section.label); //TODO ignore variations (e.g. A')
  if (occurrences.length > 1 && !patterns.has(section.label)) {
    patterns.set(section.label,
      occurrences.map(o => _.range(o.index, o.index+section.length))); //currently all same length
  }
}