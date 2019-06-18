import * as fs from 'fs';
import * as _ from 'lodash';
import { pointsToIndices, ArrayMap } from 'siafun';
import { GD_AUDIO, GD_SONG_MAP, GD_RESULTS, GRAPH_RESULTS } from './config';
import { mapSeries, updateStatus, toIndexSeqMap } from './util';
import { loadJsonFile, initDirRec } from './file-manager';
import { createSimilarityPatternGraph, getHubPatternNFs, getNormalFormsMap } from './pattern-stats';
import { getInducerWithCaching, getBestGdOptions, FullOptions, getOptions, getChromaBarsOptions } from './options';
import { FeatureConfig } from './feature-extractor';
import { getPointsFromAudio, getQuantizedPoints } from './feature-parser';
import { toHistogram, getMostCommonPoints } from './histograms';

interface GdVersion {
  recording: string,
  track: string
}

var songMap: Map<string, GdVersion[]>;

const SONGS = ["good lovin'", "sugar magnolia", "me and my uncle"];


export async function savePatternSequences(file: string, hubSize: number, appendix = '') {
  const song = "good lovin'";
  const results = await getCosiatec(song, getGdVersions(song));
  const sequences = results.map((v,i) => v.points.map((p,j) =>
    ({version:i, index:j, type:0, point:p})));
  const nfMap = getNormalFormsMap(results);
  const mostCommon = getHubPatternNFs(GRAPH_RESULTS+song+appendix+'.json', hubSize);
  mostCommon.slice(0, 10).forEach((nfs,nfi) =>
    nfs.forEach(nf => nfMap[nf].forEach(([v, p]: [number, number]) => {
      const pattern = results[v].patterns[p];
      const indexOccs = pointsToIndices([pattern.occurrences], results[v].points);
      indexOccs[0].forEach(o => o.forEach(i => sequences[v][i].type = nfi+1));
    })
  ));
  fs.writeFileSync(file, JSON.stringify(_.flatten(sequences)));
  //visuals.map(v => v.join('')).slice(0, 10).forEach(v => console.log(v));
}

export async function saveVectorSequences(file: string, typeCount = 3) {
  const song = "good lovin'";
  const versions = getGdVersions(song).slice(0,40);
  const points = await mapSeries(versions, a =>
    getPointsFromAudio(a, getBestGdOptions(GD_RESULTS)));
  const quantPoints = await mapSeries(versions, a =>
    getQuantizedPoints(a, getBestGdOptions(GD_RESULTS)));
  const atemporalPoints = quantPoints.map(v => v.map(p => p.slice(1)));
  const pointMap = toIndexSeqMap(atemporalPoints, JSON.stringify);
  const mostCommon = getMostCommonPoints(_.flatten(atemporalPoints));
  const sequences = quantPoints.map((v,i) => v.map((p,j) =>
    ({version:i, index:j, type:0, point:p, path: versions[i],
      start: points[i][j][0][0],
      duration: points[i][j+1] ? points[i][j+1][0][0]-points[i][j][0][0] : 1})));
  mostCommon.slice(0, typeCount).forEach((p,i) =>
    pointMap[JSON.stringify(p)].forEach(([v, p]) => sequences[v][p].type = i+1));
  fs.writeFileSync(file, JSON.stringify(_.flatten(sequences)));
}

export async function saveGdHists(features: FeatureConfig[], quantFuncs: ArrayMap[], filename: string) {
  const options = getOptions(features, quantFuncs);
  const points = await mapSeries(SONGS, s => getGdQuantizedPoints(s, options));
  const atemporalPoints = points.map(s => s.map(p => p.slice(1)));
  const hists = atemporalPoints.map(p => p.map(toHistogram));
  fs.writeFileSync(filename, JSON.stringify(hists));
}

export async function savePatternGraphs(appendix = '', versionCount?: number) {
  await mapSeries(SONGS, async n => {
    console.log('working on ' + n);
    const results = await getCosiatec(n, getGdVersions(n, versionCount));
    createSimilarityPatternGraph(results, false, GRAPH_RESULTS+n+appendix+'.json');
  });
}

export async function saveHybridPatternGraphs(appendix = '', count = 1) {
  await mapSeries(SONGS, async n =>
    await mapSeries(_.range(count), async i => {
      console.log('working on ' + n + ' - hybrid ' + i);
      const versions = getGdVersions(n).filter(fs.existsSync);
      const results = await getHybridCosiatec(n, i, versions);
      createSimilarityPatternGraph(results, false, GRAPH_RESULTS+n+'-hybrid'+appendix+i+'.json');
    })
  );
}

async function getCosiatec(name: string, audioFiles: string[], maxLength?: number) {
  return mapSeries(audioFiles, async (a,i) => {
    updateStatus('  ' + (i+1) + '/' + audioFiles.length);
    const points = await getPointsFromAudio(a, getBestGdOptions(GD_RESULTS, true));
    if (!maxLength || points.length < maxLength) {
      const options = getBestGdOptions(GD_RESULTS+name+'/', true);
      return getInducerWithCaching(a, points, options).getCosiatec();
    }
  });
}

async function getHybridCosiatec(name: string, index: number, audioFiles: string[]) {
  const pairs = getHybridConfig(name, index, audioFiles);
  return _.flatten(await mapSeries(pairs, async (pair,i) => {
    updateStatus('  ' + (i+1) + '/' + pairs.length);
    const options = getBestGdOptions(GD_RESULTS);
    const points = await Promise.all(pair.map(p => getPointsFromAudio(p, options)));
    const slices = points.map(p => getSlices(p));
    const hybrids = _.zip(...slices).map(s => s[0].concat(s[1]));
    return hybrids.map(h => {
      const options = getBestGdOptions(initDirRec(GD_RESULTS+name, 'hybrid'+index));
      return getInducerWithCaching(pair[0], h, options).getCosiatec();
    });
  }))
}

function getHybridConfig(name: string, index: number, audioFiles: string[]): string[][] {
  const file = GD_RESULTS+'hybrid-config.json';
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
    _.mapValues(json, (v,k) => songMap.set(k, v));
  }
  return songMap;
}