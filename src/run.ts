import * as fs from 'fs';
import * as _ from 'lodash';
import * as readline from 'readline';
import { DymoGenerator, DymoTemplates } from 'dymo-core';
import { StructureInducer, QUANT_FUNCS as QF, ArrayMap, OPTIMIZATION, HEURISTICS,
  StructureOptions, CosiatecHeuristic, getCosiatecOptionsString, getConnectednessRatings } from 'siafun';
import { DymoStructureInducer } from './dymo-structure';
import { getFeatureFiles, savePatternsFile, loadPatterns } from './file-manager';
import { FeatureExtractor, FEATURES, FeatureConfig } from './feature-extractor';
import { generatePoints, getVampValues } from './feature-parser';
import { parseAnnotations } from './salami-parser';
import { NodeFetcher, printDymoStructure, mapSeries, printPatterns, printPatternSegments, audioPathToDirName, cartesianProduct } from './util';
import { comparePatterns, mapToTimegrid, normalize } from './pattern-stats';
import { evaluate } from './eval';
import { cleanCaches } from './file-manager';

interface Features {
  segmentations: string[],
  segConditions: string[],
  otherFeatures: string[],
}

const SALAMI = '/Users/flo/Projects/Code/FAST/grateful-dead/structure/SALAMI/';
const SALAMI_AUDIO = SALAMI+'lma-audio/';
const SALAMI_ANNOTATIONS = SALAMI+'salami-data-public/annotations/';
const SALAMI_RESULTS = './results/salami/'//'/Volumes/FastSSD/salami/';

const GD = '/Volumes/gspeed1/thomasw/grateful_dead/lma_soundboards/sbd/';
const GD_LOCAL = '/Users/flo/Projects/Code/FAST/musical-structure/data/goodlovin/';
const GD_RESULTS = './results/gd/';

const featureExtractor = new FeatureExtractor();

let SELECTED_FEATURES: FeatureConfig[] = null;
let SEVENTH_CHORDS: boolean = false;//no 7th chords for now

let CACHE_DIR: string = null;
let SIATEC_CACHE_DIR: string = null;//'/Volumes/FastSSD/salami/johanbars/';

let OPTIONS: StructureOptions = {
  overlapping: true,
  optimizationDimension: 0,
  loggingLevel: -1,
  quantizerFunctions: null,
  selectionHeuristic: null,
  optimizationHeuristic: null
  //minHeuristicValue: .1,
}

function setFeaturesAndQuantizerFuncs(features: FeatureConfig[], quantizerFuncs: ArrayMap[]) {
  SELECTED_FEATURES = features;
  OPTIONS.quantizerFunctions = quantizerFuncs;
}

//!!folder name should contain features, quantfuncs, heuristic. everything else cached
function setCacheDir(dir: string, siatecDir?: string) {
  CACHE_DIR = dir;
  fs.existsSync(CACHE_DIR) || fs.mkdirSync(CACHE_DIR);
  SIATEC_CACHE_DIR = siatecDir;
}

function setHeuristic(heuristic: CosiatecHeuristic) {
  OPTIONS.selectionHeuristic = heuristic;
  OPTIONS.optimizationHeuristic = heuristic;
}

/*fs.writeFileSync('connections3.json', JSON.stringify(
  getConnectednessRatings(JSON.parse(fs.readFileSync(
    SALAMI_SSD+'chroma3bars/lma-audio_955_mp3/cosiatec_2_0_3_true.json', 'utf8')))));*/

gdJob();
//dayJob();
//nightJob();
//cleanCaches('/Volumes/FastSSD/salami/chroma4beats', 'cosiatec');

async function gdJob() {
  setFeaturesAndQuantizerFuncs([FEATURES.BARS, FEATURES.JOHAN_CHORDS],
    [QF.ORDER(), QF.IDENTITY()]);
  setCacheDir(GD_RESULTS+'johanbars/');
  setHeuristic(HEURISTICS.SIZE_AND_1D_COMPACTNESS(0));
  OPTIONS.minPatternLength = 3;
  
  await analyzeGd(Object.assign({}, OPTIONS));
  //compareGd();
}

//NEXT: chroma3bars and chroma4bars with new heuristics!!!!
async function dayJob() {
  setFeaturesAndQuantizerFuncs([FEATURES.BARS, FEATURES.JOHAN_CHORDS],
    //[QF.ORDER(), QF.SORTED_SUMMARIZE(3)]);
    [QF.ORDER(), QF.IDENTITY()]);
  setCacheDir(SALAMI_RESULTS+'johanbarscov/', SALAMI_RESULTS+'johanbars/');
  setHeuristic(HEURISTICS.COVERAGE);
  const VARIATIONS: [string, any[]][] = [
    ["optimizationMethods", [[], [OPTIMIZATION.PARTITION], [OPTIMIZATION.DIVIDE], [OPTIMIZATION.MINIMIZE]]],
    ["minPatternLength", [3]],
    ["numPatterns", [undefined, 5, 10]]
  ]
  const startTime = Date.now()
  await runBatchSalami(OPTIONS, VARIATIONS, [], 0);
  console.log("DURATION", (Date.now()-startTime)/1000, "secs")
}

function nightJob() {
  setFeaturesAndQuantizerFuncs([FEATURES.BEATS, FEATURES.CHROMA],
    [QF.ORDER(), QF.SORTED_SUMMARIZE(4)]);
  setCacheDir(SALAMI_RESULTS+'chroma4beats/');
  setHeuristic(HEURISTICS.SIZE_AND_1D_COMPACTNESS(0));
  const VARIATIONS: [string, any[]][] = [
    ["optimizationMethods", [[], [OPTIMIZATION.PARTITION], [OPTIMIZATION.DIVIDE], [OPTIMIZATION.MINIMIZE]]],
    ["minPatternLength", [7, 15]],
    ["numPatterns", [undefined, 5, 10]]
  ]
  runBatchSalami(OPTIONS, VARIATIONS, [], 700);
}

async function runBatchSalami(basis: StructureOptions, variations: [string, any[]][], exclude: number[], maxLength?: number) {
  await mapSeries(cartesianProduct(variations.map(v => v[1])), async combo => {
    const currentOptions = Object.assign({}, basis);
    combo.forEach((c: any, i: number) => currentOptions[variations[i][0]] = c);
    const evalFile = CACHE_DIR + getCosiatecOptionsString(currentOptions)
      + (currentOptions.numPatterns != null ? '_'+currentOptions.numPatterns : '')
      + '.json';
    console.log('working on config', evalFile);
    if (!fs.existsSync(evalFile)) {
      await runSalami(currentOptions, evalFile, exclude, maxLength);
    }
  });

}

async function runSalami(options: StructureOptions, evalFile: string, exclude: number[], maxLength?: number) {
  console.log('gathering files and parsing annotations');
  //gather available files and annotations
  let files = fs.readdirSync(SALAMI_AUDIO).filter(f => f.indexOf(".mp3") > 0)
    .map(f => parseInt(f.slice(0, f.indexOf(".mp3"))));
  files = files.filter(f => exclude.indexOf(f) < 0);
  
  const groundtruth = {};
  files.forEach(f => groundtruth[f] = getGroundtruth(f));
  //forget files with empty annotations and sort
  files = files.filter(f => groundtruth[f]);
  files.sort((a,b) => a-b);
  const result = {};
  await mapSeries(files, async f =>
    result[f] = await evaluateSalamiFile(f, groundtruth[f], options, maxLength));
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

async function evaluateSalamiFile(filename: number, groundtruth: [number[], number[][][]][], options: StructureOptions, maxLength = 0) {
  updateStatus('  working on SALAMI file ' + filename);
  
  if (options.loggingLevel >= 0) console.log('    extracting and parsing features', filename);
  const audio = SALAMI_AUDIO+filename+'.mp3';
  const features = await extractFeatures(audio);
  
  const timegrid = getVampValues(features.segmentations[0], features.segConditions[0])
    .map(v => v.time);
  
  if (options.loggingLevel >= 0) console.log('    mapping annotations to timegrid', filename);
  //map ground patterns to timegrid
  groundtruth.forEach(ps =>
    ps[1] = normalize(mapToTimegrid(ps[0], ps[1], timegrid, true)));
  
  if (options.loggingLevel >= 0) console.log('    inferring structure', filename);
  const points = getPoints(features);
  
  if (!maxLength || points.length < maxLength) {
    const result = await getCosiatecWithCaching(audio, points, options);
    const occurrences = result.occurrences;
    
    if (options.loggingLevel >= 0) console.log('    evaluating', filename);
    const evals = {};
    evals["numpoints"] = points.length;
    evals["numcosiatec"] = occurrences.length;
    evals["numoptimized"] = result.numOptimizedPatterns;
    evals["numsiatec"] = result.numSiatecPatterns;
    groundtruth.forEach((g,i) => {
      evals[i] = {};
      evals[i]["precision"] = evaluate(occurrences, g[1]);
      evals[i]["accuracy"] = evaluate(g[1], occurrences);
    });
    
    if (options.loggingLevel > 1) {
      groundtruth.map(p => p[1]).concat([occurrences]).forEach(p => {
        console.log('\n')
        printPatterns(_.cloneDeep(p));
        //printPatternSegments(_.cloneDeep(p));
      });
      console.log(evals);
    }
    
    return evals;
  }
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
  const points = getPoints(await extractFeatures(audioFile));
  //let patterns = new StructureInducer(points, options).getCosiatecOccurrences();
  const occs = (await getCosiatecWithCaching(audioFile, points, options)).occurrences;
  if (options.loggingLevel > 1) {
    printPatterns(_.cloneDeep(occs));
    printPatternSegments(_.cloneDeep(occs));
  }
  //await savePatternsFile(audioFile, patterns);
}

async function induceStructureWithDymos(audioFile: string): Promise<any> {
  const generator = new DymoGenerator(false, null, new NodeFetcher());
  const fs = await extractFeatures(audioFile);
  const dymo = await DymoTemplates.createSingleSourceDymoFromFeatures(
    generator, audioFile, fs.segmentations, fs.segConditions, fs.otherFeatures);
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

async function getCosiatecWithCaching(audio: string, points: number[][], options: StructureOptions) {
  options.cacheDir = CACHE_DIR+audioPathToDirName(audio)+'/';
  options.siatecCacheDir = SIATEC_CACHE_DIR ? SIATEC_CACHE_DIR+audioPathToDirName(audio)+'/' : undefined;
  fs.existsSync(options.cacheDir) || fs.mkdirSync(options.cacheDir);
  return new StructureInducer(points, options).getCosiatecIndexOccurrences();
}

async function extractFeatures(audioPath: string) {
  await featureExtractor.extractFeatures([audioPath], SELECTED_FEATURES);
  const featureFiles = await getFeatureFiles(audioPath);
  return filterSelectedFeatures(featureFiles);
}

function getPoints(features: Features) {
  return generatePoints(
    [features.segmentations[0]].concat(...features.otherFeatures),
    features.segConditions[0],
    SEVENTH_CHORDS);
}

function filterSelectedFeatures(featureFiles: string[]): Features {
  const segs = SELECTED_FEATURES.filter(f => f.isSegmentation);
  const others = SELECTED_FEATURES.filter(f => !f.isSegmentation);
  const segFiles = getFiles(segs, featureFiles);
  const segConditions = segFiles.map((_,i) => segs[i]['subset']);
  return {
    segmentations: segFiles,
    segConditions: segConditions.filter((_,i)=>segFiles[i]),
    otherFeatures: getFiles(others, featureFiles),
  };
}

function getFiles(features: FeatureConfig[], files: string[]) {
  return features.map(f => files.filter(u => u.indexOf(f.name) >= 0)[0]);
}
