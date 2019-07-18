import * as fs from 'fs';
import * as _ from 'lodash';
import { pointsToIndices, ArrayMap, OpsiatecResult } from 'siafun';
import { GD_AUDIO as GDA, GD_SONG_MAP, GD_PATTERNS, GD_GRAPHS, GD_RESULTS } from './config';
import { mapSeries, updateStatus, toIndexSeqMap, audioPathToDirName } from './util';
import { loadJsonFile, saveJsonFile, initDirRec, getFoldersInFolder } from './file-manager';
import { createSimilarityPatternGraph, getPatternGroupNFs, getNormalFormsMap,
  PatternGroupingOptions, getConnectednessByVersion, getPatternSimilarities } from './pattern-stats';
import { loadGraph } from './graph-theory';
import { getInducerWithCaching, getBestGdOptions, getGdCompressionOptions,
  FullOptions, getOptions } from './options';
import { FeatureConfig } from './feature-extractor';
import { getPointsFromAudio, getQuantizedPoints, quantize } from './feature-parser';
import { toHistogram, getMostCommonPoints } from './histograms';

interface GdVersion {
  recording: string,
  track: string
}

interface VisualsPoint {
  version: number,
  index: number,
  type: number,
  point: number[],
  path: string,
  start: number,
  duration: number
}

let GD_AUDIO = GDA;
fs.existsSync(GD_GRAPHS) || fs.mkdirSync(GD_GRAPHS);

var songMap: Map<string, GdVersion[]>;

const SONGS = ["good_lovin'", "me_and_my_uncle", "box_of_rain"];
const SONG = SONGS[2];

const SWEEP_FILE = GD_RESULTS+'sweeps.json';

interface GdSweepResult {
  songCount: number,
  versionsPerSong: number,
  method: string,
  result: PredictionResult
}

export async function sweep() {
  const songs = [2,3];
  const versions = [5,10];
  mapSeries(songs, s => mapSeries(versions, v => calculatePatternSimilarities(s,v)));
  //songs.forEach(s => versions.forEach(v => calculateCompressionDistances(s,v)));
}

export async function calculatePatternSimilarities(songs = 4, versionsPerSong = 10) {
  const options = getBestGdOptions(GD_PATTERNS);
  const method = 'bestgd_jaccard_.6';
  
  const graphFile = GD_GRAPHS+method+'_'+songs+'_'+versionsPerSong+'.json';
  const versions = _.flatten(SONGS.slice(0, songs).map(s => {
    GD_AUDIO = '/Users/flo/Projects/Code/FAST/musical-structure/data/'+s+'/';
    const format = s === SONGS[2] ? '.m4a' : '.mp3';
    return getGdVersions(s.split('_').join(' '), undefined, format).slice(0, versionsPerSong)
  }));
  /*const versions = _.flatten(getTunedSongs().slice(0, songs).map(s => {
    GD_AUDIO = '/Volumes/gspeed1/florian/musical-structure/thomas/'+s+'/';
    return getGdVersions(s.split('_').join(' '), undefined, '.wav').slice(0, versionsPerSong)
  }));*/

  console.log('\nsongs', songs, 'versions', versionsPerSong, '\n')

  const cosiatecs = await getCosiatec(versions, options);
  const similarities = getPatternSimilarities(cosiatecs, graphFile);
  const result = predict(versionsPerSong, similarities, _.max);
  saveSweepResult(songs, versionsPerSong, method, result);
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

export async function calculateCompressionDistances(versionsPerSong = 10, songs = 4) {
  const options = getGdCompressionOptions(GD_PATTERNS);
  const method = 'ncd_cosiatec_1dcomp';
  
  const versions = _.flatten(getTunedSongs().slice(0, songs).map(s => {
    GD_AUDIO = '/Volumes/gspeed1/florian/musical-structure/thomas/'+s+'/';
    return getGdVersions(s.split('_').join(' '), undefined, '.wav').slice(0, versionsPerSong)
  }));

  console.log('\nsongs', songs, 'versions', versionsPerSong, '\n')

  console.log('\nindividual cosiatec');
  const individual = await getCosiatec(versions, options);

  const points = await mapSeries(versions, v => getPointsFromAudio(v, options));

  console.log('\n\ncombined cosiatec');
  const pl = points.length;
  let current = 0;
  const combined = points.map((p,i) => points.slice(i+1).map((q,j) => {
      current++;
      updateStatus('  ' + current + '/' + pl*(pl-1)/2 +  '  ');
      const cachedir = getHybridCacheDir(versions[i], versions[i+j+1]);
      return getInducerWithCaching(cachedir, p.concat(q), options).getCosiatec();
  }));

  //distances
  let ncds = combined.map((v,i) => v.map((w,j) =>
    normCompDist(individual[i], individual[i+j+1], w)));
  //make symmetric
  ncds = versions.map((_,i) => versions.map((_,j) =>
    i < j ? ncds[i][j-i-1] : i > j ? ncds[j][i-j-1] : Infinity));

  //evaluate
  const result = predict(versionsPerSong, ncds, _.min);
  saveSweepResult(songs, versionsPerSong, method, result);
}

interface PredictionResult {
  classes: number[],
  predictions: number[],
  indexOfClosest: number[],
  rateByClass: number[],
  totalRate: number
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

function normCompDist(a: OpsiatecResult, b: OpsiatecResult, ab: OpsiatecResult) {
  const al = compLength(a);
  const bl = compLength(b);
  return (compLength(ab) - Math.min(al, bl)) / Math.max(al, bl);
}

function compLength(result: OpsiatecResult) {
  return _.sum(result.patterns.map(p => p.points.length + p.vectors.length));
}

export async function saveAllSongSequences(offset = 0, skip = 0, total = 10) {
  let songs: [string, GdVersion[]][] = _.toPairs(getGdSongMap());
  songs = _.reverse(_.sortBy(songs, s => s[1].length));
  mapSeries(songs.slice(offset).filter((_,i) => i%(skip+1)==0).slice(0, total),
    s => savePatternAndVectorSequences(GD_GRAPHS+s[0], true, s[0]));
}

export async function saveThomasSongSequences() {
  mapSeries(getTunedSongs(), folder => {
    GD_AUDIO = '/Volumes/gspeed1/florian/musical-structure/thomas/'+folder+'/';
    const songname = folder.split('_').join(' ');
    return savePatternAndVectorSequences(GD_GRAPHS+songname, true, songname, '.wav');
  });
}

function getTunedSongs() {
  return getFoldersInFolder('thomas/')
    .filter(f => f !== 'temp' && f !== 'studio_reference')
}

export async function saveHybridPatternGraphs(filebase: string, song = SONG, extension?: string, size = 2, count = 1) {
  const MIN_OCCURRENCE = 2;
  await mapSeries(_.range(count), async i => {
    console.log('working on ' + song + ' - hybrid ' + i);
    const versions = getGdVersions(song, undefined, extension);
    const results = await getHybridCosiatec(song, size, i, versions);
    createSimilarityPatternGraph(results, false, filebase+'-hybrid'+size+'-'+i+'-graph.json', MIN_OCCURRENCE);
  })
}

export async function analyzeHybridPatternGraphs(filebase: string, size = 2, count = 1) {
  const graphs = _.range(count)
    .map(i =>loadGraph(filebase+'-hybrid'+size+'-'+i+'-graph.json'));
  const grouping: PatternGroupingOptions = { maxDistance: 3, condition: n => n.size > 5 };
  graphs.forEach(g => {getPatternGroupNFs(g, grouping, 5); console.log()});
}

export async function savePatternAndVectorSequences(filebase: string, tryHalftime = false, song = SONG, extension?: string) {
  const file = filebase+"-seqs.json";
  const graphFile = filebase+"-graph.json";
  const versions = getGdVersions(song, undefined, extension)//.slice(0,40);
  console.log("\n"+song+" "+versions.length+"\n")

  const options = getBestGdOptions(GD_PATTERNS);
  const points = await mapSeries(versions, a => getPointsFromAudio(a, options));
  const results = await getCosiatec(versions, options);
  results.forEach(r => removeNonParallelOccurrences(r));

  const MIN_OCCURRENCE = 2;
  const PATTERN_TYPES = 10;

  if (tryHalftime) {
    const doubleOptions = getBestGdOptions(GD_PATTERNS, true);
    const doublePoints = await mapSeries(versions, a => getPointsFromAudio(a, doubleOptions));
    const doubleResults = await getCosiatec(versions, doubleOptions);
    doubleResults.forEach(r => removeNonParallelOccurrences(r));

    const graph = createSimilarityPatternGraph(results.concat(doubleResults), false, null, MIN_OCCURRENCE);
    let conn = getConnectednessByVersion(graph);
    //console.log(conn)
    //conn = conn.map((c,v) => c / points.concat(doublePoints)[v].length);
    //console.log(conn)
    versions.forEach((_,i) => {
      if (conn[i+versions.length] > conn[i]) {
        console.log("version", i, "is better analyzed doubletime");
        points[i] = doublePoints[i];
        results[i] = doubleResults[i];
      }
    })
  }

  const vecsec = _.flatten(await getVectorSequences(versions, points, options, PATTERN_TYPES));
  vecsec.forEach(s => s.version = s.version*2+1);

  const grouping: PatternGroupingOptions = { maxDistance: 3, condition: (n,c) => n.size > 5};
  const patsec = _.flatten(await getPatternSequences(versions, points, results, grouping, PATTERN_TYPES, MIN_OCCURRENCE, graphFile));
  patsec.forEach(s => s.version = s.version*2);

  //TODO TAKE MOST CONNECTED ONES :)

  fs.writeFileSync(file, JSON.stringify(_.union(vecsec, patsec)));
}

export async function savePatternSequences(file: string, hubSize: number, appendix = '') {
  const options = getBestGdOptions(GD_PATTERNS);
  const versions = getGdVersions(SONG)//.slice(0,40);
  const graphFile = GD_GRAPHS+SONG+appendix+'.json';
  const points = await mapSeries(versions, a => getPointsFromAudio(a, options));
  const results = await getCosiatec(versions, options);
  results.forEach(r => removeNonParallelOccurrences(r));
  const sequences = await getPatternSequences(versions, points, results, {maxDistance: 3}, 10);
  fs.writeFileSync(file, JSON.stringify(_.flatten(sequences)));
  //visuals.map(v => v.join('')).slice(0, 10).forEach(v => console.log(v));
}

async function getPatternSequences(audio: string[], points: any[][],
    results: OpsiatecResult[], groupingOptions: PatternGroupingOptions,
    typeCount = 10, minCount = 2, path?: string): Promise<VisualsPoint[][]> {
  const sequences = results.map((v,i) => v.points.map((p,j) =>
    ({version:i, index:j, type:0, point:p, path: audio[i],
      start: points[i][j][0][0],
      duration: points[i][j+1] ? points[i][j+1][0][0]-points[i][j][0][0] : 1})));
  const nfMap = getNormalFormsMap(results);
  const graph = createSimilarityPatternGraph(results, false, path, minCount);

  const mostCommon = getPatternGroupNFs(graph, groupingOptions, typeCount);
  //mostCommon.slice(0, typeCount).forEach(p => console.log(p[0]+ " " + p.length));
  mostCommon.forEach((nfs,nfi) =>
    nfs.forEach(nf => nfMap[nf].forEach(([v, p]: [number, number]) => {
      const pattern = results[v].patterns[p];
      let indexOccs = pointsToIndices([pattern.occurrences], results[v].points)[0];
      //fill in gaps
      indexOccs = indexOccs.map(o => _.range(o[0], _.last(o)+1));
      indexOccs.forEach(o => o.forEach(i => i >= 0 ? sequences[v][i].type = nfi+1 : null));
    })
  ));
  return sequences;
}

function removeNonParallelOccurrences(results: OpsiatecResult, dimIndex = 0) {
  results.patterns.forEach(p => {
    const parallel = p.vectors.map(v => v.every((d,i) => i == dimIndex || d == 0));
    p.vectors = p.vectors.filter((_,i) => parallel[i]);
    p.occurrences = p.occurrences.filter((_,i) => parallel[i]);
  })
}

export async function saveVectorSequences(file: string, typeCount?: number) {
  const options = getBestGdOptions(GD_PATTERNS);
  const versions = getGdVersions(SONG).slice(0,10);
  const points = await mapSeries(versions, a => getPointsFromAudio(a, options));
  const sequences = await getVectorSequences(versions, points, options, typeCount);
  fs.writeFileSync(file, JSON.stringify(_.flatten(sequences)));
}

async function getVectorSequences(audio: string[], points: any[][], options: FullOptions, typeCount = 3): Promise<VisualsPoint[][]> {
  const quantPoints = points.map(p => quantize(p, options));
  const atemporalPoints = quantPoints.map(v => v.map(p => p.slice(1)));
  const pointMap = toIndexSeqMap(atemporalPoints, JSON.stringify);
  const mostCommon = getMostCommonPoints(_.flatten(atemporalPoints));
  const sequences = quantPoints.map((v,i) => v.map((p,j) =>
    ({version:i, index:j, type:0, point:p, path: audio[i],
      start: points[i][j][0][0],
      duration: points[i][j+1] ? points[i][j+1][0][0]-points[i][j][0][0] : 1})));
  mostCommon.slice(0, typeCount).forEach((p,i) =>
    pointMap[JSON.stringify(p)].forEach(([v, p]) => sequences[v][p].type = i+1));
  return sequences;
}

export async function saveGdHists(features: FeatureConfig[], quantFuncs: ArrayMap[], filename: string) {
  const options = getOptions(features, quantFuncs);
  const points = await mapSeries(SONGS, s => getGdQuantizedPoints(s, options));
  const atemporalPoints = points.map(s => s.map(p => p.slice(1)));
  const hists = atemporalPoints.map(p => p.map(toHistogram));
  fs.writeFileSync(filename, JSON.stringify(hists));
}

async function getCosiatec(audioFiles: string[], options: FullOptions, maxLength?: number) {
  return mapSeries(audioFiles, async (a,i) => {
    updateStatus('  ' + (i+1) + '/' + audioFiles.length);
    const points = await getPointsFromAudio(a, options);
    if (!maxLength || points.length < maxLength) {
      return getInducerWithCaching(a, points, options).getCosiatec();
    }
  });
}

async function getHybridCosiatec(name: string, size: number, index: number, audioFiles: string[]) {
  const tuples = getHybridConfig(name, size, index, audioFiles);
  const options = getBestGdOptions(initDirRec(GD_PATTERNS));
  return mapSeries(tuples, async (tuple,i) => {
    updateStatus('  ' + (i+1) + '/' + tuples.length);
    const points = await Promise.all(tuple.map(p => getPointsFromAudio(p, options)));
    return getInducerWithCaching(getHybridCacheDir(...tuple),
      _.flatten(points), options).getCosiatec()
  })
}

/*async function getSlicedHybridCosiatec(name: string, size: number, index: number, audioFiles: string[]) {
  const pairs = getHybridConfig(name, size, index, audioFiles);
  //TODO UPDATE PATH!!!!
  const options = getBestGdOptions(initDirRec(GD_PATTERNS+'/hybrid'+index));
  return _.flatten(await mapSeries(pairs, async (pair,i) => {
    updateStatus('  ' + (i+1) + '/' + pairs.length);
    const points = await Promise.all(pair.map(p => getPointsFromAudio(p, options)));
    const slices = points.map(p => getSlices(p));
    const hybrids = _.zip(...slices).map(s => s[0].concat(s[1]));
    return hybrids.map(h => {
      return getInducerWithCaching(pair[0], h, options).getCosiatec();
    });
  }))
}*/

function getHybridCacheDir(...audio: string[]) {
  let names = audio.map(audioPathToDirName)
  //only odd chars if too long :)
  if (audio.length > 3) names = names.map(n => n.split('').filter((_,i)=>i%2==0).join(''));
  return names.join('_X_');
}

function getHybridConfig(name: string, size: number, index: number, audioFiles: string[]): string[][] {
  const file = GD_PATTERNS+'hybrid-config.json';
  const config: {} = loadJsonFile(file) || {};
  if (!config[name]) config[name] = {};
  if (!config[name][size]) config[name][size] = [];
  if (!config[name][size][index]) {
    config[name][size][index] = getRandomTuples(audioFiles, size);
    fs.writeFileSync(file, JSON.stringify(config));
  }
  return config[name][size][index];
}

function getSlices<T>(array: T[]) {
  const start = array.slice(0, array.length/2);
  const middle = array.slice(array.length/4, 3*array.length/4);
  const end = array.slice(array.length/2);
  return [start, middle, end];
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

/*function plot(): Promise<any> {
  return new Promise(resolve => {
    execute('python '+ROOT+'../plot.py '+ROOT+DIRS.out, success => resolve());
  })
}*/

function getGdQuantizedPoints(song: string, options: FullOptions) {
  return mapSeries(getGdVersions(song), a => getQuantizedPoints(a, options));
}

function getGdPoints(song: string, options: FullOptions) {
  return mapSeries(getGdVersions(song), a => getPointsFromAudio(a, options));
}

export function copyGdVersions(songname: string) {
  fs.existsSync(songname) || fs.mkdirSync(songname);
  const versions = getGdVersions(songname);
  versions.forEach(v => {
    const destination = v.replace(GD_AUDIO, songname+'/');
    initDirRec(destination.split('/').slice(0, -1).join('/'));
    fs.copyFileSync(v, destination);
  });
}

export function getGdVersions(songname: string, count?: number, extension?: string) {
  return getGdSongMap().get(songname)
    .map(s => GD_AUDIO+s.recording+'/'
      +(extension ? _.replace(s.track, '.mp3', extension) : s.track))
    .filter(fs.existsSync)
    .slice(0, count);
}

function getGdSongMap() {
  if (!songMap) {
    const json = JSON.parse(fs.readFileSync(GD_SONG_MAP, 'utf8'));
    songMap = new Map<string, GdVersion[]>();
    _.mapValues(json, (recs, song) => songMap.set(song,
      _.flatten(_.map(recs, (tracks, rec) =>
        _.map(tracks, track => ({recording: rec, track: track.filename}))))));
  }
  return songMap;
}
