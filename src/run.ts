import * as fs from 'fs';
import * as _ from 'lodash';
import * as readline from 'readline';
import { DymoGenerator, DymoTemplates } from 'dymo-core';
import { StructureInducer, QUANT_FUNCS as QF, OPTIMIZATION, HEURISTICS, StructureOptions, getCosiatecOptionsString } from 'siafun';
import { DymoStructureInducer } from './dymo-structure';
import { getFeatureFiles, savePatternsFile, loadPatterns } from './file-manager';
import { FeatureExtractor, FEATURES, FeatureConfig } from './feature-extractor';
import { generatePoints, getVampValues } from './feature-parser';
import { parseAnnotations } from './salami-parser';
import { NodeFetcher, printDymoStructure, mapSeries, printPatterns, printPatternSegments, audioPathToDirName, cartesianProduct } from './util';
import { comparePatterns, mapToTimegrid, normalize } from './pattern-stats';
import { evaluate } from './eval';
import { RESULTS_DIR } from './config';
import { cleanOptimizationCaches } from './file-manager';

const SALAMI = '/Users/flo/Projects/Code/FAST/grateful-dead/structure/SALAMI/';
const SALAMI_AUDIO = SALAMI+'lma-audio/';
const SALAMI_ANNOTATIONS = SALAMI+'salami-data-public/annotations/';
const FILE = '955';

const GD = '/Volumes/gspeed1/thomasw/grateful_dead/lma_soundboards/sbd/';
const GD_LOCAL = '/Users/flo/Projects/Code/FAST/musical-structure/data/goodlovin/';

const featureExtractor = new FeatureExtractor();

const SELECTED_FEATURES = [FEATURES.BARS, FEATURES.CHROMA];

//!!folder name should contain features, quantfuncs, heuristic. everything else cached
const CACHE_DIR = RESULTS_DIR+'salami/chromaclusters5bars/';
fs.existsSync(CACHE_DIR) || fs.mkdirSync(CACHE_DIR);

const CONSTANT = {
  selectionHeuristic: HEURISTICS.SIZE_AND_1D_COMPACTNESS(0),
  overlapping: true,
  optimizationHeuristic: HEURISTICS.SIZE_AND_1D_COMPACTNESS(0),
  optimizationDimension: 0,
  loggingLevel: -1,
}

const BASIS = {
  //quantizerFunctions: [QF.ORDER(), QF.IDENTITY()], //QF.SORTED_SUMMARIZE(3)], //QF.CLUSTER(50)],//QF.SORTED_SUMMARIZE(3)],
  quantizerFunctions: [QF.ORDER(), QF.CLUSTER(5)],
  //minHeuristicValue: .1,
};

const VARIATIONS: [string, any[]][] = [
  ["optimizationMethods", [[], [OPTIMIZATION.PARTITION]]],
  ["minPatternLength", [3]],
  ["numPatterns", [undefined, 5, 10]]
]

runBatchSalami(Object.assign({}, CONSTANT, BASIS), VARIATIONS);
//analyzeGd();
//compareGd();
//cleanOptimizationCaches(RESULTS_DIR+'salami/chroma3bars')

async function runBatchSalami(basis: StructureOptions, variations?: [string, any[]][]) {
  await mapSeries(cartesianProduct(variations.map(v => v[1])), async combo => {
    const currentOptions = Object.assign({}, basis);
    combo.forEach((c: any, i: number) => currentOptions[variations[i][0]] = c);
    const evalFile = CACHE_DIR + getCosiatecOptionsString(currentOptions)
      + (currentOptions.numPatterns != null ? '_'+currentOptions.numPatterns : '')
      + '.json';
    console.log('working on config', evalFile);
    if (!fs.existsSync(evalFile)) {
      await runSalami(currentOptions, evalFile);
    }
  });

}

async function runSalami(options: StructureOptions, evalFile: string) {
  console.log('gathering files and parsing annotations');
  //gather available files and annotations
  let files = fs.readdirSync(SALAMI_AUDIO).filter(f => f.indexOf(".mp3") > 0)
    .map(f => parseInt(f.slice(0, f.indexOf(".mp3"))));
  const groundtruth = {};
  files.forEach(f => groundtruth[f] = getGroundtruth(f));
  //forget files with empty annotations and sort
  files = files.filter(f => groundtruth[f]);
  files.sort((a,b) => a-b);
  const result = {};
  await mapSeries(files, async f =>
    result[f] = await evaluateSalamiFile(f, groundtruth[f], options));
  console.log(); //TODO deal with status update properly
  fs.writeFileSync(evalFile, JSON.stringify(result));
}

function getGroundtruth(filename: number) {
  //find available annotation files
  const annotations = fs.existsSync(SALAMI_ANNOTATIONS+filename+'/') ?
    fs.readdirSync(SALAMI_ANNOTATIONS+filename+'/')
      .filter(f => f.indexOf(".txt") > 0)
      .map(f => SALAMI_ANNOTATIONS+filename+'/'+f)
    : [];
  //parse ground truth and filter out annotations without repetitions (and empty ones like 964)
  const groundPatterns = annotations.map(a => parseAnnotations(a, true, true))
    .filter(g => g[1].length > 0);
  
  return groundPatterns.length > 0 ? groundPatterns : undefined;
}

function updateStatus(s: string) {
  readline.cursorTo(process.stdout, 0);
  process.stdout.write(s);
}

async function evaluateSalamiFile(filename: number, groundtruth: [number[], number[][][]][], options: StructureOptions) {
  updateStatus('  working on SALAMI file ' + filename);
  
  if (options.loggingLevel >= 0) console.log('    extracting and parsing features', filename);
  const audio = SALAMI_AUDIO+filename+'.mp3';
  await featureExtractor.extractFeatures([audio], SELECTED_FEATURES);
  const featureFiles = await getFeatureFiles(audio);
  const filtered = filterSelectedFeatures(featureFiles);
  const timegrid = getVampValues(filtered.segs[0], filtered.segConditions[0])
    .map(v => v.time);
  
  if (options.loggingLevel >= 0) console.log('    mapping annotations to timegrid', filename);
  //map ground patterns to timegrid
  groundtruth.forEach(ps =>
    ps[1] = normalize(mapToTimegrid(ps[0], ps[1], timegrid, true)));
  
  if (options.loggingLevel >= 0) console.log('    inferring structure', filename);
  const points = generatePoints([filtered.segs[0]].concat(...filtered.feats),
    filtered.segConditions[0], false); //no 7th chords for now
  options.cacheDir = CACHE_DIR+audioPathToDirName(audio)+'/';
  fs.existsSync(options.cacheDir) || fs.mkdirSync(options.cacheDir);
  const patterns = new StructureInducer(points, options).getCosiatecPatterns();
  
  if (options.loggingLevel >= 0) console.log('    evaluating', filename);
  const evals = {};
  groundtruth.forEach((g,i) => {
    evals[i] = {};
    evals[i]["precision"] = evaluate(patterns, g[1]);
    evals[i]["accuracy"] = evaluate(g[1], patterns);
  });
  
  if (options.loggingLevel > 1) {
    groundtruth.map(p => p[1]).concat([patterns]).forEach(p => {
      console.log('\n')
      printPatterns(_.cloneDeep(p));
      //printPatternSegments(_.cloneDeep(p));
    });
    console.log(evals);
  }
  
  return evals;
}

async function analyzeGd(options: StructureOptions) {
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
          await induceStructure(songPath, options);
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

async function induceStructure(audioFile: string, options: StructureOptions): Promise<any> {
  const featureFiles = await getFeatureFiles(audioFile);
  const filtered = filterSelectedFeatures(featureFiles);
  const points = generatePoints([filtered.segs[0]].concat(...filtered.feats),
    filtered.segConditions[0], false); //no 7th chords for now
  //let patterns = new StructureInducer(points, options).getCosiatecOccurrences();
  let patterns = new StructureInducer(points, options).getCosiatecPatterns();
  patterns = patterns.filter(p => p[0].length > 1);
  if (options.loggingLevel > 1) {
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
