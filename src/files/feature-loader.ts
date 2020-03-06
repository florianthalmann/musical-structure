import * as fs from 'fs';
import * as _ from 'lodash';
import { indexOfMax } from 'arrayutils';
import { Quantizer } from 'siafun';
import { FEATURES, FeatureExtractor, FeatureConfig } from './feature-extractor';
import { loadJsonFile } from './file-manager';
import { FeatureOptions } from './options';
import { mapSeries } from './util';
import { labelToPCSet, goIndexToPCSet } from './theory';

interface VampValue {
  time: number,
  duration?: number,
  value: number
}

interface ChordLabel {
  start: number,
  end: number,
  label: string | number[]
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
    const points = await mapSeries(audioFiles, a =>
      this.getPointsFromAudio(a, options));
    return options.transpose ? this.transposePoints(points) : points;
  }
  
  private transposePoints(points: any[][][]) {
    return points;
  }

  async getPointsFromAudio(audioFile: string, options: FeatureOptions) {
    const files = await this.extractor.getFeatureFiles(audioFile, options.selectedFeatures);
    return this.generatePoints(options, files);
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

  private generatePoints(options: FeatureOptions, featureFiles: string[]) {
    if (featureFiles.every(fs.existsSync)) {
      //first feature needs to be segmentation
      let points: any[][] = this.initTimePoints(featureFiles[0],
        options.selectedFeatures[0]);
      if (options.doubletime) points = points.filter((_,i) => i % 2 == 0);
      return _.zip(featureFiles, options.selectedFeatures).slice(1)
        .reduce((p,f) => this.addFeature(f[0], f[1], p), points)
        .filter(p => p.every(x => x != null));
    }
  }

  private initTimePoints(filename: string, feature: FeatureConfig): number[][] {
    if (feature.name === FEATURES.MADMOM_BARS.name) {
      return this.getMadmomDownbeats(filename).map(b => [b]);
    } else if (feature.name === FEATURES.MADMOM_BEATS.name) {
      return this.getMadmomBeats(filename).map(b => [b]);
    } else if (feature.name === FEATURES.MADHAN_BARS.name) {
      return this.getMadhanBars(filename).map(b => [b]);
    } else if (feature.name === FEATURES.FLOHAN_BEATS.name) {
      return this.getFlohanBeats(filename).map(b => [b]);
    } else if (feature.name === FEATURES.ESSENTIA_BEATS.name) {
      return this.getEssentiaBeats(filename).map(b => [b]);
    } else if (feature.name === FEATURES.FLOSSENTIA_BARS.name) {
      return this.getFlossentiaBars(filename).map(b => [b]);
    } else if (feature.name === FEATURES.FLOSSHAN_BARS.name) {
      return this.getFlosshanBars(filename).map(b => [b]);
    } else if (feature.name === FEATURES.BARS.name) {
      return this.getVampValues(filename)
        .filter(v => v.value == 1).map(v => [v.time]);
    }
    return this.getVampValues(filename).map(v => [v.time]);
  }

  private addFeature(filename: string, feature: FeatureConfig, points: number[][]) {
    if (feature.name === FEATURES.CHORDS.name) {
      return this.addVampChords(filename, points);
    } else if (feature.name === FEATURES.JOHAN_CHORDS.name) {
      return this.addJohanChords(filename, points);
    } else if (feature.name === FEATURES.JOHAN_SEVENTHS.name) {
      return this.addJohanChords(filename, points, true);
    } else if (feature.name === FEATURES.ESSENTIA_CHORDS.name) {
      return this.addEssentiaChords(filename, points);
    } else if (feature.name === FEATURES.TRANSCRIPTION.name) {
      return this.addVampTranscription(filename, points);
    } else if (feature.name === FEATURES.GO_CHORDS.name) {
      return this.addGoChords(filename, points);
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
  
  private addVampChords(filename: string, points: number[][], add7ths?: boolean) {
    return this.addChords(points, this.getVampChordValues(filename), add7ths);
  }
  
  private addGoChords(filename: string, points: number[][]) {
    return this.addChords(points, this.getGoChordValues(filename));
  }

  private addJohanChords(filename: string, points: number[][], add7ths?: boolean) {
    return this.addChords(points, this.getJohanChordValues(filename), add7ths);
  }
  
  private addEssentiaChords(filename: string, points: number[][]) {
    return this.addChords(points, this.getEssentiaChordValues(filename));
  }
  
  private addChords(points: number[][], chords: ChordLabel[], add7ths?: boolean) {
    points.push([Infinity]); //add helper point for last segment
    const durations = _.initial(points).map((p,i) => chords.map(c =>
      this.intersectChordDuration(p[0], points[i+1][0], c)));
    const longest = durations.map(ds => chords[indexOfMax(ds)]);
    points.pop(); //remove helper point
    const pcsets = longest.map(l =>
      typeof l.label == "string" ? labelToPCSet(l.label, add7ths) : l.label);
    return _.zip(points, pcsets);
  }

  private intersectChordDuration(start: number, end: number, chord: ChordLabel) {
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

  getVampValues(filename: string): VampValue[] {
    try {
      const json = JSON.parse(this.fixVampBuggyJson(fs.readFileSync(filename, 'utf8')));
      return <VampValue[]>json['annotations'][0]['data'];
    } catch (e) {
      console.log('error parsing features of '+filename+':', e);
      return [];
    }
  }
  
  private getFlosshanBars(filename: string): number[] {
    const chords = this.getJohanChordValues(filename.replace('essentia', 'johan'));
    const beats = this.getEssentiaBeats(filename);
    const harmonicRhythm = chords.map(c => c.start);
    const nearestBeats = harmonicRhythm.map(t => {
      const dists = beats.map(b => Math.abs(b-t));
      return dists.indexOf(_.min(dists));
    });
    
    //assume 4/4 for now but could be generalized!!!!
    const METER = 4;
    const bestDownbeats = _.range(0,METER).map(m =>
      nearestBeats.filter(i => (i-m)%METER == 0).length);
    const firstBarline = bestDownbeats.indexOf(_.max(bestDownbeats));
    return beats.slice(firstBarline).filter((_b,i) => i%METER === 0);
  }
  
  private getFlossentiaBars(filename: string): number[] {
    const chords = this.getEssentiaChordValues(filename.replace('essentia', 'freesound'));
    const beats = this.getEssentiaBeats(filename);
    const harmonicRhythm = chords.map(c => c.start);
    const nearestBeats = harmonicRhythm.map(t => {
      const dists = beats.map(b => Math.abs(b-t));
      return dists.indexOf(_.min(dists));
    });
    //assume 4/4 for now but could be generalized!!!!
    const METER = 4;
    const bestDownbeats = _.range(0,METER).map(m =>
      nearestBeats.filter(i => (i-m)%METER == 0).length);
    const firstBarline = bestDownbeats.indexOf(_.max(bestDownbeats));
    return beats.slice(firstBarline).filter((_b,i) => i%METER === 0);
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
  
  private getVampChordValues(filename: string): ChordLabel[] {
    const vampChords = this.getVampValues(filename);
    return this.addEnds(vampChords.map(c =>
      ({start: c.time, label: c.value.toString(), end: 0})));
  }
  
  private getGoChordValues(filename: string) {
    const chords: [number,number][] = loadJsonFile(filename)[0];
    return this.addEnds(chords.map(c =>
      ({start: c[0], label: goIndexToPCSet(c[1]), end: 0})));
  }

  private getJohanChordValues(filename: string): ChordLabel[] {
    return JSON.parse(fs.readFileSync(filename, 'utf8'))['chordSequence'];
  }
  
  private getEssentiaChordValues(filename: string): ChordLabel[] {
    const chords: string[] = JSON.parse(fs.readFileSync(filename, 'utf8'))
      ['tonal']['chords_progression']; //hop size 2048 samples
    const times: number[] = chords.map((_c,i) => (i*2048)/44100); //assuming 44100Hz
    const labels: ChordLabel[] = chords.reduce((cs, c, i) =>
      i == 0 || c !== chords[i-1] ? _.concat(cs, {start: times[i], label: c}) : cs, []);
    return this.addEnds(labels);
  }
  
  private addEnds(chords: ChordLabel[]) {
    return chords.map((c,i) => i < chords.length-1 ?
      Object.assign(c, {end: chords[i+1].start}) : c);
  }

  private getMadmomDownbeats(filename: string): number[] {
    const downbeats = fs.readFileSync(filename, 'utf8').split('\n')
      .map(l => l.split('\t')).filter(l => l[1] == '1').map(l => parseFloat(l[0]));
    if (downbeats.length <= 1) throw new Error('faulty madmom file: '+ filename);
    return downbeats;
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