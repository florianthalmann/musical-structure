import * as fs from 'fs';
import * as _ from 'lodash';
import { OpsiatecOptions, SmithWatermanOptions, ArrayMap, CosiatecHeuristic,
  CacheableStructureOptions, QUANT_FUNCS as QF, HEURISTICS, OPTIMIZATION } from 'siafun';
import { audioPathToDirName } from './util';
import { initDirRec } from './file-manager';
import { FeatureConfig, FEATURES } from './feature-extractor';

export interface FeatureOptions {
  selectedFeatures: FeatureConfig[],
  quantizerFunctions: ArrayMap[],
  seventhChords?: boolean,
  doubletime?: boolean,
  transpose?: boolean
}

export interface FullSIAOptions extends OpsiatecOptions, FeatureOptions {}

export interface FullSWOptions extends SmithWatermanOptions, FeatureOptions {}

const STANDARD_OPTIONS: FullSIAOptions = {
  quantizerFunctions: null,
  selectedFeatures: [],
  overlapping: true,
  optimizationDimension: 0,
  loggingLevel: -1,
  selectionHeuristic: null,
  optimizationHeuristic: null
  //minHeuristicValue: .1,
}

const SW_OPTIONS: FullSWOptions = {
  quantizerFunctions: null,
  selectedFeatures: null,
  maxIterations: 10,//true,
  fillGaps: true, //turn off for similarity graphs!!
  //similarityThreshold: .95,
  minSegmentLength: 5, //only take segments longer than this
  maxThreshold: 50, //stop when max value below this
  //endThreshold: 0,
  onlyDiagonals: true,
  //nLongest: 10,
  maxGapSize: 2,
  //maxGaps: 5,
  minDistance: 2
}

export function getVariations(minPatternLengths: number[]): [string, any[]][] {
  return [
    ["optimizationMethods", [[], [OPTIMIZATION.PARTITION], [OPTIMIZATION.DIVIDE], [OPTIMIZATION.MINIMIZE]]],
    ["minPatternLength", minPatternLengths],
    ["numPatterns", [undefined, 5, 10]]
  ]
}

export function getCompressionOptions(resultsDir: string) {
  const options = getJohanBarsOptions(resultsDir, HEURISTICS.SIZE_AND_1D_COMPACTNESS_AXIS2(0));
  //options.optimizationHeuristic = HEURISTICS.SIZE_AND_1D_COMPACTNESS(0);
  //options.optimizationMethods = [OPTIMIZATION.PARTITION];
  options.overlapping = false;
  options.minPatternLength = 1;
  return options;
}

function getFeatureOptions(doubletime?: boolean): FeatureOptions {
  return {
    selectedFeatures: [FEATURES.MADMOM_BARS, FEATURES.CHROMA],
    quantizerFunctions: [QF.ORDER(), QF.IDENTITY()],
    doubletime: doubletime,
    seventhChords: false
  }
}

export function getSwOptions(resultsDir: string, featureOptions = getFeatureOptions()) {
  const options = Object.assign(_.clone(SW_OPTIONS), featureOptions);
  addCacheDir(options, resultsDir, options.selectedFeatures, '', featureOptions.doubletime);
  return options;
}

export function getSiaOptions(resultsDir: string, featureOptions = getFeatureOptions()) {
  const options = Object.assign(getBestOptions(resultsDir, featureOptions),
    featureOptions);
  addCacheDir(options, resultsDir, options.selectedFeatures, '', featureOptions.doubletime);
  return options;
}

export function getBestOptions(resultsDir: string, featureOptions = getFeatureOptions()) {
  const options = getJohanBarsOptions(resultsDir,
    HEURISTICS.SIZE_AND_1D_COMPACTNESS_AXIS2(0), featureOptions.doubletime);
  options.minPatternLength = 3;
  options.optimizationHeuristic = HEURISTICS.SIZE_AND_1D_COMPACTNESS(0);
  options.optimizationMethods = [OPTIMIZATION.PARTITION];
  options.ignoreNovelty = true;
  options.minHeuristicValue = 1//0.00001;
  /*options.minPatternLength = 3;
  options.optimizationHeuristic = HEURISTICS.SIZE_AND_1D_COMPACTNESS(0);
  options.optimizationMethods = [OPTIMIZATION.PARTITION];
  options.ignoreNovelty = true;
  options.minHeuristicValue = 1//0.00001;*/
  return options;
}

export function getJohanBarsOptions(resultsDir: string,
    heuristic: CosiatecHeuristic = HEURISTICS.SIZE_AND_1D_COMPACTNESS(0), doubletime?: boolean) {
  return getIdentityOptions([FEATURES.MADMOM_BARS, FEATURES.JOHAN_CHORDS],
    heuristic, resultsDir, doubletime);
}

export function getChromaBarsOptions(dims: number, resultsDir: string) {
  return getSummaryOptions([FEATURES.BARS, FEATURES.CHROMA], dims,
    HEURISTICS.SIZE_AND_1D_COMPACTNESS(0), resultsDir
  );
}

export function getMfccBeatsOptions(dims: number, resultsDir: string) {
  return getSummaryOptions([FEATURES.MADMOM_BEATS, FEATURES.MFCC], dims,
    HEURISTICS.SIZE_AND_1D_COMPACTNESS(0), resultsDir
  );
}

export function getChromaBeatsOptions(dims: number, resultsDir: string) {
  return getSummaryOptions([FEATURES.MADMOM_BEATS, FEATURES.CHROMA], dims,
    HEURISTICS.SIZE_AND_1D_COMPACTNESS(0), resultsDir
  );
}

export function getIdentityOptions(features: FeatureConfig[],
    heuristic: CosiatecHeuristic, resultsDir: string, doubletime?: boolean) {
  return getOptions(features, [QF.ORDER(), QF.IDENTITY()], doubletime, heuristic, resultsDir);
}

export function getSummaryOptions(features: FeatureConfig[], dims: number,
    heuristic: CosiatecHeuristic, resultsDir: string, doubletime?: boolean) {
  return getOptions(features, [QF.ORDER(), QF.SORTED_SUMMARIZE(dims)], doubletime,
    heuristic, resultsDir, ''+dims);
}

export function getOptions(features: FeatureConfig[], quantizerFuncs: ArrayMap[],
  doubletime?: boolean, heuristic?: CosiatecHeuristic, resultsDir?: string, dims = ''): FullSIAOptions {
  const options = _.clone(STANDARD_OPTIONS);
  options.selectedFeatures = features;
  options.quantizerFunctions = quantizerFuncs;
  options.selectionHeuristic = heuristic;
  options.optimizationHeuristic = heuristic;
  options.doubletime = doubletime;
  addCacheDir(options, resultsDir, features, dims, doubletime);
  return options;
}

function addCacheDir(options: CacheableStructureOptions, baseDir: string,
    features: FeatureConfig[], dims = '', doubletime?: boolean) {
  if (baseDir) {
    //!!folder name should contain features and quantfuncs. everything else cached
    options.cacheDir = generateCacheDir(baseDir, features, dims, doubletime);
    fs.existsSync(options.cacheDir) || initDirRec(options.cacheDir);
  }
}

function generateCacheDir(baseDir: string, features: FeatureConfig[], dims = '', doubletime?: boolean) {
  const addition = doubletime ? "double" : "";
  //add hybrid etc
  return baseDir + features[1].name + dims + features[0].name + addition+'/' //e.g. chroma4beatsdouble
}

export function getOptionsWithCaching<T extends CacheableStructureOptions>(audio: string, options: T) {
  options = _.clone(options);
  options.cacheDir = options.cacheDir+audioPathToDirName(audio)+'/';
  fs.existsSync(options.cacheDir) || initDirRec(options.cacheDir);
  return options;
}
