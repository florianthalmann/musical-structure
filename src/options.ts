import * as fs from 'fs';
import * as _ from 'lodash';
import { StructureInducer, StructureOptions, ArrayMap, CosiatecHeuristic,
  QUANT_FUNCS as QF, HEURISTICS, OPTIMIZATION } from 'siafun';
import { audioPathToDirName } from './util';
import { FeatureConfig, FEATURES } from './feature-extractor';

export interface FullOptions extends StructureOptions {
  selectedFeatures: FeatureConfig[],
  seventhChords?: boolean,
  halftime?: boolean
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

export function getBestGdOptions(resultsDir: string, halftime?: boolean) {
  const options = getJohanBarsOptions(resultsDir,
    HEURISTICS.SIZE_AND_1D_COMPACTNESS_AXIS(0), halftime);
  options.minPatternLength = 3;
  options.optimizationMethods = [OPTIMIZATION.PARTITION];
  return options;
}

export function getJohanBarsOptions(resultsDir: string,
    heuristic: CosiatecHeuristic = HEURISTICS.SIZE_AND_1D_COMPACTNESS(0), halftime?: boolean) {
  return getIdentityOptions([FEATURES.MADMOM_BARS, FEATURES.JOHAN_CHORDS],
    heuristic, resultsDir, halftime);
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
    heuristic: CosiatecHeuristic, resultsDir: string, halftime?: boolean) {
  return getOptions(features, [QF.ORDER(), QF.IDENTITY()], halftime, heuristic, resultsDir);
}

export function getSummaryOptions(features: FeatureConfig[], dims: number,
    heuristic: CosiatecHeuristic, resultsDir: string, halftime?: boolean) {
  return getOptions(features, [QF.ORDER(), QF.SORTED_SUMMARIZE(dims)], halftime,
    heuristic, resultsDir, ''+dims);
}

export function getOptions(features: FeatureConfig[], quantizerFuncs: ArrayMap[],
  halftime?: boolean, heuristic?: CosiatecHeuristic, cacheDir?: string, dims = ''): FullOptions {
  const options = _.clone(STANDARD_OPTIONS);
  options.selectedFeatures = features;
  options.quantizerFunctions = quantizerFuncs;
  options.selectionHeuristic = heuristic;
  options.optimizationHeuristic = heuristic;
  options.halftime = halftime;
  if (cacheDir) {
    //!!folder name should contain features, quantfuncs, heuristic. everything else cached
    options.siatecCacheDir = generateSiatecCacheDir(cacheDir, features, dims);
    options.cacheDir = generateCosiatecCacheDir(options.selectionHeuristic, options.siatecCacheDir);
    fs.existsSync(options.cacheDir) || fs.mkdirSync(options.cacheDir);
    fs.existsSync(options.siatecCacheDir) || fs.mkdirSync(options.siatecCacheDir);
  }
  return options;
}

function generateCosiatecCacheDir(heuristic: CosiatecHeuristic, siatecCacheDir: string) {
  return siatecCacheDir.slice(0, -1) + heuristicToName(heuristic) + '/';
}

function generateSiatecCacheDir(baseDir: string, features: FeatureConfig[], dims = '', halftime?: boolean) {
  const addition = halftime ? "half" : "";
  return baseDir + features[1].name + dims + features[0].name + addition+'/' //e.g. chroma4beatshalf
}

function heuristicToName(heuristic: CosiatecHeuristic) {
  const str = heuristic.toString();
  const name = str === HEURISTICS.SIZE_AND_1D_COMPACTNESS(0).toString() ? "" //was standard
    : str === HEURISTICS.SIZE_AND_1D_COMPACTNESS_AXIS(0).toString() ? "s1dc0a"
    : str === HEURISTICS.SIZE_AND_1D_COMPACTNESS_NOAXIS(0).toString() ? "s1dc0na"
    : str === HEURISTICS.COMPACTNESS.toString() ? "com"
    : str === HEURISTICS.COVERAGE.toString() ? "cov" : undefined;
  if (name != null) {
    return name;
  } else throw new Error("heuristic unknown to options generator");
}

export function getInducerWithCaching(audio: string, points: number[][], options: FullOptions) {
  options = _.clone(options);
  options.cacheDir = options.cacheDir+audioPathToDirName(audio)+'/';
  options.siatecCacheDir = options.siatecCacheDir ? options.siatecCacheDir+audioPathToDirName(audio)+'/' : undefined;
  fs.existsSync(options.cacheDir) || fs.mkdirSync(options.cacheDir);
  fs.existsSync(options.siatecCacheDir) || fs.mkdirSync(options.siatecCacheDir);
  return new StructureInducer(points, options);
}