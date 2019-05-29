import * as fs from 'fs';
import * as _ from 'lodash';
import { indexOfMax } from 'arrayutils';
import { FEATURES } from './feature-extractor';

interface VampValue {
  time: number,
  value: number
}

interface JohanChord {
  start: number,
  end: number,
  label: string
}

export function generatePoints(featureFiles: string[], condition?: any, add7ths?: boolean) {
  const points: any[][] = initPoints(featureFiles[0], condition);
  return featureFiles.slice(1)
    .reduce((p,f) => addFeature(f, p, add7ths), points)
    .filter(p => p.every(x => x != null));
}

function initPoints(filename: string, condition?: any): number[][] {
  return getVampValues(filename, condition).map(v => [v.time]);
}

function addFeature(filename: string, points: number[][], add7ths?: boolean) {
  if (filename.indexOf(FEATURES.JOHAN_CHORDS.name) >= 0) {
    return addJohanChords(filename, points, add7ths);
  }
  return addVampFeature(filename, points);
}

function addVampFeature(filename: string, points: number[][]) {
  const values = getVampValues(filename);
  const grouped : Number[][] = values.reduce((grp: VampValue[][], v) => {
    if (grp.length-1 < points.length && v.time >= points[grp.length-1][0]) {
      grp.push([v]);
    } else {
      _.last(grp).push(v);
    }
    return grp;
  }, [[]]).map(g => g.map(v => v.value));
  const means = grouped.slice(1).map(g => mean(g));
  let zip = _.zip(points, means);
  return zip;
}

function addJohanChords(filename: string, points: number[][], add7ths?: boolean) {
  points.push([Infinity]); //add helper point for last segment
  const chords = getJohanChordValues(filename);
  const durations = _.initial(points).map((p,i) => chords.map(c =>
    intersectDuration(p[0], points[i+1][0], c)));
  const longest = durations.map(ds => chords[indexOfMax(ds)]);
  points.pop();//remove helper point
  const pcsets = longest.map(l => toPCSet(l.label, add7ths));
  return _.zip(points, pcsets);
}

function intersectDuration(start: number, end: number, chord: JohanChord) {
  return Math.min(end, chord.end) - Math.max(start, chord.start);
}

function toPCSet(chordLabel: string, add7ths?: boolean) {
  const quality = getChordQuality(chordLabel);
  const rootString = quality.length > 0 ? chordLabel.split(quality)[0]
    : chordLabel.split('7')[0];
  const hasSeventh = chordLabel.indexOf('7') >= 0;
  const root = toPitchClass(rootString);
  const pcset = [root];
  pcset.push(quality === 'min' ? (root+3)%12 : (root+4)%12);
  pcset.push((root+7)%12);
  if (add7ths && hasSeventh) {
    pcset.push(quality === 'maj' ? (root+11)%12 : (root+10)%12);
  }
  pcset.sort((a,b)=>a-b);
  return pcset;
}

function getChordQuality(chordLabel: string) {
  return chordLabel.indexOf('min') >= 0 ? 'min'
    : chordLabel.indexOf('maj') >= 0 ? 'maj'
    : '';
}

function mean(array: Number[] | Number[][]) {
  if (array[0] instanceof Array) {
    return _.zip(...<number[][]>array).map(a => _.mean(a));
  }
  return _.mean(array);
}

function toPitchClass(pitch: string) {
  const n = pitch[0];
  const name = n === 'C' ? 0 : n === 'D' ? 2 : n === 'E' ? 4 : n === 'F' ? 5
    : n === 'G' ? 7 : n === 'A' ? 9 : 11;
  return pitch[1] === 'b' ? name-1 : name;
}

export function getVampValues(filename: string, condition?: string): VampValue[] {
  try {
    const json = JSON.parse(fixVampBuggyJson(fs.readFileSync(filename, 'utf8')));
    let values = json['annotations'][0]['data'];
    if (condition != null) {
      values = values.filter(v => v.value === condition);
    }
    return values;
  } catch (e) {
    console.log('error parsing features of '+filename+':', e);
    return [];
  }
}

function getJohanChordValues(filename: string): JohanChord[] {
  const json = JSON.parse(fs.readFileSync(filename, 'utf8'));
  return json['chordSequence'];
}

function fixVampBuggyJson(j: string) {
  return j.split('{').map(k =>
    k.split('}').map(l =>
      l.split(',').map(m =>
        m.split(':').map(n =>
          escapeVampBuggyQuotes(n)
        ).join(':')
      ).join(",")
    ).join("}")
  ).join("{");
}

function escapeVampBuggyQuotes(s: string) {
  s = s.replace("\\'", "'");
  
  const is = indexesOf(s, '"');
  if (is.length > 2) {
    const chars = s.split("");
    _.reverse(is.slice(1, -1))
      .forEach(i => chars.splice(i, 0, '\\'));
    return chars.join("");
  }
  return s;
}

function indexesOf(s: string, char: string) {
  return s.split("").map((c,i) => c == char ? i : -1).filter((i => i >= 0));
}