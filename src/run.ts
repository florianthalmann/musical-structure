import * as fs from 'fs';
import * as _ from 'lodash';
import { DymoGenerator, DymoTemplates } from 'dymo-core';
import { IterativeSmithWatermanResult, QUANT_FUNCS as QF, OPTIMIZATION, HEURISTICS } from 'siafun';
import { DymoStructureInducer } from './dymo-structure';
import { FileManager } from './file-manager';
import { FeatureExtractor, FEATURES, FeatureConfig } from './feature-extractor';
import { NodeFetcher, printDymoStructure, mapSeries } from './util';
import { generatePoints } from './feature-parser';
import { StructureInducer } from 'siafun';
import { printPatterns, printPatternSegments } from './util';

const SALAMI = '/Users/flo/Projects/Code/FAST/grateful-dead/structure/SALAMI/';
const FILE = '955';

const GD = 'Volumes/gspeed1/thomasw/grateful_dead/lma_soundboards/sbd/';

const FILE_NAME = SALAMI+'lma-audio/'+FILE+'.mp3';
const ANNOTATION = SALAMI+'salami-data-public/annotations/'+FILE+'/textfile1.txt';

const PATTERN_FOLDER = 'patterns/';

const SELECTED_FEATURES = [FEATURES.BEATS, FEATURES.JOHAN_CHORDS];

const fileManager = new FileManager();
const featureExtractor = new FeatureExtractor();

runGd();

async function runSalami() {
  await featureExtractor.extractFeatures([FILE_NAME], SELECTED_FEATURES);
  console.log('inducing structure for', FILE_NAME);
  await induceStructure(FILE_NAME);
  //await plot();
}

async function runGd() {
  const songs = JSON.parse(fs.readFileSync('data/top_song_map2.json', 'utf8'));
  await mapSeries(Object.keys(songs).slice(-1), k =>
    mapSeries(songs[k].slice(-1), async (s: any) => {
      const songPath = GD+s.recording+'/'+s.track;
      console.log('working on', k, ' - ', s.track);
      await featureExtractor.extractFeatures([songPath], SELECTED_FEATURES);
      await induceStructure(songPath);
    })
  );
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
  minPatternLength: 3,
  loggingOn: false
  //minHeuristicValue: 0.1
  //TRY AGAIN ON
}

async function induceStructure(audioFile: string): Promise<any> {
  const featureFiles = await fileManager.getFeatureFiles(audioFile);
  const filtered = filterSelectedFeatures(featureFiles);
  const points = generatePoints([filtered.segs[0]].concat(...filtered.feats), filtered.segConditions[0]);
  let patterns = new StructureInducer(points, OPTIONS).getCosiatecOccurrences();
  patterns = patterns.filter(p => p[0].length > 1);
  if (OPTIONS.loggingOn) {
    //printPatterns(_.cloneDeep(patterns));
    //printPatternSegments(_.cloneDeep(patterns));
  }
  await savePatternFile(audioFile, patterns);
}

function savePatternFile(audioFile: string, patterns: number[][][][]) {
  const outFileName = audioFile.slice(audioFile.lastIndexOf('/')+1)
    .replace(audioFile.slice(audioFile.lastIndexOf('.')), '.json');
  fileManager.saveOutFile(PATTERN_FOLDER+outFileName, JSON.stringify(patterns));
}

async function induceStructureWithDymos(audioFile: string): Promise<any> {
  const generator = new DymoGenerator(false, null, new NodeFetcher());
  const featureFiles = await fileManager.getFeatureFiles(audioFile);
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

function postJson(path, json) {
  fileManager.saveOutFile(path, JSON.stringify(json, null, 2));
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
