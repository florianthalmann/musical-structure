import * as _ from 'lodash';
import { getCosiatec, getMultiCosiatec, getSmithWaterman, getDualSmithWaterman,
  MultiStructureResult, IterativeSmithWatermanResult, SmithWatermanOptions,
  OpsiatecOptions } from 'siafun';
import { updateStatus, audioPathToDirName } from '../files/util';
import { saveJsonFile, loadJsonFile } from '../files/file-manager';
import { getOptionsWithCaching } from '../files/options';

export enum AlignmentAlgorithm {
  SIA,
  SW,
  BOTH
}

export interface AlignmentOptions {
  algorithm: AlignmentAlgorithm,
  collectionName: string,
  audioFiles: string[],
  points: any[][][],
  patternsFolder: string,
  swOptions?: SmithWatermanOptions,
  siaOptions?: OpsiatecOptions,
  maxVersions?: number, //for multi sw or cosiatec
  numTuplesPerFile?: number, //for multi sw or cosiatec
  tupleSize?: number, //for multi sw or cosiatec
  includeSelfAlignments?: boolean //for general getAlignments function
}

export interface Alignments {
  versionTuples: [number, number][],
  alignments: MultiStructureResult[],
  versions: string[],
  versionPoints: any[][][]
}

export function extractAlignments(options: AlignmentOptions): Alignments {
  let tuples = <[number,number][]>_.flatten(_.range(options.numTuplesPerFile)
    .map(c => getMultiConfig(options, c)
    .map(pair => pair.map(s => options.audioFiles.indexOf(s)))));
  if (options.algorithm === AlignmentAlgorithm.BOTH) tuples = _.concat(tuples, tuples);
  const multis: MultiStructureResult[] = [];
  if (_.includes([AlignmentAlgorithm.SIA, AlignmentAlgorithm.BOTH], options.algorithm)) {
    multis.push(..._.flatten(getMultiCosiatecsForSong(options)));
  }
  if (_.includes([AlignmentAlgorithm.SW, AlignmentAlgorithm.BOTH], options.algorithm)) {
    multis.push(..._.flatten(getMultiSWs(options)));
  }
  if (options.includeSelfAlignments) {
    if (_.includes([AlignmentAlgorithm.SIA, AlignmentAlgorithm.BOTH], options.algorithm)) {
      const autos = getCosiatecFromAudio(options);
      multis.push(...autos.map(a => Object.assign(a, {points2: a.points})));
      tuples.push(...<[number,number][]>options.audioFiles.map((_,i) => [i,i]));
    }
    if (_.includes([AlignmentAlgorithm.SW, AlignmentAlgorithm.BOTH], options.algorithm)) {
      const autos = getSmithWatermanFromAudio(options);
      multis.push(...autos.map(a => Object.assign(a, {points2: a.points})));
      tuples.push(...<[number,number][]>options.audioFiles.map((_,i) => [i,i]));
    }
  }
  return {versionTuples: tuples, alignments: multis,
    versions: options.audioFiles, versionPoints: options.points};
}

export function getSmithWatermanFromAudio(options: AlignmentOptions) {
  return options.audioFiles.map((a,i) => {
    updateStatus('  ' + (i+1) + '/' + options.audioFiles.length);
    const sw: IterativeSmithWatermanResult
      = getSmithWaterman(options.points[i], getOptionsWithCaching(a, options.swOptions));
    sw.matrices = null; sw.segmentMatrix = null;
    (<any>sw).affinityMatrix = null; (<any>sw).smoothedMatrix = null; //reduce size for cache
    return sw;
  });
}

export function getCosiatecFromAudio(options: AlignmentOptions) {
  return options.audioFiles.map((a,i) => {
    updateStatus('  ' + (i+1) + '/' + options.audioFiles.length);
    return getCosiatec(options.points[i], getOptionsWithCaching(a, options.siaOptions));
  });
}

export function getMultiSWs(options: AlignmentOptions) {
  return _.range(options.numTuplesPerFile).map(i => {
    console.log('working on ' + options.collectionName + ' - multi ' + i);
    return getMultiSW(i, options);
  });
}

export function getMultiCosiatecsForSong(options: AlignmentOptions) {
  return _.range(options.numTuplesPerFile).map(i => {
    console.log('working on ' + options.collectionName + ' - multi ' + i);
    return getMultiCosiatecs(i, options);
  })
}

function getMultiSW(index: number, options: AlignmentOptions) {
  options.tupleSize = 2; //larger tuples not possible for sw
  const tuples = getMultiConfig(options, index);
  return tuples.map((tuple,i) => {
    updateStatus('  ' + (i+1) + '/' + tuples.length);
    const currentPoints = tuple.map(a => options.points[options.audioFiles.indexOf(a)]);
    if (currentPoints[0] && currentPoints[1]) {
      return getDualSmithWaterman(currentPoints[0], currentPoints[1],
        getOptionsWithCaching(getMultiCacheDir(...tuple), options.swOptions));
    }
    return getDualSmithWaterman([], [], getOptionsWithCaching(getMultiCacheDir(...tuple), options.swOptions));
  });
}

export function getMultiCosiatecs(index: number, options: AlignmentOptions) {
  options.tupleSize = options.tupleSize || 2; //default value 2
  const tuples = getMultiConfig(options, index);
  return tuples.map((tuple,i) => {
    updateStatus('  ' + (i+1) + '/' + tuples.length);
    const currentPoints = tuple.map(a => options.points[options.audioFiles.indexOf(a)]);
    return getMultiCosiatec(currentPoints,
      getOptionsWithCaching(getMultiCacheDir(...tuple), options.siaOptions));
  })
}

/*private async getSlicedMultiCosiatec(name: string, size: number, index: number, audioFiles: string[]) {
  const pairs = getMultiConfig(name, size, index, audioFiles);
  //TODO UPDATE PATH!!!!
  const options = getBestOptions(initDirRec(GD_PATTERNS+'/multi'+index));
  return _.flatten(await mapSeries(pairs, async (pair,i) => {
    updateStatus('  ' + (i+1) + '/' + pairs.length);
    const points = await getPointsForAudioFiles(pair, options);
    const slices = points.map(p => getSlices(p));
    const multis = _.zip(...slices).map(s => s[0].concat(s[1]));
    return multis.map(h => {
      return getInducerWithCaching(pair[0], h, options).getCosiatec();
    });
  }))
}

private getSlices<T>(array: T[]) {
  const start = array.slice(0, array.length/2);
  const middle = array.slice(array.length/4, 3*array.length/4);
  const end = array.slice(array.length/2);
  return [start, middle, end];
}*/

export function getMultiCacheDir(...audio: string[]) {
  let names = audio.map(audioPathToDirName)
  //only odd chars if too long :)
  if (audio.length > 3) names = names.map(n => n.split('').filter((_,i)=>i%2==0).join(''));
  return names.join('_X_');
}

function getMultiConfig(options: AlignmentOptions, tupleIndex: number): string[][] {
  const name = options.collectionName;
  const tupleSize = options.tupleSize || 2;
  const count = options.maxVersions;
  const file = options.patternsFolder+'multi-config.json';
  const config: {} = loadJsonFile(file) || {};
  if (!config[name]) config[name] = {};
  if (!config[name][tupleSize]) config[name][tupleSize] = {};
  if (!config[name][tupleSize][count]) config[name][tupleSize][count] = [];
  if (!config[name][tupleSize][count][tupleIndex]) {
    config[name][tupleSize][count][tupleIndex]
      = getRandomTuples(options.audioFiles, tupleSize);
    if (config[name][tupleSize][count][tupleIndex].length > 0) //only write if successful
      saveJsonFile(file, config);
  }
  return config[name][tupleSize][count][tupleIndex];
}

function getRandomTuples<T>(array: T[], size = 2): T[][] {
  const tuples: T[][] = [];
  while (array.length >= size) {
    const tuple = _.sampleSize(array, size);
    tuples.push(tuple);
    array = _.difference(array, tuple);
  }
  return tuples;
}
