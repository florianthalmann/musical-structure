import * as fs from 'fs';
import * as _ from 'lodash';
import { StructureInducer, StructureOptions, ArrayMap, CosiatecHeuristic,
  QUANT_FUNCS as QF, HEURISTICS, OPTIMIZATION } from 'siafun';
import { audioPathToDirName } from './util';
import { initDirRec } from './file-manager';
import { FeatureConfig, FEATURES } from './feature-extractor';

export interface FullOptions extends StructureOptions {
  selectedFeatures: FeatureConfig[],
  seventhChords?: boolean,
  doubletime?: boolean
}

const STANDARD_OPTIONS: FullOptions = {
  selectedFeatures: [],
  overlapping: true,
  optimizationDimension: 0,
  loggingLevel: -1,
  quantizerFunctions: null,
  selectionHeuristic: null,
  optimizationHeuristic: null
  //minHeuristicValue: .1,
}

export function getVariations(minPatternLengths: number[]): [string, any[]][] {
  return [
    ["optimizationMethods", [[], [OPTIMIZATION.PARTITION], [OPTIMIZATION.DIVIDE], [OPTIMIZATION.MINIMIZE]]],
    ["minPatternLength", minPatternLengths],
    ["numPatterns", [undefined, 5, 10]]
  ]
}

export function getBestGdOptions(resultsDir: string, doubletime?: boolean) {
  const options = getJohanBarsOptions(resultsDir,
    HEURISTICS.SIZE_AND_1D_COMPACTNESS_AXIS2(0), doubletime);
  options.minPatternLength = 3;
  options.optimizationHeuristic = HEURISTICS.SIZE_AND_1D_COMPACTNESS(0);
  options.optimizationMethods = [OPTIMIZATION.PARTITION];
  options.ignoreNovelty = true;
  options.minHeuristicValue = 1//0.00001;
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
  doubletime?: boolean, heuristic?: CosiatecHeuristic, cacheDir?: string, dims = ''): FullOptions {
  const options = _.clone(STANDARD_OPTIONS);
  options.selectedFeatures = features;
  options.quantizerFunctions = quantizerFuncs;
  options.selectionHeuristic = heuristic;
  options.optimizationHeuristic = heuristic;
  options.doubletime = doubletime;
  if (cacheDir) {
    //!!folder name should contain features and quantfuncs. everything else cached
    options.cacheDir = generateCacheDir(cacheDir, features, dims, doubletime);
    fs.existsSync(options.cacheDir) || initDirRec(options.cacheDir);
  }
  return options;
}

function generateCacheDir(baseDir: string, features: FeatureConfig[], dims = '', doubletime?: boolean) {
  const addition = doubletime ? "double" : "";
  //add hybrid etc
  return baseDir + features[1].name + dims + features[0].name + addition+'/' //e.g. chroma4beatsdouble
}

export function getInducerWithCaching(audio: string, points: number[][], options: FullOptions) {
  options = _.clone(options);
  options.cacheDir = options.cacheDir+audioPathToDirName(audio)+'/';
  fs.existsSync(options.cacheDir) || fs.mkdirSync(options.cacheDir);
  return new StructureInducer(points, options);
}
