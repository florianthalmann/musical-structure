import * as fs from 'fs';
import * as _ from 'lodash';
import { DymoGenerator, DymoTemplates } from 'dymo-core';
import { StructureInducer, QUANT_FUNCS as QF, OPTIMIZATION, HEURISTICS } from 'siafun';
import { DymoStructureInducer } from './dymo-structure';
import { getFeatureFiles, savePatternsFile, loadPatterns } from './file-manager';
import { FeatureExtractor, FEATURES, FeatureConfig } from './feature-extractor';
import { generatePoints } from './feature-parser';
import { parseAnnotations } from './salami-parser';
import { NodeFetcher, printDymoStructure, mapSeries, printPatterns, printPatternSegments } from './util';
import { comparePatterns } from './pattern-stats';

const SALAMI = '/Users/flo/Projects/Code/FAST/grateful-dead/structure/SALAMI/';
const SALAMI_AUDIO = SALAMI+'lma-audio/';
const SALAMI_ANNOTATIONS = SALAMI+'salami-data-public/annotations/';
const FILE = '955';

const GD = '/Volumes/gspeed1/thomasw/grateful_dead/lma_soundboards/sbd/';
const GD_LOCAL = '/Users/flo/Projects/Code/FAST/musical-structure/data/goodlovin/';

const SELECTED_FEATURES = [FEATURES.BARS, FEATURES.JOHAN_CHORDS];

const featureExtractor = new FeatureExtractor();

runSalami();
//analyzeGd();
//compareGd();

async function runSalami() {
  const audio = SALAMI_AUDIO+FILE+'.mp3';
  const annotations = SALAMI_ANNOTATIONS+FILE+'/textfile1.txt';
  const patterns = parseAnnotations(annotations, true)[1];
  printPatterns(_.cloneDeep(patterns));
  printPatternSegments(_.cloneDeep(patterns));
  /*await featureExtractor.extractFeatures([audio], SELECTED_FEATURES);
  console.log('inducing structure for', audio);
  await induceStructure(audio);
  //await plot();*/
}

async function analyzeGd() {
  const songs = JSON.parse(fs.readFileSync('data/top_song_map2.json', 'utf8'));
  //await mapSeries(Object.keys(songs), k =>
  //await mapSeries(["good lovin'"], k =>
    //mapSeries(songs[k], async (s: any) => {
    for (let i = 0; i < songs["good lovin'"].length; i++) {
      const s: any = songs["good lovin'"][i];
      const songPath = GD_LOCAL+s.recording+'/'+s.track;
      console.log('working on', "good lovin'", ' - ', s.track);
      if (!loadPatterns(songPath)) {
        if (fs.existsSync(songPath)) {
          await featureExtractor.extractFeatures([songPath], SELECTED_FEATURES);
          await induceStructure(songPath);
        } else {
          console.log("\nNOT FOUND:", songPath, "\n");
        }
      }
    }
  //);
}

async function compareGd() {
  const songs = JSON.parse(fs.readFileSync('data/top_song_map2.json', 'utf8'));
  const patterns = songs["good lovin'"].map(s =>
    loadPatterns(GD_LOCAL+s.recording+'/'+s.track)).filter(p => p);
  console.log(patterns.length)
  comparePatterns(patterns);
}

/*function plot(): Promise<any> {
  return new Promise(resolve => {
    execute('python '+ROOT+'../plot.py '+ROOT+DIRS.out, success => resolve());
  })
}*/

const OPTIONS = {
  quantizerFunctions: [QF.ORDER(), QF.IDENTITY()], //QF.SORTED_SUMMARIZE(3)], //QF.CLUSTER(50)],//QF.SORTED_SUMMARIZE(3)],
  selectionHeuristic: HEURISTICS.SIZE_AND_1D_COMPACTNESS(0),
  overlapping: true,
  optimizationMethods: [OPTIMIZATION.PARTITION],//, OPTIMIZATION.DIVIDE],
  optimizationHeuristic: HEURISTICS.SIZE_AND_1D_COMPACTNESS(0),
  optimizationDimension: 0,
  minPatternLength: 2,
  loggingOn: true
  //minHeuristicValue: 0.1
  //TRY AGAIN ON
}

async function induceStructure(audioFile: string): Promise<any> {
  const featureFiles = await getFeatureFiles(audioFile);
  const filtered = filterSelectedFeatures(featureFiles);
  const points = generatePoints([filtered.segs[0]].concat(...filtered.feats),
    filtered.segConditions[0], false); //no 7th chords for now
  //let patterns = new StructureInducer(points, OPTIONS).getCosiatecOccurrences();
  let patterns = new StructureInducer(points, OPTIONS).getCosiatecPatterns();
  patterns = patterns.filter(p => p[0].length > 1);
  if (OPTIONS.loggingOn) {
    printPatterns(_.cloneDeep(patterns));
    printPatternSegments(_.cloneDeep(patterns));
  }
  //await savePatternsFile(audioFile, patterns);
}

async function induceStructureWithDymos(audioFile: string): Promise<any> {
  const generator = new DymoGenerator(false, null, new NodeFetcher());
  const featureFiles = await getFeatureFiles(audioFile);
  const filtered = filterSelectedFeatures(featureFiles);
  const dymo = await DymoTemplates.createSingleSourceDymoFromFeatures(
    generator, audioFile, filtered.segs, filtered.segConditions, filtered.feats);
  await printDymoStructure(generator.getStore(), dymo);
  await new DymoStructureInducer(generator.getStore())
    .addStructureToDymo(generator.getCurrentTopDymo(), {
      quantizerFunctions: [QF.CONSTANT(0), QF.CONSTANT(0), QF.ORDER(), QF.CONSTANT(0), QF.SORTED_SUMMARIZE(3)], //QF.CLUSTER(50)],//QF.SORTED_SUMMARIZE(3)],
      selectionHeuristic: HEURISTICS.SIZE_AND_1D_COMPACTNESS(2),
      overlapping: true,
      optimizationMethods: [OPTIMIZATION.PARTITION],//, OPTIMIZATION.DIVIDE],
      optimizationHeuristic: HEURISTICS.SIZE_AND_1D_COMPACTNESS(2),
      optimizationDimension: 2,
      minPatternLength: 3,
      //minHeuristicValue: 0.1
      //TRY AGAIN ON
    });
  //await printDymoStructure(generator.getStore(), dymo);
}

function filterSelectedFeatures(featureFiles: string[]) {
  const segs = SELECTED_FEATURES.filter(f => f.isSegmentation);
  const segFiles = getFiles(segs, featureFiles);
  const segConditions = segFiles.map((_,i) => segs[i]['subset']);
  const others = getFiles(SELECTED_FEATURES.filter(f => !f.isSegmentation), featureFiles);
  return {
    segs:segFiles.filter(s=>s),
    segConditions:segConditions.filter((_,i)=>segFiles[i]),
    feats:others.filter(f=>f),
  };
}

function getFiles(features: FeatureConfig[], files: string[]) {
  return features.map(f => files.filter(u => u.indexOf(f.name) >= 0)[0]);
}
