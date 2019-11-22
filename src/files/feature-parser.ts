import * as fs from 'fs';
import * as _ from 'lodash';
import { indexOfMax } from 'arrayutils';
import { Quantizer } from 'siafun';
import { FEATURES, Features, getFeatures } from './feature-extractor';
import { FeatureOptions } from './options';

interface VampValue {
  time: number,
  duration?: number,
  value: number
}

interface JohanChord {
  start: number,
  end: number,
  label: string
}

export function quantize(points: any[][], options: FeatureOptions) {
  return new Quantizer(options.quantizerFunctions).getQuantizedPoints(points);
}

export async function getQuantizedPoints(audioFile: string, options: FeatureOptions) {
  const points = await getPointsFromAudio(audioFile, options);
  return new Quantizer(options.quantizerFunctions).getQuantizedPoints(points);
}

export async function getPointsFromAudio(audioFile: string, options: FeatureOptions) {
  return getPoints(await getFeatures(audioFile, options.selectedFeatures), options);
}

export function getPoints(features: Features, options: FeatureOptions) {
  return generatePoints(options,
    [features.segmentations[0]].concat(...features.otherFeatures),
    features.segConditions[0]);
}

function generatePoints(options: FeatureOptions, featureFiles: string[], condition?: any) {
  if (featureFiles.every(fs.existsSync)) {
    let points: any[][] = initPoints(featureFiles[0], condition);
    if (options.doubletime) points = points.filter((_,i) => i % 2 == 0);
    const add7 = options.selectedFeatures.indexOf(FEATURES.JOHAN_SEVENTHS) >= 0;
    return featureFiles.slice(1)
      .reduce((p,f) => addFeature(f, p, add7), points)
      .filter(p => p.every(x => x != null));
  }
}

function initPoints(filename: string, condition?: any): number[][] {
  if (filename.indexOf(FEATURES.MADMOM_BARS.name) >= 0) {
    return condition == '1' ? getMadmomDownbeats(filename).map(b => [b])
      : getMadmomBeats(filename).map(b => [b]);
  } else if (filename.indexOf(FEATURES.MADHAN_BARS.file) >= 0) {
    return getMadhanBars(filename).map(b => [b]);
  } else if (filename.indexOf(FEATURES.FLOHAN_BEATS.file) >= 0) {
    return getFlohanBeats(filename).map(b => [b]);
  }
  return getVampValues(filename, condition).map(v => [v.time]);
}

function addFeature(filename: string, points: number[][], add7ths?: boolean) {
  if (filename.indexOf(FEATURES.JOHAN_CHORDS.name) >= 0) {
    return addJohanChords(filename, points, add7ths);
  } else if (filename.indexOf(FEATURES.TRANSCRIPTION.name) >= 0) {
    return addVampTranscription(filename, points);
  }
  return addVampFeatureMeans(filename, points);
}

function addVampTranscription(filename: string, points: number[][]) {
  const times = points.map(p => p[0]);
  let values = getGroupedVampValues(filename, times);
  values = filterMinProportion(values, times, 0.2);
  values = values.map(vs =>
    mergeVampValues(vs, v => (v.value % 12).toString()));
  values = filterMaxDurations(values, times, 3);
  const pcSets = values.map(g => g.map(v => v.value));
  return _.zip(points, pcSets);
}

function mergeVampValues(values: VampValue[], func: (v: VampValue) => string) {
  const grouped = _.groupBy(values, func);
  return _.values(_.mapValues(grouped, (vs, k) => ({
    time: _.min(vs.map(v => v.time)),
    duration: _.sum(vs.map(v => v.duration)),
    value: parseInt(k)
  })));
}

function addVampFeatureMeans(filename: string, points: number[][]) {
  const grouped = getGroupedVampValues(filename, points.map(p => p[0]));
  const means = grouped.map(g => g.map(v => v.value)).slice(1).map(g => mean(g));
  return _.zip(points, means);
}

function addJohanChords(filename: string, points: number[][], add7ths?: boolean) {
  points.push([Infinity]); //add helper point for last segment
  const chords = getJohanChordValues(filename);
  const durations = _.initial(points).map((p,i) => chords.map(c =>
    intersectJohanDuration(p[0], points[i+1][0], c)));
  const longest = durations.map(ds => chords[indexOfMax(ds)]);
  points.pop();//remove helper point
  const pcsets = longest.map(l => labelToPCSet(l.label, add7ths));
  return _.zip(points, pcsets);
}

function intersectJohanDuration(start: number, end: number, chord: JohanChord) {
  return intersectDuration([start, end], [chord.start, chord.end]);
}

function toPCSet(pitchSet: number[]) {
  return _.sortBy(_.uniq(pitchSet.map(p => p % 12)));
}

function labelToPCSet(chordLabel: string, add7ths?: boolean) {
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

function filterMaxDurations(groups: VampValue[][], times: number[], count: number) {
  return groups.map((g,i) => {
    const durations = g.map(v =>
      intersectDuration([v.time, v.time+v.duration], [times[i], times[i+1]]));
    return _.sortBy(_.zip(g, durations), vd => vd[1])
      .slice(0, count).map(vd => vd[0]);
  });
}

function filterMinProportion(groups: VampValue[][], times: number[], threshold: number) {
  return groups.map((g,i) => g.filter(v => i == times.length-1
    || (intersectDuration([v.time, v.time+v.duration], [times[i], times[i+1]])
    / (times[i+1] - times[i]) > threshold)))
}

function getGroupedVampValues(filename: string, times: number[]): VampValue[][] {
  const groups: VampValue[][] = times.map(_ => []);
  getVampValues(filename).forEach(v => times.forEach((t,i) => {
        //event started between times[i] and times[i+1]
    if ((t <= v.time && (i == times.length-1 || v.time < times[i+1]))
        //event started before and still going on
        || (v.duration && v.time < t && t <= v.time + v.duration)) {
      groups[i].push(v);
    }
  }));
  return groups;
}

function intersectDuration(a: [number, number], b: [number, number]) {
  return Math.min(a[1], b[1]) - Math.max(a[0], b[0]);
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

interface Grid {
  offset: number,
  unit: number,
  points: number[]
}

function getMadhanBars(filename: string): number[] {
  const chords = getJohanChordValues(filename);
  const beats = getMadmomBeats(filename
    .replace(FEATURES.MADHAN_BARS.file, FEATURES.MADMOM_BEATS.file));
  const harmonicRhythm = chords.map(c => c.start);
  const nearestBeats = harmonicRhythm.map(t => {
    const dists = beats.map(b => Math.abs(b-t));
    return dists.indexOf(_.min(dists));
  });
  //console.log(JSON.stringify(harmonicRhythm))
  
  //assume 4/4 for now but could be generalized!!!!
  const METER = 4;
  const bestDownbeats = _.range(0,METER).map(m =>
    nearestBeats.filter(i => (i-m)%METER == 0).length);
  const firstBarline = bestDownbeats.indexOf(_.max(bestDownbeats));
  return beats.slice(firstBarline).filter((_b,i) => i%METER === 0);
}

function getFlohanBeats(filename: string): number[] {
  const solutions = 5;
  const trials = 10;
  const chords = getJohanChordValues(filename);
  const harmonicRhythm = chords.map(c => c.start);
  //console.log(chords.map(c => c.end - c.start))
  const shortest = _.min(chords.map(c => c.end - c.start));
  const maxTime = _.last(harmonicRhythm);
  let grids = [getGrid(0, shortest, maxTime)];
  let errors = grids.map(g => getError(g, harmonicRhythm));
  let previousMinError = Infinity;
  let minError = _.min(errors);
  let precision = 10;
  while (minError < previousMinError && precision > 0.0001) {
    let newGrids = _.flatten(_.flatten(
      grids.map(g => _.times(trials, i => _.times(trials, j =>
        getGrid(g.offset+((i-(trials/2))/trials*precision),
          g.unit+((j-(trials/2))/trials*precision), maxTime))))));
    newGrids = _.uniqBy(newGrids, g => g.offset + " " + g.unit)
      .filter(g => g.unit > 0 && 0 <= g.offset && g.offset < g.unit);
    const newErrors = newGrids.map(g => getError(g, harmonicRhythm));
    previousMinError = minError;
    minError = _.min(newErrors);
    const all = _.uniqBy(_.zip(_.concat(grids, newGrids), _.concat(errors, newErrors)),
      g => g[0].offset + " " + g[0].unit);
    const best = _.sortBy(all, a => a[1]).slice(0, solutions).filter(b => b);
    grids = best.map(b => b[0]);
    errors = best.map(b => b[1]);
    precision /= 10;
    //console.log(grids.slice(0,3).map(g => g.offset + " " + g.unit), errors.slice(0,3), previousMinError);
  }
  //console.log(grids[0].offset, grids[0].unit, errors[0]);
  return grids[0].points;
}

function getGrid(offset: number, unit: number, max: number): Grid {
  return {
    offset: offset,
    unit: unit,
    points: _.times((max-offset)/unit, i => offset + i*unit)
  }
}

function getError(grid: Grid, times: number[]) {
  return _.sum(times.map(h => {
    const dist = (h-grid.offset) % grid.unit;
    return Math.min(dist, grid.unit-dist);
  }))
  + _.sum(grid.points.map(g => _.min(times.map(h => Math.abs(g-h)))))
}

function getJohanChordValues(filename: string): JohanChord[] {
  const json = JSON.parse(fs.readFileSync(filename, 'utf8'));
  return json['chordSequence'];
}

function getMadmomDownbeats(filename: string): number[] {
  return fs.readFileSync(filename, 'utf8').split('\n').map(l => l.split('\t'))
    .filter(l => l[1] == '1').map(l => parseFloat(l[0]));
}

function getMadmomBeats(filename: string): number[] {
  return fs.readFileSync(filename, 'utf8').split('\n').map(parseFloat);
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