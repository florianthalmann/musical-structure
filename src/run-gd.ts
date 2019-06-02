import * as fs from 'fs';
import * as _ from 'lodash';
import { GD_AUDIO, GD_SONG_MAP, GD_RESULTS, GRAPH_RESULTS } from './config';
import { mapSeries, updateStatus } from './util';
import { loadJsonFile, initDirRec } from './file-manager';
import { createSimilarityPatternGraph } from './pattern-stats';
import { getInducerWithCaching, getBestGdOptions } from './options';
import { getPointsFromAudio } from './feature-parser';

interface GdVersion {
  recording: string,
  track: string
}

var songMap: Map<string, GdVersion[]>;


export async function savePatternGraphs(versionCount?: number) {
  const songs = ["good lovin'", "sugar magnolia", "me and my uncle"];
  await mapSeries(songs, async n => {
    console.log('working on ' + n);
    const versions = getGdVersions(n).filter(fs.existsSync).slice(0, versionCount);
    const results = await getCosiatec(n, versions);
    createSimilarityPatternGraph(results, false, GRAPH_RESULTS+n+'.json');
  });
}

export async function saveHybridPatternGraphs(count = 1) {
  const songs = ["good lovin'", "sugar magnolia", "me and my uncle"];
  await mapSeries(songs, async n =>
    await mapSeries(_.range(count), async i => {
      console.log('working on ' + n + ' - hybrid ' + i);
      const versions = getGdVersions(n).filter(fs.existsSync);
      const results = await getHybridCosiatec(n, i, versions);
      createSimilarityPatternGraph(results, false, GRAPH_RESULTS+n+'-hybrid'+i+'.json');
    })
  );
}

async function getCosiatec(name: string, audioFiles: string[], maxLength?: number) {
  return mapSeries(audioFiles, async (a,i) => {
    updateStatus('  ' + (i+1) + '/' + audioFiles.length);
    const points = await getPointsFromAudio(a, getBestGdOptions(GD_RESULTS));
    if (!maxLength || points.length < maxLength) {
      const options = getBestGdOptions(GD_RESULTS+name+'/');
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

export function getGdVersions(songname: string) {
  return getGdSongMap().get(songname)
    .map(s => GD_AUDIO+s.recording+'/'+s.track)
    .filter(v => fs.existsSync(v));;
}

function getGdSongMap() {
  if (!songMap) {
    const json = JSON.parse(fs.readFileSync(GD_SONG_MAP, 'utf8'));
    songMap = new Map<string, GdVersion[]>();
    _.mapValues(json, (v,k) => songMap.set(k, v));
  }
  return songMap;
}