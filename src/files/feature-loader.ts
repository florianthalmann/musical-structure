import * as fs from 'fs';
import * as _ from 'lodash';
import { indexOfMax } from 'arrayutils';
import { Quantizer } from 'siafun';
import { FEATURES, Features, FeatureExtractor, FeatureConfig } from './feature-extractor';
import { loadJsonFile } from './file-manager';
import { FeatureOptions } from './options';
import { mapSeries } from './util';
import { labelToPCSet } from './theory';

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

interface Grid {
  offset: number,
  unit: number,
  points: number[]
}

export class FeatureLoader {
  
  private extractor: FeatureExtractor;
  
  constructor(featurePath: string) {
    this.extractor = new FeatureExtractor(featurePath);
  }

  async getQuantizedPoints(audioFile: string, options: FeatureOptions) {
    const points = await this.getPointsFromAudio(audioFile, options);
    return new Quantizer(options.quantizerFunctions).getQuantizedPoints(points);
  }

  async getPointsForAudioFiles(audioFiles: string[], options: FeatureOptions) {
    return mapSeries(audioFiles, a => this.getPointsFromAudio(a, options));
  }

  async getPointsFromAudio(audioFile: string, options: FeatureOptions) {
    const files = await this.extractor.getFeatureFiles(audioFile, options.selectedFeatures);
    return this.getPoints(files, options);
  }

  async getFeaturesFromAudio(audioFiles: string[], feature: FeatureConfig) {
    return mapSeries(audioFiles, a => this.getFeature(a, feature));
  }

  async getFeature(audioFile: string, feature: FeatureConfig) {
    const featureFile = await this.extractor.getFeatureFile(audioFile, feature);
    if (feature == FEATURES.ESSENTIA_TUNING) {
      return this.getEssentiaTuning(featureFile);
    } else if (feature == FEATURES.ESSENTIA_KEY) {
      return this.getEssentiaKey(featureFile);
    }
  }

  getPoints(features: Features, options: FeatureOptions) {
    return this.generatePoints(options,
      [features.segmentations[0]].concat(...features.otherFeatures),
      features.segConditions[0]);
  }

  private generatePoints(options: FeatureOptions, featureFiles: string[], condition?: any) {
    if (featureFiles.every(fs.existsSync)) {
      let points: any[][] = this.initPoints(featureFiles[0], condition);
      if (options.doubletime) points = points.filter((_,i) => i % 2 == 0);
      const add7 = options.selectedFeatures.indexOf(FEATURES.JOHAN_SEVENTHS) >= 0;
      return featureFiles.slice(1)
        .reduce((p,f) => this.addFeature(f, p, add7), points)
        .filter(p => p.every(x => x != null));
    }
  }

  private initPoints(filename: string, condition?: any): number[][] {
    if (filename.indexOf(FEATURES.MADMOM_BARS.name) >= 0) {
      return condition == '1' ? this.getMadmomDownbeats(filename).map(b => [b])
        : this.getMadmomBeats(filename).map(b => [b]);
    } else if (filename.indexOf(FEATURES.MADHAN_BARS.file) >= 0) {
      return this.getMadhanBars(filename).map(b => [b]);
    } else if (filename.indexOf(FEATURES.FLOHAN_BEATS.file) >= 0) {
      return this.getFlohanBeats(filename).map(b => [b]);
    } else if (filename.indexOf(FEATURES.ESSENTIA_BEATS.file) >= 0) {
      return this.getEssentiaBeats(filename).map(b => [b]);
    }
    return this.getVampValues(filename, condition).map(v => [v.time]);
  }

  private addFeature(filename: string, points: number[][], add7ths?: boolean) {
    if (filename.indexOf(FEATURES.JOHAN_CHORDS.name) >= 0) {
      return this.addJohanChords(filename, points, add7ths);
    } else if (filename.indexOf(FEATURES.TRANSCRIPTION.name) >= 0) {
      return this.addVampTranscription(filename, points);
    }
    return this.addVampFeatureMeans(filename, points);
  }

  private addVampTranscription(filename: string, points: number[][]) {
    const times = points.map(p => p[0]);
    let values = this.getGroupedVampValues(filename, times);
    values = this.filterMinProportion(values, times, 0.2);
    values = values.map(vs =>
      this.mergeVampValues(vs, v => (v.value % 12).toString()));
    values = this.filterMaxDurations(values, times, 3);
    const pcSets = values.map(g => g.map(v => v.value));
    return _.zip(points, pcSets);
  }

  private mergeVampValues(values: VampValue[], func: (v: VampValue) => string) {
    const grouped = _.groupBy(values, func);
    return _.values(_.mapValues(grouped, (vs, k) => ({
      time: _.min(vs.map(v => v.time)),
      duration: _.sum(vs.map(v => v.duration)),
      value: parseInt(k)
    })));
  }

  private addVampFeatureMeans(filename: string, points: number[][]) {
    const grouped = this.getGroupedVampValues(filename, points.map(p => p[0]));
    const means = grouped.map(g => g.map(v => v.value)).slice(1).map(g => this.mean(g));
    return _.zip(points, means);
  }

  private getEssentiaTuning(filename: string) {
    return loadJsonFile(filename)["tonal"]["tuning_frequency"];
  }

  private getEssentiaKey(filename: string) {
    const json = loadJsonFile(filename);
    return json["tonal"]["chords_key"] + " " + json["tonal"]["chords_scale"];
  }

  private addJohanChords(filename: string, points: number[][], add7ths?: boolean) {
    points.push([Infinity]); //add helper point for last segment
    const chords = this.getJohanChordValues(filename);
    const durations = _.initial(points).map((p,i) => chords.map(c =>
      this.intersectJohanDuration(p[0], points[i+1][0], c)));
    const longest = durations.map(ds => chords[indexOfMax(ds)]);
    points.pop();//remove helper point
    const pcsets = longest.map(l => labelToPCSet(l.label, add7ths));
    return _.zip(points, pcsets);
  }

  private intersectJohanDuration(start: number, end: number, chord: JohanChord) {
    return this.intersectDuration([start, end], [chord.start, chord.end]);
  }

  private mean(array: Number[] | Number[][]) {
    if (array[0] instanceof Array) {
      return _.zip(...<number[][]>array).map(a => _.mean(a));
    }
    return _.mean(array);
  }

  private filterMaxDurations(groups: VampValue[][], times: number[], count: number) {
    return groups.map((g,i) => {
      const durations = g.map(v =>
        this.intersectDuration([v.time, v.time+v.duration], [times[i], times[i+1]]));
      return _.sortBy(_.zip(g, durations), vd => vd[1])
        .slice(0, count).map(vd => vd[0]);
    });
  }

  private filterMinProportion(groups: VampValue[][], times: number[], threshold: number) {
    return groups.map((g,i) => g.filter(v => i == times.length-1
      || (this.intersectDuration([v.time, v.time+v.duration], [times[i], times[i+1]])
      / (times[i+1] - times[i]) > threshold)))
  }

  private getGroupedVampValues(filename: string, times: number[]): VampValue[][] {
    const groups: VampValue[][] = times.map(_ => []);
    this.getVampValues(filename).forEach(v => times.forEach((t,i) => {
          //event started between times[i] and times[i+1]
      if ((t <= v.time && (i == times.length-1 || v.time < times[i+1]))
          //event started before and still going on
          || (v.duration && v.time < t && t <= v.time + v.duration)) {
        groups[i].push(v);
      }
    }));
    return groups;
  }

  private intersectDuration(a: [number, number], b: [number, number]) {
    return Math.min(a[1], b[1]) - Math.max(a[0], b[0]);
  }

  getVampValues(filename: string, condition?: string): VampValue[] {
    try {
      const json = JSON.parse(this.fixVampBuggyJson(fs.readFileSync(filename, 'utf8')));
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

  private getMadhanBars(filename: string): number[] {
    const chords = this.getJohanChordValues(filename);
    const beats = this.getMadmomBeats(filename
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

  private getFlohanBeats(filename: string): number[] {
    const solutions = 5;
    const trials = 10;
    const chords = this.getJohanChordValues(filename);
    const harmonicRhythm = chords.map(c => c.start);
    //console.log(chords.map(c => c.end - c.start))
    const shortest = _.min(chords.map(c => c.end - c.start));
    const maxTime = _.last(harmonicRhythm);
    let grids = [this.getGrid(0, shortest, maxTime)];
    let errors = grids.map(g => this.getError(g, harmonicRhythm));
    let previousMinError = Infinity;
    let minError = _.min(errors);
    let precision = 10;
    while (minError < previousMinError && precision > 0.0001) {
      let newGrids = _.flatten(_.flatten(
        grids.map(g => _.times(trials, i => _.times(trials, j =>
          this.getGrid(g.offset+((i-(trials/2))/trials*precision),
            g.unit+((j-(trials/2))/trials*precision), maxTime))))));
      newGrids = _.uniqBy(newGrids, g => g.offset + " " + g.unit)
        .filter(g => g.unit > 0 && 0 <= g.offset && g.offset < g.unit);
      const newErrors = newGrids.map(g => this.getError(g, harmonicRhythm));
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

  private getGrid(offset: number, unit: number, max: number): Grid {
    return {
      offset: offset,
      unit: unit,
      points: _.times((max-offset)/unit, i => offset + i*unit)
    }
  }

  private getError(grid: Grid, times: number[]) {
    return _.sum(times.map(h => {
      const dist = (h-grid.offset) % grid.unit;
      return Math.min(dist, grid.unit-dist);
    }))
    + _.sum(grid.points.map(g => _.min(times.map(h => Math.abs(g-h)))))
  }

  private getJohanChordValues(filename: string): JohanChord[] {
    const json = JSON.parse(fs.readFileSync(filename, 'utf8'));
    return json['chordSequence'];
  }

  private getMadmomDownbeats(filename: string): number[] {
    return fs.readFileSync(filename, 'utf8').split('\n').map(l => l.split('\t'))
      .filter(l => l[1] == '1').map(l => parseFloat(l[0]));
  }

  private getMadmomBeats(filename: string): number[] {
    return fs.readFileSync(filename, 'utf8').split('\n').map(parseFloat);
  }

  private getEssentiaBeats(filename: string): number[] {
    return loadJsonFile(filename)["rhythm"]["beats_position"];
  }

  private fixVampBuggyJson(j: string) {
    return j.split('{').map(k =>
      k.split('}').map(l =>
        l.split(',').map(m =>
          m.split(':').map(n =>
            this.escapeVampBuggyQuotes(n)
          ).join(':')
        ).join(",")
      ).join("}")
    ).join("{");
  }

  private escapeVampBuggyQuotes(s: string) {
    s = s.replace("\\'", "'");
    
    const is = this.indexesOf(s, '"');
    if (is.length > 2) {
      const chars = s.split("");
      _.reverse(is.slice(1, -1))
        .forEach(i => chars.splice(i, 0, '\\'));
      return chars.join("");
    }
    
    s = s.replace("\\&", "&");
    s = s.replace("\\>", ">");
    s = s.replace("\\*", "*");
    s = s.replace("\\*", "*");
    s = s.replace("\\(", "(");
    s = s.replace("\\)", ")");
    return s;
  }

  private indexesOf(s: string, char: string) {
    return s.split("").map((c,i) => c == char ? i : -1).filter((i => i >= 0));
  }
}