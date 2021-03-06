import * as fs from 'fs';
import * as _ from 'lodash';

interface Section {
  label: string,
  index: number,
  length: number
}

export interface Annotation {
  times: number[],
  patterns: number[][][]
}

export function getAnnotations(folder: string): Annotation[] {
  //parse ground truth and filter out annotations without repetitions (and empty ones like 964)
  const patterns = getAnnotationFiles(folder)
    .map(a => parseAnnotation(a))
    .filter(g => g[1].length > 0);
  if (patterns.length > 0) return patterns;
}

function getAnnotationFiles(folder: string): string[] {
  //find available annotation files
  if (fs.existsSync(folder)) {
    return fs.readdirSync(folder)
      .filter(f => f.indexOf(".txt") > 0)
      .map(f => folder+f);
  }
  return [];
}

/** if ignoreVariations is true, section variations are considered identical,
    e.g. A == A' */
function parseAnnotation(filename: string, ignoreVariations = true, useNamed = true): Annotation {
  const sections = fs.readFileSync(filename, 'utf8')
    .split('\n').map(t => t.split('\t'));
  const times = sections.map(s => parseFloat(s[0]));
  let labels = sections.filter(s => s[1])
    .map(s => s[1].split(',').map(l => _.trim(l)));
  if (ignoreVariations) {
    labels = labels.map(ls => ls.map(l => l.replace(/\'/g, '')));
  }
  //map with section names and occurrence indices of all reoccurring sections
  const patterns: Map<string, number[][]> = new Map();
  if (useNamed) {
    //add all reoccurring named sections (capitalized words)
    addRepeatedSections(patterns, labels, l => l.length > 2 && l == _.capitalize(l) && l !== "Silence");
  } else {
    //add all reoccurring major sections (capital letters)
    addRepeatedSections(patterns, labels, l => l.length <= 2 && l == _.toUpper(l));
  }
  //add all reoccurring minor sections
  addRepeatedSections(patterns, labels, l => l.length <= 2 && l == _.toLower(l));
  return {times: times, patterns: [...patterns.values()]};
}

function addRepeatedSections(patterns: Map<string, number[][]>, labels: string[][], condition: (s: string) => boolean) {
  const sections = findSections(labels, condition);
  sections.forEach(s => addMultiOccurrences(patterns, s, sections));
}

function findSections(labels: string[][], condition: (s: string) => boolean): Section[] {
  const secs: [string, number][] = <[string, number][]>
    labels.map((ls,i) => [ls.find(condition), i]).filter(s => s[0]);
  const lengths = secs.map((s,i) => i < secs.length-1 ? secs[i+1][1]-s[1] : 1);
  return secs.map((s,i) => ({ label: s[0], index: s[1], length: lengths[i] }));
}

/** adds all sections that occur multiple times to the pattern map*/
function addMultiOccurrences(patterns: Map<string, number[][]>, section: Section, sections: Section[]) {
  const occurrences = sections.filter(s => s.label === section.label);
  if (occurrences.length > 1 && !patterns.has(section.label)) {
    patterns.set(section.label,
      occurrences.map(o => _.range(o.index, o.index+o.length)));
  }
}