import * as _ from 'lodash';
import { OpsiatecResult, getCosiatec } from 'siafun';
import { getCosiatecFromAudio, AlignmentAlgorithm, getMultiCacheDir } from '../../analysis/alignments';
import { getPatternSimilarities } from '../../analysis/pattern-analysis';
import { loadJsonFile, saveJsonFile } from '../../files/file-manager';
import { getCompressionOptions, getOptionsWithCaching, getBestOptions,
  FullSIAOptions } from '../../files/options';
import { updateStatus, mapSeries } from '../../files/util';
import { getTunedSongs, getVersions, getPoints } from './util';
import { GD_SWEEPS, GD_RAW, GD_GRAPHS, GD_RESULTS } from './config';

const SWEEP_FILE = GD_SWEEPS+'sweeps.json';

interface GdSweepResult {
  songCount: number,
  versionsPerSong: number,
  method: string,
  result: PredictionResult
}

interface PredictionResult {
  classes: number[],
  predictions: number[],
  indexOfClosest: number[],
  rateByClass: number[],
  totalRate: number
}

export async function sweep() {
  //compression limits: 2/120, 3/100, 5/50, 10/20, 19/10
  //!for simgraphs
  /*const songs = [2,3,5,10,15,19];
  const versions = [10,20,30,50,60,70,80,90,100];
  //!for both (first fast jaccard and sbn)*/
  /*const songs = [2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19];
  const versions = [10];*/
  /*const songs = [2,3,4,5,6,7,8,9,10];
  const versions = [5,10,15,20];
  /*const songs = [2,3,4,5];
  const versions = [10,20,30,50];*/
  const songs = [2,3];
  const versions = [10,20,30,50,60,70,80,90,100];
  //mapSeries(songs, s => mapSeries(versions, v => calculatePatternSimilarities(s,v)));
  mapSeries(versions, v => mapSeries(songs, s => calculateCompressionDistances(s,v)));
}

export async function saveSimilarities(graphFile: string, numVersions: number) {
  const similarities = getPatternSimilarities(_.times(numVersions, _.constant(null)), graphFile);
  const max = _.max(_.flatten(similarities));
  const distances = similarities.map(s => s.map(v => v != null ? 1-(v/max) : 0));
  const sums = distances.map(d => _.sum(d));
  const normal = sums.indexOf(_.min(sums));
  const weird = sums.indexOf(_.max(sums));
  console.log(normal, weird);
  saveJsonFile(graphFile.replace('.json', '-dists.json'), distances);
}

export async function sweep2() {
  await calculatePatternSimilarities(1, 888, 8);
}

export async function calculatePatternSimilarities(numSongs = 4, numVersions = 10, offset = 0) {
  const options = getBestOptions(GD_RAW.patterns);
  const method = 'bestgd_jaccard2_.8';//'bestgd_sbn2'
  const minOccs = 2;
  if (sweepResultExists(numSongs, numVersions,  method)) return;

  const graphFile = GD_GRAPHS+method+'_'+numSongs+'_'+numVersions+'.json';
  /*const versions = _.flatten(SONGS.slice(0, songs).map(s => {
    GD_AUDIO = '/Users/flo/Projects/Code/FAST/musical-structure/data/'+s+'/';
    const format = s === SONGS[2] ? '.m4a' : '.mp3';
    return getGdVersions(s.split('_').join(' '), undefined, format).slice(0, versionsPerSong)
  }));*/
  
  console.log('\n', method, 'songs', numSongs, 'versions', numVersions, '\n');
  const cosiatecs = await getCosiatecs(options, numSongs, numVersions, offset);
  saveJsonFile(GD_RESULTS+'cosiatecs888', cosiatecs)

  const similarities = getPatternSimilarities(cosiatecs, graphFile, minOccs);
  const result = predict(numVersions, similarities, _.max);
  saveSweepResult(numSongs, numVersions, method, result);
}

export async function calculateCompressionDistances(numSongs = 4, numVersions = 10) {
  const options = getCompressionOptions(GD_RAW.patterns);
  const method = 'ncd_cosiatec_1dcompaxis';
  if (sweepResultExists(numSongs, numVersions,  method)) return;

  const songs = getTunedSongs().slice(0, numSongs);
  const versions = _.flatten(getVersions(songs, numVersions));

  console.log('\n', method, 'songs', songs, 'versions', numVersions, '\n')

  const points = await getPoints(versions, options);
  
  console.log('\nindividual cosiatec');
  const individual = await getCosiatecs(options, numSongs, numVersions);

  console.log('\n\ncombined cosiatec');
  const pl = points.length;
  let current = 0;
  //CONCATENATED!!!
  const combined = points.map((p,i) => points.slice(i+1).map((q,j) => {
      current++;
      updateStatus('  ' + current + '/' + pl*(pl-1)/2 +  '  ');
      const cachedir = getMultiCacheDir(versions[i], versions[i+j+1]);
      return getCosiatec(p.concat(q), getOptionsWithCaching(cachedir, options));
  }));

  //distances
  let ncds = combined.map((v,i) => v.map((w,j) =>
    normCompDist(individual[i], individual[i+j+1], w)));
  //make symmetric
  ncds = versions.map((_,i) => versions.map((_,j) =>
    i < j ? ncds[i][j-i-1] : i > j ? ncds[j][i-j-1] : Infinity));

  //evaluate
  const result = predict(numVersions, ncds, _.min);
  saveSweepResult(numSongs, numVersions, method, result);
}

/** one-nearest-neighbor predictor */
function predict(numPerClass: number, distances: number[][], bestFunc: (n: number[]) => number): PredictionResult {
  const classes = distances.map((_,i) => Math.floor(i / numPerClass));
  const best = distances.map(s => bestFunc(s));
  const indexesOfBest = distances.map((s,i) =>
    s.map((v,j) => v === best[i] ? j : -1).filter(ii => ii >= 0));
  const indexOfClosest = indexesOfBest.map(ii => _.sample(ii));
  const predictions = indexOfClosest.map(p => Math.floor(p / numPerClass));
  const result = _.zipWith(classes, predictions, (c,p) => c == p ? 1 : 0);

  const totalRate = _.mean(result);
  //const rate = _.reduce(predictions, (s,p,i) => s += classes[i] == p ? 1 : 0, 0)/predictions.length;
  const rateByClass = _.range(distances.length/numPerClass).map(c =>
    _.mean(result.slice(c*numPerClass, c*numPerClass+numPerClass)));

  console.log('\n')
  console.log(''+classes)
  console.log(''+indexOfClosest)
  console.log(''+predictions)
  console.log(''+result)
  console.log(rateByClass)
  console.log(totalRate)

  return {
    classes: classes,
    predictions: predictions,
    indexOfClosest: indexOfClosest,
    rateByClass: rateByClass,
    totalRate: totalRate
  };
}

async function getCosiatecs(options: FullSIAOptions, numSongs: number,
    numVersions: number, offset = 0) {
  const songs = getTunedSongs().slice(offset, numSongs);
  const versions = _.flatten(getVersions(songs, numVersions));
  const points = await getPoints(versions, options);
  return getCosiatecFromAudio({
    algorithm: AlignmentAlgorithm.SIA,
    audioFiles: versions,
    points: points,
    patternsFolder: GD_RAW.patterns,
    collectionName: 'compdist',
    siaOptions: options
  });
}

function normCompDist(a: OpsiatecResult, b: OpsiatecResult, ab: OpsiatecResult) {
  const al = compLength(a);
  const bl = compLength(b);
  return (compLength(ab) - Math.min(al, bl)) / Math.max(al, bl);
}

function compLength(result: OpsiatecResult) {
  return _.sum(result.patterns.map(p => p.points.length + p.vectors.length));
}

function sweepResultExists(songs: number, versions: number, method: string) {
  const results: GdSweepResult[] = loadJsonFile(SWEEP_FILE) || [];
  return results.filter(r => r.method === method && r.songCount === songs && r.versionsPerSong === versions).length;
}

function saveSweepResult(songs: number, versions: number, method: string, result: PredictionResult) {
  const results: GdSweepResult[] = loadJsonFile(SWEEP_FILE) || [];
  if (results.filter(r => r.method === method && r.songCount === songs && r.versionsPerSong === versions).length === 0) {
    results.push({
      songCount: songs,
      versionsPerSong: versions,
      method: method,
      result: result
    })
    saveJsonFile(SWEEP_FILE, results);
  }
}