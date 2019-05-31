import * as fs from 'fs';
import * as _ from 'lodash';
import { StructureInducer, StructureOptions, ArrayMap, CosiatecHeuristic,
  QUANT_FUNCS as QF, HEURISTICS, OPTIMIZATION } from 'siafun';
import { audioPathToDirName } from './util';
import { FeatureConfig, FEATURES } from './feature-extractor';

export interface FullOptions extends StructureOptions {
  selectedFeatures: FeatureConfig[],
  seventhChords?: boolean
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

export function getJohanBarsOptions(resultsDir: string,
    heuristic: CosiatecHeuristic = HEURISTICS.SIZE_AND_1D_COMPACTNESS(0)) {
  return getIdentityOptions([FEATURES.BARS, FEATURES.JOHAN_CHORDS],
    heuristic, resultsDir);
}

export function getChromaBarsOptions(dims: number, resultsDir: string) {
  return getSummaryOptions([FEATURES.BARS, FEATURES.CHROMA], dims,
    HEURISTICS.SIZE_AND_1D_COMPACTNESS(0), resultsDir
  );
}

export function getMfccBeatsOptions(dims: number, resultsDir: string) {
  return getSummaryOptions([FEATURES.BEATS, FEATURES.MFCC], dims,
    HEURISTICS.SIZE_AND_1D_COMPACTNESS(0), resultsDir
  );
}

export function getChromaBeatsOptions(dims: number, resultsDir: string) {
  return getSummaryOptions([FEATURES.BEATS, FEATURES.CHROMA], dims,
    HEURISTICS.SIZE_AND_1D_COMPACTNESS(0), resultsDir
  );
}

export function getIdentityOptions(features: FeatureConfig[], heuristic: CosiatecHeuristic, resultsDir: string) {
  return getOptions(features, [QF.ORDER(), QF.IDENTITY()], heuristic,
    toCacheDirName(resultsDir, features));
}

export function getSummaryOptions(features: FeatureConfig[], dims: number, heuristic: CosiatecHeuristic, resultsDir: string) {
  return getOptions(features, [QF.ORDER(), QF.SORTED_SUMMARIZE(dims)], heuristic,
    toCacheDirName(resultsDir, features, ''+dims));
}

function toCacheDirName(dir: string, features: FeatureConfig[], dims = '') {
  return dir + features[1].name + dims + features[0].name+'/' //e.g. chroma4beats
}

function getOptions(features: FeatureConfig[], quantizerFuncs: ArrayMap[],
  heuristic: CosiatecHeuristic, cacheDir?: string, siatecCacheDir?: string): FullOptions {
  const options = _.clone(STANDARD_OPTIONS);
  options.selectedFeatures = features;
  options.quantizerFunctions = quantizerFuncs;
  options.selectionHeuristic = heuristic;
  options.optimizationHeuristic = heuristic;
  //!!folder name should contain features, quantfuncs, heuristic. everything else cached
  options.cacheDir = cacheDir;
  options.siatecCacheDir = siatecCacheDir;
  fs.existsSync(cacheDir) || fs.mkdirSync(cacheDir);
  return options;
}

export function getInducerWithCaching(audio: string, points: number[][], options: FullOptions) {
  options.cacheDir = options.cacheDir+audioPathToDirName(audio)+'/';
  options.siatecCacheDir = options.siatecCacheDir ? options.siatecCacheDir+audioPathToDirName(audio)+'/' : undefined;
  fs.existsSync(options.cacheDir) || fs.mkdirSync(options.cacheDir);
  return new StructureInducer(points, options);
}