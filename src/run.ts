import * as fs from 'fs';
import * as _ from 'lodash';
import { DymoGenerator, DymoTemplates } from 'dymo-core';
import { StructureInducer, QUANT_FUNCS as QF, OPTIMIZATION, HEURISTICS, StructureOptions, getCosiatecOptionsString } from 'siafun';
import { DymoStructureInducer } from './dymo-structure';
import { getFeatureFiles, savePatternsFile, loadPatterns } from './file-manager';
import { FeatureExtractor, FEATURES, FeatureConfig } from './feature-extractor';
import { generatePoints, getVampValues } from './feature-parser';
import { parseAnnotations } from './salami-parser';
import { NodeFetcher, printDymoStructure, mapSeries, printPatterns, printPatternSegments, audioPathToDirName } from './util';
import { comparePatterns, mapToTimegrid, normalize } from './pattern-stats';
import { evaluate } from './eval';
import { RESULTS_DIR } from './config';

const SALAMI = '/Users/flo/Projects/Code/FAST/grateful-dead/structure/SALAMI/';
const SALAMI_AUDIO = SALAMI+'lma-audio/';
const SALAMI_ANNOTATIONS = SALAMI+'salami-data-public/annotations/';
const FILE = '955';

const GD = '/Volumes/gspeed1/thomasw/grateful_dead/lma_soundboards/sbd/';
const GD_LOCAL = '/Users/flo/Projects/Code/FAST/musical-structure/data/goodlovin/';

const featureExtractor = new FeatureExtractor();

const SELECTED_FEATURES = [FEATURES.BARS, FEATURES.JOHAN_CHORDS];

const OPTIONS: StructureOptions = {
  quantizerFunctions: [QF.ORDER(), QF.IDENTITY()], //QF.SORTED_SUMMARIZE(3)], //QF.CLUSTER(50)],//QF.SORTED_SUMMARIZE(3)],
  //quantizerFunctions: [QF.ORDER(), QF.SORTED_SUMMARIZE(3)],
  selectionHeuristic: HEURISTICS.SIZE_AND_1D_COMPACTNESS(0),
  overlapping: true,
  optimizationMethods: [],//OPTIMIZATION.PARTITION],//, OPTIMIZATION.MINIMIZE],//, OPTIMIZATION.DIVIDE],
  optimizationHeuristic: HEURISTICS.SIZE_AND_1D_COMPACTNESS(0),
  optimizationDimension: 0,
  minPatternLength: 1,
  loggingLevel: 1,
  //minHeuristicValue: .1,
  //numPatterns: 100
}
//!!folder name should contain features, quantfuncs, heuristic. everything else cached
const CACHE_DIR = RESULTS_DIR+'salami/johanbars/';
fs.existsSync(CACHE_DIR) || fs.mkdirSync(CACHE_DIR);
const EVAL_FILE = CACHE_DIR+'*salami_'+getCosiatecOptionsString(OPTIONS)+'.json';



runSalami();
//analyzeGd();
//compareGd();

async function runSalami() {
  const files = fs.readdirSync(SALAMI_AUDIO).filter(f => f.indexOf(".mp3") > 0)
    .map(f => parseInt(f.slice(0, f.indexOf(".mp3"))));
  files.sort((a,b) => a-b);
  const result = {};
  await mapSeries(files.slice(0,5), async f => result[f] = await evaluateSalamiFile(f));
  fs.writeFileSync(EVAL_FILE, JSON.stringify(result));
}

async function evaluateSalamiFile(filename: number) {
  console.log('working on SALAMI file', filename);
  const audio = SALAMI_AUDIO+filename+'.mp3';
  await featureExtractor.extractFeatures([audio], SELECTED_FEATURES);
  const featureFiles = await getFeatureFiles(audio);
  const filtered = filterSelectedFeatures(featureFiles);
  const timegrid = getVampValues(filtered.segs[0], filtered.segConditions[0])
    .map(v => v.time);
  
  console.log('    processing annotations', filename);
  const annotations = fs.existsSync(SALAMI_ANNOTATIONS+filename+'/') ?
    fs.readdirSync(SALAMI_ANNOTATIONS+filename+'/')
      .filter(f => f.indexOf(".txt") > 0)
      .map(f => SALAMI_ANNOTATIONS+filename+'/'+f)
    : [];
  
  const groundPatterns = annotations.map(a => parseAnnotations(a, true, true));
  //map ground patterns to timegrid
  groundPatterns.forEach(ps =>
    ps[1] = normalize(mapToTimegrid(ps[0], ps[1], timegrid, true)));
  
  const points = generatePoints([filtered.segs[0]].concat(...filtered.feats),
    filtered.segConditions[0], false); //no 7th chords for now
  
  console.log('    inferring structure', filename);
  OPTIONS.cacheDir = CACHE_DIR+audioPathToDirName(audio)+'/';
  fs.existsSync(OPTIONS.cacheDir) || fs.mkdirSync(OPTIONS.cacheDir);
  const patterns = new StructureInducer(points, OPTIONS).getCosiatecPatterns();
  
  console.log('    evaluating', filename);
  const evals = {};
  groundPatterns.forEach((g,i) => {
    evals[i] = {};
    evals[i]["precision"] = evaluate(patterns, g[1]);
    evals[i]["accuracy"] = evaluate(g[1], patterns);
  });
  
  if (OPTIONS.loggingLevel > 1) {
    groundPatterns.map(p => p[1]).concat([patterns]).forEach(p => {
      console.log('\n')
      printPatterns(_.cloneDeep(p));
      //printPatternSegments(_.cloneDeep(p));
    });
    console.log(evals);
  }
  
  return evals;
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

async function induceStructure(audioFile: string): Promise<any> {
  const featureFiles = await getFeatureFiles(audioFile);
  const filtered = filterSelectedFeatures(featureFiles);
  const points = generatePoints([filtered.segs[0]].concat(...filtered.feats),
    filtered.segConditions[0], false); //no 7th chords for now
  //let patterns = new StructureInducer(points, OPTIONS).getCosiatecOccurrences();
  let patterns = new StructureInducer(points, OPTIONS).getCosiatecPatterns();
  patterns = patterns.filter(p => p[0].length > 1);
  if (OPTIONS.loggingLevel > 1) {
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
