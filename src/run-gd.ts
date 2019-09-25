import * as fs from 'fs';
import * as _ from 'lodash';
import { pointsToIndices, ArrayMap, StructureResult, getCosiatec,
  getSmithWaterman, getDualSmithWaterman } from 'siafun';
import { GD_AUDIO as GDA, GD_SONG_MAP, GD_PATTERNS, GD_GRAPHS } from './files/config';
import { mapSeries, updateStatus, audioPathToDirName } from './files/util';
import { loadJsonFile, initDirRec, getFoldersInFolder } from './files/file-manager';
import { NodeGroupingOptions } from './graphs/graph-analysis';
import { loadGraph } from './graphs/graph-theory';
import { getOptionsWithCaching, getBestGdOptions, getGdSwOptions,
  FullSIAOptions, FullSWOptions, getOptions } from './files/options';
import { FeatureConfig } from './files/feature-extractor';
import { getPointsFromAudio, getQuantizedPoints, quantize } from './files/feature-parser';
import { createSimilarityPatternGraph, getPatternGroupNFs, getNormalFormsMap,
  getConnectednessByVersion, constructTimelineFromHybrids, PatternNode } from './graphs/pattern-stats';
import { toHistogram, getMostCommonPoints } from './graphs/histograms';
import { toIndexSeqMap } from './graphs/util';

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

export function getSelectedTunedSongs(numSongs: number, versionsPerSong: number, offset = 0) {
  return _.flatten(getTunedSongs().slice(offset, offset+numSongs).map(s => {
    GD_AUDIO = '/Volumes/gspeed1/florian/musical-structure/thomas/'+s+'/';
    return getGdVersions(s.split('_').join(' '), undefined, '.wav').slice(0, versionsPerSong)
  }));
}

export function getTunedSongs() {
  return getFoldersInFolder('thomas/')
    .filter(f => f !== 'temp' && f !== 'studio_reference')
}

export async function saveHybridSWSegmentGraph(filebase: string, song = SONG, extension?: string, count = 2) {
  const options = getGdSwOptions(initDirRec(GD_PATTERNS));
  const versions = getGdVersions(song, undefined, extension);
  const tuples = <[number,number][]>_.flatten(_.range(count).map(c =>
    getHybridConfig(song, 2, c, versions).map(pair => pair.map(s => versions.indexOf(s)))));
  const hybrids = _.flatten(await getHybridSWs(song, extension, count, options));
  //createSegmentGraphFromHybrids(tuples, hybrids, [0], filebase+'-hybrid-all-graph.json');
  constructTimelineFromHybrids(tuples, hybrids);
}

export async function saveHybridSWPatternGraph(filebase: string, song = SONG, extension?: string, count = 1) {
  const MIN_OCCURRENCE = 1;
  const options = getGdSwOptions(initDirRec(GD_PATTERNS));
  const hybrids = await getHybridSWs(song, extension, count, options);
  hybrids.map((h,i) =>
    createSimilarityPatternGraph(h, false, filebase+'-hybrid'+i+'-graph.json', MIN_OCCURRENCE));
}

function getHybridSWs(song = SONG, extension: string, count: number, options: FullSWOptions) {
  const versions = getGdVersions(song, undefined, extension);
  return mapSeries(_.range(count), async i => {
    console.log('working on ' + song + ' - hybrid ' + i);
    return getHybridSW(song, i, versions, options);
  })
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
    .map(i =>loadGraph<PatternNode>(filebase+'-hybrid'+size+'-'+i+'-graph.json'));
  const grouping: NodeGroupingOptions<PatternNode> = { maxDistance: 3, condition: n => n.size > 5 };
  graphs.forEach(g => {getPatternGroupNFs(g, grouping, 5); console.log()});
}

export async function savePS(filebase: string, cosiatecFile: string, graphFile: string) {
  const file = filebase+"-seqs.json";
  const results: StructureResult[] = loadJsonFile(cosiatecFile);
  const points = results.map(r => r.points);
  
  const MIN_OCCURRENCE = 2;
  const PATTERN_TYPES = 10;

  const grouping: NodeGroupingOptions<PatternNode> = { maxDistance: 5, condition: (n,c) => n.size > 5};
  const patsec = _.flatten(await getPatternSequences([], points, results, grouping, PATTERN_TYPES, MIN_OCCURRENCE, graphFile));
  
  //TODO TAKE MOST CONNECTED ONES :)

  fs.writeFileSync(file, JSON.stringify(patsec));
}

export async function saveSWPatternAndVectorSequences(filebase: string, tryHalftime = false, song = SONG, extension?: string) {
  const file = filebase+"-seqs.json";
  const graphFile = filebase+"-graph.json";
  const versions = getGdVersions(song, undefined, extension)//.slice(0,40);
  console.log("\n"+song+" "+versions.length+"\n")

  const options = getGdSwOptions(GD_PATTERNS);
  const points = await mapSeries(versions, a => getPointsFromAudio(a, options));
  const results = await getSmithWatermanFromAudio(versions, options);

  const MIN_OCCURRENCE = 2;
  const PATTERN_TYPES = 20;

  /*if (tryHalftime) {
    const doubleOptions = getGdSwOptions(true);
    const doublePoints = await mapSeries(versions, a => getPointsFromAudio(a, doubleOptions));
    const doubleResults = await getSmithWatermanFromAudio(versions, doubleOptions);
    
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
  }*/

  /*const vecsec = _.flatten(await getVectorSequences(versions, points, options, PATTERN_TYPES));
  vecsec.forEach(s => s.version = s.version*2+1);*/

  const grouping: NodeGroupingOptions<PatternNode> = { maxDistance: 4, condition: (n,c) => n.size > 6};
  const patsec = _.flatten(await getPatternSequences(versions, points, results, grouping, PATTERN_TYPES, MIN_OCCURRENCE, graphFile));
  //patsec.forEach(s => s.version = s.version*2);

  //TODO TAKE MOST CONNECTED ONES :)

  fs.writeFileSync(file, JSON.stringify(patsec))//_.union(vecsec, patsec)));
}

export async function savePatternAndVectorSequences(filebase: string, tryHalftime = false, song = SONG, extension?: string) {
  const file = filebase+"-seqs.json";
  const graphFile = filebase+"-graph.json";
  const versions = getGdVersions(song, undefined, extension)//.slice(0,40);
  console.log("\n"+song+" "+versions.length+"\n")

  const options = getBestGdOptions(GD_PATTERNS);
  const points = await mapSeries(versions, a => getPointsFromAudio(a, options));
  const results = await getCosiatecFromAudio(versions, options);
  results.forEach(r => removeNonParallelOccurrences(r));

  const MIN_OCCURRENCE = 2;
  const PATTERN_TYPES = 20;

  if (tryHalftime) {
    const doubleOptions = getBestGdOptions(GD_PATTERNS, true);
    const doublePoints = await mapSeries(versions, a => getPointsFromAudio(a, doubleOptions));
    const doubleResults = await getCosiatecFromAudio(versions, doubleOptions);
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

  /*const vecsec = _.flatten(await getVectorSequences(versions, points, options, PATTERN_TYPES));
  vecsec.forEach(s => s.version = s.version*2+1);*/

  const grouping: NodeGroupingOptions<PatternNode> = { maxDistance: 4, condition: (n,c) => n.size > 6};
  const patsec = _.flatten(await getPatternSequences(versions, points, results, grouping, PATTERN_TYPES, MIN_OCCURRENCE, graphFile));
  //patsec.forEach(s => s.version = s.version*2);

  //TODO TAKE MOST CONNECTED ONES :)

  fs.writeFileSync(file, JSON.stringify(patsec))//_.union(vecsec, patsec)));
}

export async function savePatternSequences(file: string, hubSize: number, appendix = '') {
  const options = getBestGdOptions(GD_PATTERNS);
  const versions = getGdVersions(SONG)//.slice(0,40);
  const graphFile = GD_GRAPHS+SONG+appendix+'.json';
  const points = await mapSeries(versions, a => getPointsFromAudio(a, options));
  const results = await getCosiatecFromAudio(versions, options);
  results.forEach(r => removeNonParallelOccurrences(r));
  const sequences = await getPatternSequences(versions, points, results, {maxDistance: 3}, 10);
  fs.writeFileSync(file, JSON.stringify(_.flatten(sequences)));
  //visuals.map(v => v.join('')).slice(0, 10).forEach(v => console.log(v));
}

async function getPatternSequences(audio: string[], points: any[][],
    results: StructureResult[], groupingOptions: NodeGroupingOptions<PatternNode>,
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

function removeNonParallelOccurrences(results: StructureResult, dimIndex = 0) {
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

async function getVectorSequences(audio: string[], points: any[][], options: FullSIAOptions, typeCount = 3): Promise<VisualsPoint[][]> {
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

export async function getSmithWatermanFromAudio(audioFiles: string[], options: FullSWOptions, maxLength?: number) {
  return mapSeries(audioFiles, async (a,i) => {
    updateStatus('  ' + (i+1) + '/' + audioFiles.length);
    const points = await getPointsFromAudio(a, options);
    if (!maxLength || points.length < maxLength) {
      return getSmithWaterman(points, getOptionsWithCaching(a, options));
    }
  });
}

export async function getCosiatecFromAudio(audioFiles: string[], options: FullSIAOptions, maxLength?: number) {
  return mapSeries(audioFiles, async (a,i) => {
    updateStatus('  ' + (i+1) + '/' + audioFiles.length);
    const points = await getPointsFromAudio(a, options);
    if (!maxLength || points.length < maxLength) {
      return getCosiatec(points, getOptionsWithCaching(a, options));
    }
  });
}

async function getHybridSW(name: string, index: number, audioFiles: string[], options: FullSWOptions) {
  const tuples = getHybridConfig(name, 2, index, audioFiles);
  return mapSeries(tuples, async (tuple,i) => {
    updateStatus('  ' + (i+1) + '/' + tuples.length);
    const points = await Promise.all(tuple.map(p => getPointsFromAudio(p, options)));
    return getDualSmithWaterman(points[0], points[1],
      getOptionsWithCaching(getHybridCacheDir(...tuple), options));
  });
}

async function getHybridCosiatec(name: string, size: number, index: number, audioFiles: string[]) {
  const tuples = getHybridConfig(name, size, index, audioFiles);
  const options = getBestGdOptions(initDirRec(GD_PATTERNS));
  return mapSeries(tuples, async (tuple,i) => {
    updateStatus('  ' + (i+1) + '/' + tuples.length);
    const points = await Promise.all(tuple.map(p => getPointsFromAudio(p, options)));
    return getCosiatec(_.flatten(points),
      getOptionsWithCaching(getHybridCacheDir(...tuple), options));
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

export function getHybridCacheDir(...audio: string[]) {
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

function getGdQuantizedPoints(song: string, options: FullSIAOptions) {
  return mapSeries(getGdVersions(song), a => getQuantizedPoints(a, options));
}

function getGdPoints(song: string, options: FullSIAOptions) {
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

function getGdVersions(songname: string, count?: number, extension?: string) {
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
