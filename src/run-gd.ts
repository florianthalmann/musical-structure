import * as fs from 'fs';
import * as _ from 'lodash';
import { pointsToIndices, ArrayMap, OpsiatecResult } from 'siafun';
import { GD_AUDIO, GD_SONG_MAP, GD_PATTERNS, GD_GRAPHS } from './config';
import { mapSeries, updateStatus, toIndexSeqMap } from './util';
import { loadJsonFile, initDirRec } from './file-manager';
import { createSimilarityPatternGraph, getPatternGroupNFs, getNormalFormsMap,
  PatternGroupingOptions, getConnectednessByVersion } from './pattern-stats';
import { getInducerWithCaching, getBestGdOptions, FullOptions, getOptions } from './options';
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

fs.existsSync(GD_GRAPHS) || fs.mkdirSync(GD_GRAPHS);

var songMap: Map<string, GdVersion[]>;

const SONGS = ["good lovin'", "sugar magnolia", "me and my uncle"];
const SONG = SONGS[2];

export async function saveAllSongSequences(offset = 0, skip = 0, total = 10) {
  let songs: [string, GdVersion[]][] = _.toPairs(getGdSongMap());
  songs = _.reverse(_.sortBy(songs, s => s[1].length));
  mapSeries(songs.slice(offset).filter((_,i) => i%(skip+1)==0).slice(0, total),
    s => savePatternAndVectorSequences(GD_GRAPHS+s[0], true, s[0]));
}

export async function savePatternAndVectorSequences(filebase: string, tryHalftime = false, song = SONG) {
  const file = filebase+"-seqs.json";
  const graphFile = filebase+"-graph.json";
  console.log(file)
  const versions = getGdVersions(song).slice(0,40);
  
  const options = getBestGdOptions(GD_PATTERNS+song+'/');
  const points = await mapSeries(versions, a => getPointsFromAudio(a, options));
  const results = await getCosiatec(song, versions, options);
  results.forEach(r => removeNonParallelOccurrences(r));
  
  if (tryHalftime) {
    const doubleOptions = getBestGdOptions(GD_PATTERNS+song+'/', true);
    const doublePoints = await mapSeries(versions, a => getPointsFromAudio(a, doubleOptions));
    const doubleResults = await getCosiatec(song, versions, doubleOptions);
    doubleResults.forEach(r => removeNonParallelOccurrences(r));
    
    const graph = createSimilarityPatternGraph(results.concat(doubleResults), false, null, 2);
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
  
  const vecsec = _.flatten(await getVectorSequences(versions, points, options, 5));
  vecsec.forEach(s => s.version = s.version*2+1);
  
  const grouping = { maxDistance: 10 }//, condition: (n,c) => n.size > 4};
  const patsec = _.flatten(await getPatternSequences(versions, points, results, grouping, 5, 2, graphFile));
  patsec.forEach(s => s.version = s.version*2);
  
  //TODO TAKE MOST CONNECTED ONES :)
  
  fs.writeFileSync(file, JSON.stringify(_.union(vecsec, patsec)));
}

export async function savePatternSequences(file: string, hubSize: number, appendix = '') {
  const options = getBestGdOptions(GD_PATTERNS+SONG+'/');
  const versions = getGdVersions(SONG)//.slice(0,40);
  const graphFile = GD_GRAPHS+SONG+appendix+'.json';
  const points = await mapSeries(versions, a => getPointsFromAudio(a, options));
  const results = await getCosiatec(SONG, versions, options);
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
  
  const mostCommon = getPatternGroupNFs(graph, groupingOptions);
  mostCommon.slice(0, typeCount).forEach(p => console.log(p[0]+ " " + p.length));
  mostCommon.slice(0, typeCount).forEach((nfs,nfi) =>
    nfs.forEach(nf => nfMap[nf].forEach(([v, p]: [number, number]) => {
      const pattern = results[v].patterns[p];
      const indexOccs = pointsToIndices([pattern.occurrences], results[v].points)[0];
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
  const options = getBestGdOptions(GD_PATTERNS+SONG+'/');
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

export async function saveHybridPatternGraphs(appendix = '', count = 1) {
  await mapSeries(SONGS, async n =>
    await mapSeries(_.range(count), async i => {
      console.log('working on ' + n + ' - hybrid ' + i);
      const versions = getGdVersions(n).filter(fs.existsSync);
      const results = await getHybridCosiatec(n, i, versions);
      createSimilarityPatternGraph(results, false, GD_GRAPHS+n+'-hybrid'+appendix+i+'.json');
    })
  );
}

async function getCosiatec(name: string, audioFiles: string[],
    options = getBestGdOptions(GD_PATTERNS+name+'/'), maxLength?: number) {
  return mapSeries(audioFiles, async (a,i) => {
    updateStatus('  ' + (i+1) + '/' + audioFiles.length);
    const points = await getPointsFromAudio(a, options);
    if (!maxLength || points.length < maxLength) {
      return getInducerWithCaching(a, points, options).getCosiatec();
    }
  });
}

async function getHybridCosiatec(name: string, index: number, audioFiles: string[]) {
  const pairs = getHybridConfig(name, index, audioFiles);
  const options = getBestGdOptions(initDirRec(GD_PATTERNS+name+'/hybrid'+index));
  return _.flatten(await mapSeries(pairs, async (pair,i) => {
    updateStatus('  ' + (i+1) + '/' + pairs.length);
    const points = await Promise.all(pair.map(p => getPointsFromAudio(p, options)));
    const slices = points.map(p => getSlices(p));
    const hybrids = _.zip(...slices).map(s => s[0].concat(s[1]));
    return hybrids.map(h => {
      return getInducerWithCaching(pair[0], h, options).getCosiatec();
    });
  }))
}

function getHybridConfig(name: string, index: number, audioFiles: string[]): string[][] {
  const file = GD_PATTERNS+'hybrid-config.json';
  const config: {} = loadJsonFile(file) || {};
  if (!config[name]) config[name] = [];
  if (!config[name][index]) {
    config[name][index] = getRandomPairs(audioFiles);
    fs.writeFileSync(file, JSON.stringify(config));
  }
  return config[name][index];
}

function getSlices<T>(array: T[]) {
  const start = array.slice(0, array.length/2);
  const middle = array.slice(array.length/4, 3*array.length/4);
  const end = array.slice(array.length/2);
  return [start, middle, end];
}

function getRandomPairs<T>(array: T[]): T[][] {
  const pairs: T[][] = [];
  while (array.length > 1) {
    const pair = _.sampleSize(array, 2);
    pairs.push(pair);
    array = _.difference(array, pair);
  }
  return pairs;
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

export function getGdVersions(songname: string, count?: number) {
  return getGdSongMap().get(songname)
    .map(s => GD_AUDIO+s.recording+'/'+s.track)
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