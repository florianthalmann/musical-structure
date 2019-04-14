import * as fs from 'fs';
import * as _ from 'lodash';
import * as readline from 'readline';
import { DymoGenerator, DymoTemplates } from 'dymo-core';
import { StructureInducer, QUANT_FUNCS as QF, ArrayMap, OPTIMIZATION, HEURISTICS,
  StructureOptions, CosiatecHeuristic, getCosiatecOptionsString, getConnectednessRatings } from 'siafun';
import { DymoStructureInducer } from './dymo-structure';
import { getFeatureFiles } from './file-manager';
import { FeatureExtractor, FEATURES, FeatureConfig } from './feature-extractor';
import { generatePoints, getVampValues } from './feature-parser';
import { Annotation, getAnnotations } from './salami-parser';
import { NodeFetcher, printDymoStructure, mapSeries, printPatterns, printPatternSegments, audioPathToDirName, cartesianProduct } from './util';
import { saveSimilarityPatternGraph, analyzePatternGraph, mapToTimegrid, normalize } from './pattern-stats';
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
const GD_RESULTS = '/Volumes/FastSSD/gd/';

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
  /*setFeaturesAndQuantizerFuncs([FEATURES.BEATS, FEATURES.JOHAN_CHORDS],
    [QF.ORDER(), QF.IDENTITY()]);//QF.SORTED_SUMMARIZE(4)]);
  setCacheDir(GD_RESULTS+'goodlovin/johanbeats/');
  setHeuristic(HEURISTICS.SIZE_AND_1D_COMPACTNESS(0));
  OPTIONS.minPatternLength = 3;
  OPTIONS.optimizationMethods = [OPTIMIZATION.PARTITION];
  OPTIONS.numPatterns = 100;*/
  
  setFeaturesAndQuantizerFuncs([FEATURES.BARS, FEATURES.JOHAN_CHORDS],
    [QF.ORDER(), QF.IDENTITY()]);
  setCacheDir(GD_RESULTS+'goodlovin/johanbars/');
  setHeuristic(HEURISTICS.SIZE_AND_1D_COMPACTNESS(0));
  OPTIONS.minPatternLength = 3;
  OPTIONS.optimizationMethods = [OPTIMIZATION.PARTITION];
  //OPTIONS.numPatterns = 100;
  
  
  await saveGdPatternGraphs(["good lovin'"], Object.assign({}, OPTIONS), 30)//, 800);
  
  analyzePatternGraph("good lovin'.json");
  
  //analyzePatternGraph("results/gd/goodlovin-chroma4bars-vecs.json");
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
  
  const groundtruth = new Map<number, Annotation[]>();
  files.forEach(f => groundtruth.set(f, getAnnotations(SALAMI_ANNOTATIONS+f+'/')));
  //forget files with empty annotations and sort
  files = files.filter(f => groundtruth.get(f));
  files.sort((a,b) => a-b);
  
  const result = {};
  await mapSeries(files, async f =>
    result[f] = await evaluateSalamiFile(f, groundtruth.get(f), options, maxLength));
  console.log(); //TODO deal with status update properly
  fs.writeFileSync(evalFile, JSON.stringify(result));
}

function updateStatus(s: string) {
  readline.cursorTo(process.stdout, 0);
  process.stdout.write(s);
}

async function evaluateSalamiFile(filename: number, groundtruth: Annotation[], options: StructureOptions, maxLength = 0) {
  updateStatus('  working on SALAMI file ' + filename);
  
  if (options.loggingLevel >= 0) console.log('    extracting and parsing features', filename);
  const audio = SALAMI_AUDIO+filename+'.mp3';
  const features = await extractFeatures(audio);
  
  const timegrid = getVampValues(features.segmentations[0], features.segConditions[0])
    .map(v => v.time);
  
  if (options.loggingLevel >= 0) console.log('    mapping annotations to timegrid', filename);
  //map ground patterns to timegrid
  groundtruth.forEach(ps =>
    ps.patterns = normalize(mapToTimegrid(ps.times, ps.patterns, timegrid, true)));
  
  if (options.loggingLevel >= 0) console.log('    inferring structure', filename);
  const points = getPoints(features);
  
  if (!maxLength || points.length < maxLength) {
    const result = await getInducerWithCaching(audio, points, options)
      .getCosiatecIndexOccurrences();
    const occurrences = result.occurrences;
    
    if (options.loggingLevel >= 0) console.log('    evaluating', filename);
    const evals = {};
    evals["numpoints"] = points.length;
    evals["numcosiatec"] = occurrences.length;
    evals["numoptimized"] = result.numOptimizedPatterns;
    evals["numsiatec"] = result.numSiatecPatterns;
    groundtruth.forEach((g,i) => {
      evals[i] = {};
      evals[i]["precision"] = evaluate(occurrences, g.patterns);
      evals[i]["accuracy"] = evaluate(g.patterns, occurrences);
    });
    
    if (options.loggingLevel > 1) {
      groundtruth.map(p => p.patterns).concat([occurrences]).forEach(p => {
        console.log('\n')
        printPatterns(_.cloneDeep(p));
        //printPatternSegments(_.cloneDeep(p));
      });
      console.log(evals);
    }
    
    return evals;
  }
}

interface GdVersion {
  recording: string,
  track: string
}

async function saveGdPatternGraphs(songnames: string[], options: StructureOptions,
    versionCount?: number, maxLength?: number) {
  await mapSeries(songnames, async n => {
    let vs = getGdVersions(n);
    vs = versionCount ? vs.slice(0, versionCount) : vs;
    let results = await mapSeries(vs, (v,i) => {
      updateStatus('  working on ' + n + ' - ' + (i+1) + '/' + vs.length);
      return induceStructure(v, options, maxLength);
    });
    results = results.filter(r => r); //filter out empty results for ignored versions
    saveSimilarityPatternGraph(n+'.json', results, false);
    saveSimilarityPatternGraph(n+'-vecs.json', results, true);
  });
}

function getGdVersions(songname: string) {
  return getGdSongMap().get(songname).map(s => GD_LOCAL+s.recording+'/'+s.track);
}

var songMap: Map<string, GdVersion[]>;

function getGdSongMap() {
  if (!songMap) {
    const json = JSON.parse(fs.readFileSync('data/top_song_map2.json', 'utf8'));
    songMap = new Map<string, GdVersion[]>();
    _.mapValues(json, (v,k) => songMap.set(k, v));
  }
  return songMap;
}

/*function plot(): Promise<any> {
  return new Promise(resolve => {
    execute('python '+ROOT+'../plot.py '+ROOT+DIRS.out, success => resolve());
  })
}*/

async function induceStructure(audioFile: string, options: StructureOptions, maxLength?: number) {
  if (fs.existsSync(audioFile)) {
    const points = getPoints(await extractFeatures(audioFile));
    if (!maxLength || points.length < maxLength) {
      return getInducerWithCaching(audioFile, points, options)
        .getCosiatec();
    }
  } else {
    console.log("\nNOT FOUND:", audioFile, "\n");
  }
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

function getInducerWithCaching(audio: string, points: number[][], options: StructureOptions) {
  options.cacheDir = CACHE_DIR+audioPathToDirName(audio)+'/';
  options.siatecCacheDir = SIATEC_CACHE_DIR ? SIATEC_CACHE_DIR+audioPathToDirName(audio)+'/' : undefined;
  fs.existsSync(options.cacheDir) || fs.mkdirSync(options.cacheDir);
  return new StructureInducer(points, options);
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
