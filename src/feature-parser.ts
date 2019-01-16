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

export function generatePoints(featureFiles: string[], condition?: any) {
  const points: any = initPoints(featureFiles[0], condition);
  return featureFiles.slice(1).reduce((p,f) => addFeature(f, p), points);
}

function initPoints(filename: string, condition?: any): number[][] {
  let values = getVampValues(filename);
  if (condition != null) {
    values = values.filter(v => v.value === condition);
  }
  return values.map(v => [v.time]);
}

function addFeature(filename: string, points: number[][]) {
  if (filename.indexOf(FEATURES.JOHAN_CHORDS.name) >= 0) {
    return addJohanChords(filename, points);
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
  return _.zip(points, grouped.slice(1).map(g => mean(g)));
}

function addJohanChords(filename: string, points: number[][]) {
  points.push([Infinity]); //add helper point for last segment
  const chords = getJohanChordValues(filename);
  const durations = _.initial(points).map((p,i) => chords.map(c =>
    intersectDuration(p[0], points[i+1][0], c)));
  const longest = durations.map(ds => chords[indexOfMax(ds)]);
  points.pop();//remove helper point
  const pcsets = longest.map(l => toPCSet(l.label));
  return _.zip(points, pcsets);
}

function intersectDuration(start: number, end: number, chord: JohanChord) {
  return Math.min(end, chord.end) - Math.max(start, chord.start);
}

function toPCSet(chordLabel: string) {
  const quality = getChordQuality(chordLabel);
  const rootString = quality.length > 0 ? chordLabel.split(quality)[0]
    : chordLabel.split('7')[0];
  const hasSeventh = chordLabel.indexOf('7') >= 0;
  const root = toPitchClass(rootString);
  const pcset = [root];
  pcset.push(quality === 'min' ? (root+3)%12 : (root+4)%12);
  pcset.push((root+7)%12);
  if (hasSeventh) {
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

function getVampValues(filename: string): VampValue[] {
  const json = JSON.parse(fs.readFileSync(filename, 'utf8'));
  return json['annotations'][0]['data'];
}

function getJohanChordValues(filename: string): JohanChord[] {
  const json = JSON.parse(fs.readFileSync(filename, 'utf8'));
  return json['chordSequence'];
}