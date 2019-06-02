import * as fs from 'fs';
import * as _ from 'lodash';
import { OPTIMIZATION, StructureInducer } from 'siafun';
import { GD_AUDIO, GD_SONG_MAP, GD_RESULTS } from './config';
import { mapSeries, updateStatus } from './util';
import { createSimilarityPatternGraph } from './pattern-stats';
import { FullOptions, getInducerWithCaching, getMfccBeatsOptions, getBestGdOptions } from './options';
import { getPointsFromAudio } from './feature-parser';

interface GdVersion {
  recording: string,
  track: string
}

var songMap: Map<string, GdVersion[]>;

export async function saveHybridPatternGraphs() {
  const songs = ["good lovin'", "sugar magnolia", "me and my uncle"];
  await mapSeries(songs, async n => {
    const vs = getGdVersions(n).filter(fs.existsSync);
    const pairs = getRandomPairs(vs);
    let results = _.flatten(await mapSeries(pairs, async (pair,i) => {
      updateStatus('  working on ' + n + ' - ' + (i+1) + '/' + pairs.length);
      
      const options = getBestGdOptions(GD_RESULTS);
      const points = await Promise.all(pair.map(p => getPointsFromAudio(p, options)));
      const slices = points.map(p => getSlices(p));
      const hybrids = _.zip(...slices).map(s => s[0].concat(s[1]));
      return hybrids.map(h => {
        const options = getBestGdOptions(GD_RESULTS);
        options.cacheDir = undefined;
        options.siatecCacheDir = undefined;
        return new StructureInducer(h, options).getCosiatec();
      })
    })).filter(r => r); //filter out empty results for ignored versions
    //createSimilaritySegmentGraph(n+'-segs.json', results);
    createSimilarityPatternGraph(results, false, n+'-hybrid.json');
    //createSimilarityPatternGraph(results, true, n+'-vecs.json');
  });
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


async function gdJob() {
  const options = getMfccBeatsOptions(3, GD_RESULTS);
  options.minPatternLength = 3;
  options.optimizationMethods = [OPTIMIZATION.PARTITION];
  //options.numPatterns = 100;
  
  const startTime = Date.now()
  await saveGdPatternGraphs(["good lovin'"], Object.assign({}, options), null, null, "mf3be");//, 50)//, 800);
  console.log("DURATION", (Date.now()-startTime)/1000, "secs")
  //analyzePatternGraph("good lovin'.json");
  //analyzePatternGraph("results/gd/goodlovin-chroma4bars-vecs.json");
}


async function saveGdPatternGraphs(songnames: string[], options: FullOptions,
    versionCount?: number, maxLength?: number, filenameAddon = "") {
  await mapSeries(songnames, async n => {
    let vs = getGdVersions(n);
    vs = versionCount ? vs.slice(0, versionCount) : vs;
    let results = await mapSeries(vs, (v,i) => {
      updateStatus('  working on ' + n + ' - ' + (i+1) + '/' + vs.length);
      return induceStructure(v, options, maxLength);
    });
    results = results.filter(r => r); //filter out empty results for ignored versions
    //createSimilaritySegmentGraph(n+'-segs.json', results);
    createSimilarityPatternGraph(results, false, n+filenameAddon+'.json');
    //createSimilarityPatternGraph(results, true, n+'-vecs.json');
  });
}

/*function plot(): Promise<any> {
  return new Promise(resolve => {
    execute('python '+ROOT+'../plot.py '+ROOT+DIRS.out, success => resolve());
  })
}*/

async function induceStructure(audioFile: string, options: FullOptions, maxLength?: number) {
  if (fs.existsSync(audioFile)) {
    const points = await getPointsFromAudio(audioFile, options);
    if (!maxLength || points.length < maxLength) {
      return getInducerWithCaching(audioFile, points, options)
        .getCosiatec();
    }
  } else {
    console.log("\nNOT FOUND:", audioFile, "\n");
  }
}

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