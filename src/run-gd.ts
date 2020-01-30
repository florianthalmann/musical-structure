import * as fs from 'fs';
import * as _ from 'lodash';
import { pointsToIndices, ArrayMap, StructureResult, MultiStructureResult, getCosiatec,
  getSmithWaterman, getDualSmithWaterman, getMultiCosiatec } from 'siafun';
import { GD_AUDIO as GDA, GD_SONG_MAP, GD_PATTERNS, GD_GRAPHS } from './files/config';
import { mapSeries, updateStatus, audioPathToDirName } from './files/util';
import { loadJsonFile, initDirRec, getFoldersInFolder, saveJsonFile,
  importFeaturesFolder } from './files/file-manager';
import { NodeGroupingOptions } from './graphs/graph-analysis';
import { loadGraph } from './graphs/graph-theory';
import { getOptionsWithCaching, getBestGdOptions, getGdSwOptions,
  FullSIAOptions, FullSWOptions, getOptions, FeatureOptions } from './files/options';
import { FeatureConfig } from './files/feature-extractor';
import { getPointsFromAudio, getQuantizedPoints, quantize } from './files/feature-parser';
import { createSimilarityPatternGraph, getPatternGroupNFs, getNormalFormsMap,
  getConnectednessByVersion, PatternNode } from './analysis/pattern-analysis';
import { inferStructureFromAlignments, inferStructureFromMSA } from './analysis/segment-analysis';
import { SegmentNode } from './analysis/types';
import { inferStructureFromTimeline } from './analysis/structure-analysis';
import { getTuningRatio } from './files/tunings';
import { toHistogram, getMostCommonPoints } from './analysis/pattern-histograms';
import { toIndexSeqMap } from './graphs/util';

interface GdVersion {
  recording: string,
  track: string
}

interface VisualsPoint {
  version: number,
  time: number,
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

export enum AlignmentAlgorithm {
  SIA,
  SW,
  BOTH
}

interface TimelineOptions {
  filebase: string,
  song: string,
  extension?: string,
  count: number,
  algorithm: AlignmentAlgorithm,
  includeSelfAlignments: boolean,
  maxVersions?: number,
  maxLength?: number
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

export async function saveThomasSongAlignments() {
  const DIR = 'results/gd/graphs-sw-full-30-5/';
  fs.existsSync(DIR) || fs.mkdirSync(DIR);
  mapSeries(getTunedSongs(), folder => {
    GD_AUDIO = '/Volumes/gspeed1/florian/musical-structure/thomas/'+folder+'/';
    const songname = folder.split('_').join(' ');
    return saveMultiTimelineDecomposition({
      filebase: DIR+songname, song: songname,
      extension: '.wav', count: 5, algorithm: AlignmentAlgorithm.SW,
      includeSelfAlignments: true});
  });
}

export async function getSelectedTunedSongs(numSongs: number, versionsPerSong: number, offset = 0) {
  return await Promise.all(_.flatten(getTunedSongs().slice(offset, offset+numSongs).map(async s => {
    GD_AUDIO = '/Volumes/gspeed1/florian/musical-structure/thomas/'+s+'/';
    return (await getGdVersions(s.split('_').join(' '), undefined, '.wav')).slice(0, versionsPerSong)
  })));
}

export function getTunedSongs() {
  return getFoldersInFolder('/Volumes/gspeed1/florian/musical-structure/thomas/')
    .filter(f => f !== 'temp' && f !== 'studio_reference' && f !== "dancin'_in_the_street")
}

export async function analyzeSavedTimeline(tlo: TimelineOptions) {
  const MAX_LENGTH = 400;
  const MAX_VERSIONS = 30;
  const segmentsByType = inferStructureFromTimeline(tlo.filebase);
  const options = getBestGdOptions(initDirRec(GD_PATTERNS));
  const versions = await getGdVersions(tlo.song, MAX_VERSIONS, tlo.extension, MAX_LENGTH, options);
  const points = await mapSeries(versions, v => getPointsFromAudio(v, options));
  const segments = points.map((v,i) => v.map((_p,j) =>
    ({start: points[i][j][0][0],
      duration: points[i][j+1] ? points[i][j+1][0][0]-points[i][j][0][0] : 1})));
  const visuals: VisualsPoint[] = _.flatten(points.map((v,i) =>
    v.map((_p,t) => {
      const type = segmentsByType.findIndex(s =>
        s.find(n => n.version === i && n.time === t) != null);
      if (type >= 0) {
        const n = segmentsByType[type].find(n => n.version === i && n.time === t);
        return ({version:i, time:t, type:type+1, point:n.point, path: versions[i],
          start: segments[i][n.time].start, duration: segments[i][n.time].duration});
      }
    }))).filter(p=>p);
  saveJsonFile(tlo.filebase+'-visuals-types.json', visuals);
}

export async function moveFeatures(tlo: TimelineOptions) {
  const options = getBestGdOptions(initDirRec(GD_PATTERNS));
  const versions = await getGdVersions(tlo.song, null, tlo.extension, null, options);
  versions.forEach(v => importFeaturesFolder(v, '/Volumes/FastSSD/gd_tuned/features/'));
}

interface Sequences {
  data: number[][],
  labels: string[]
}

export async function saveGdMultinomialSequences(tlo: TimelineOptions) {
  const swOptions = getGdSwOptions(initDirRec(GD_PATTERNS));
  const versions = await getGdVersions(tlo.song, tlo.maxVersions, tlo.extension, tlo.maxLength, swOptions);
  const points = await Promise.all(versions.map(v => getPointsFromAudio(v, swOptions)));
  const values = points.map(s => s.map(p => JSON.stringify(p[1])));
  const distinct = _.uniq(_.flatten(values));
  const data = values.map(vs => vs.map(v => distinct.indexOf(v)));
  const sequences: Sequences = {data: data, labels: distinct};
  saveJsonFile(tlo.filebase+'-points.json', sequences);
}

export async function saveGdRawSequences(tlo: TimelineOptions) {
  const swOptions = getGdSwOptions(initDirRec(GD_PATTERNS));
  const versions = await getGdVersions(tlo.song, tlo.maxVersions, tlo.extension, tlo.maxLength, swOptions);
  const points = await Promise.all(versions.map(v => getPointsFromAudio(v, swOptions)));
  const sequences = {data: points};
  saveJsonFile(tlo.filebase+'-points.json', sequences);
}

export async function saveTimelineFromMSAResults(tlo: TimelineOptions) {
  const sequences: Sequences = loadJsonFile(tlo.filebase+'-points.json');
  const labelPoints = sequences.labels.map(l => <number[]>JSON.parse(l));
  const points = sequences.data.map(s => s.map(p => labelPoints[p]))
  const msa: string[][] = loadJsonFile(tlo.filebase+'-msa.json');
  const alignments = await getAlignments(tlo);
  const timeline = inferStructureFromMSA(msa, points, alignments.versionTuples,
    alignments.alignments, tlo.filebase);
  saveTimelineVisuals(timeline, alignments.versionPoints,
    alignments.versions, tlo);
}

export async function saveMultiTimelineDecomposition(tlo: TimelineOptions) {
  //if (!fs.existsSync(tlo.filebase+'-output.json')) {
    const alignments = await getAlignments(tlo);
    const timeline = inferStructureFromAlignments(alignments.versionTuples,
      alignments.alignments, tlo.filebase);
    saveTimelineVisuals(timeline, alignments.versionPoints,
      alignments.versions, tlo);
  //}
}

async function getAlignments(tlo: TimelineOptions) {
  const swOptions = getGdSwOptions(initDirRec(GD_PATTERNS));
  const siaOptions = getBestGdOptions(initDirRec(GD_PATTERNS));
  const versions = await getGdVersions(tlo.song, tlo.maxVersions, tlo.extension, tlo.maxLength, swOptions);
  const points = await Promise.all(versions.map(v => getPointsFromAudio(v, swOptions)));
  
  let tuples = <[number,number][]>_.flatten(_.range(tlo.count)
    .map(c => getMultiConfig(tlo.song, 2, c, versions, tlo.maxLength, tlo.maxVersions)
    .map(pair => pair.map(s => versions.indexOf(s)))));
  if (tlo.algorithm === AlignmentAlgorithm.BOTH) tuples = _.concat(tuples, tuples);
  const multis: MultiStructureResult[] = [];
  if (tlo.algorithm === AlignmentAlgorithm.SIA || tlo.algorithm === AlignmentAlgorithm.BOTH) {
    multis.push(..._.flatten(await getMultiCosiatecsForSong(tlo.song, tlo.extension, tlo.count, siaOptions, tlo.maxLength, tlo.maxVersions)));
  }
  if (tlo.algorithm === AlignmentAlgorithm.SW || tlo.algorithm === AlignmentAlgorithm.BOTH) {
    multis.push(..._.flatten(await getMultiSWs(tlo.song, tlo.extension, tlo.count, swOptions, tlo.maxLength, tlo.maxVersions)));
  }
  if (tlo.includeSelfAlignments) {
    if (tlo.algorithm === AlignmentAlgorithm.SIA || tlo.algorithm === AlignmentAlgorithm.BOTH) {
      const autos = await getCosiatecFromAudio(versions, siaOptions, tlo.maxLength);
      multis.push(...autos.map(a => Object.assign(a, {points2: a.points})));
      tuples.push(...<[number,number][]>versions.map((_,i) => [i,i]));
    }
    if (tlo.algorithm === AlignmentAlgorithm.SW || tlo.algorithm === AlignmentAlgorithm.BOTH) {
      const autos = await getSmithWatermanFromAudio(versions, swOptions, tlo.maxLength);
      multis.push(...autos.map(a => Object.assign(a, {points2: a.points})));
      tuples.push(...<[number,number][]>versions.map((_,i) => [i,i]));
    }
  }
  return {versionTuples: tuples, alignments: multis, versions: versions, versionPoints: points};
}

function saveTimelineVisuals(timeline: SegmentNode[][], points: any[][][],
    versions: string[], tlo: TimelineOptions) {
  let segments = points.map((v,i) => v.map((_p,j) =>
    ({start: points[i][j][0][0],
      duration: points[i][j+1] ? points[i][j+1][0][0]-points[i][j][0][0] : 1})));
  const short = versions.map(v =>
    v.split('/').slice(-2).join('/').replace(tlo.extension || '.m4a', '.mp3'));
  const tunings = short.map(v =>
    getTuningRatio(v.split('/')[0], v.split('/')[1].replace('.mp3','')));
  const json = {title: _.startCase(tlo.song), versions: short, tunings: tunings,
    segments: segments, timeline: timeline};
  saveJsonFile(tlo.filebase+'-output.json', json);
  let visuals: VisualsPoint[] = _.flatten(versions.map((_v,i) => timeline.map(t => {
    const n = t.find(n => n.version === i);
    return n ? ({version:i, time:n.time, type:1, point:n.point, path: versions[i],
      start: segments[i][n.time].start, duration: segments[i][n.time].duration}) : undefined;
  }))).filter(p=>p);
  saveJsonFile(tlo.filebase+'-visuals.json', visuals);
  
  //infer structure
  const segmentsByType = inferStructureFromTimeline(tlo.filebase);
  segments = points.map((v,i) => v.map((_p,j) =>
    ({start: points[i][j][0][0],
      duration: points[i][j+1] ? points[i][j+1][0][0]-points[i][j][0][0] : 1})));
  visuals = _.flatten(points.map((v,i) =>
    v.map((_p,t) => {
      const type = segmentsByType.findIndex(s =>
        s.find(n => n.version === i && n.time === t) != null);
      if (type >= 0) {
        const n = segmentsByType[type].find(n => n.version === i && n.time === t);
        return ({version:i, time:t, type:type+1, point:n.point, path: versions[i],
          start: segments[i][n.time].start, duration: segments[i][n.time].duration});
      }
    }))).filter(p=>p);
  saveJsonFile(tlo.filebase+'-visuals2.json', visuals);
}

export async function saveMultiSWPatternGraph(filebase: string, song = SONG, extension?: string, count = 1) {
  const MIN_OCCURRENCE = 1;
  const options = getGdSwOptions(initDirRec(GD_PATTERNS));
  const multis = await getMultiSWs(song, extension, count, options);
  multis.map((h,i) =>
    createSimilarityPatternGraph(h, false, filebase+'-multi'+i+'-graph.json', MIN_OCCURRENCE));
}

async function getMultiSWs(song = SONG, extension: string, count: number, options: FullSWOptions, maxLength?: number, maxVersions?: number) {
  const versions = await getGdVersions(song, maxVersions, extension, maxLength, options);
  return mapSeries(_.range(count), async i => {
    console.log('working on ' + song + ' - multi ' + i);
    return getMultiSW(song, i, versions, options, maxLength, maxVersions);
  })
}

async function getMultiCosiatecsForSong(song = SONG, extension: string, count: number, options: FullSIAOptions, maxLength?: number, maxVersions?: number) {
  const versions = await getGdVersions(song, maxVersions, extension, maxLength, options);
  return mapSeries(_.range(count), async i => {
    console.log('working on ' + song + ' - multi ' + i);
    return getMultiCosiatecs(song, 2, i, versions, maxLength, maxVersions);
  })
}

export async function saveMultiPatternGraphs(filebase: string, song = SONG, extension?: string, size = 2, count = 1) {
  const MIN_OCCURRENCE = 2;
  await mapSeries(_.range(count), async i => {
    console.log('working on ' + song + ' - multi ' + i);
    const versions = await getGdVersions(song, undefined, extension);
    const results = await getMultiCosiatecs(song, size, i, versions);
    createSimilarityPatternGraph(results, false, filebase+'-multi'+size+'-'+i+'-graph.json', MIN_OCCURRENCE);
  })
}

export async function analyzeMultiPatternGraphs(filebase: string, size = 2, count = 1) {
  const graphs = _.range(count)
    .map(i =>loadGraph<PatternNode>(filebase+'-multi'+size+'-'+i+'-graph.json'));
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
  const versions = await getGdVersions(song, undefined, extension)//.slice(0,40);
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
  const versions = await getGdVersions(song, undefined, extension)//.slice(0,40);
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
  const versions = await getGdVersions(SONG)//.slice(0,40);
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
    ({version:i, time:j, type:0, point:p, path: audio[i],
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
  const versions = (await getGdVersions(SONG)).slice(0,10);
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
    ({version:i, time:j, type:0, point:p, path: audio[i],
      start: points[i][j][0][0],
      duration: points[i][j+1] ? points[i][j+1][0][0]-points[i][j][0][0] : 1})));
  mostCommon.slice(0, typeCount).forEach((p,i) =>
    pointMap[JSON.stringify(p)].forEach(([v, p]) => sequences[v][p].type = i+1));
  return sequences;
}

export async function saveGdHists(features: FeatureConfig[], quantFuncs: ArrayMap[], filename: string) {
  const options = getOptions(features, quantFuncs);
  const points = await mapSeries(SONGS, async s =>
    mapSeries(await getGdVersions(s), a => getQuantizedPoints(a, options)));
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

async function getMultiSW(name: string, index: number, audioFiles: string[], options: FullSWOptions, maxLength?: number, count?: number) {
  const tuples = getMultiConfig(name, 2, index, audioFiles, maxLength, count);
  audioFiles = _.uniq(_.flatten(tuples));
  const points = await mapSeries(audioFiles, a => getPointsFromAudio(a, options));
  return mapSeries(tuples, async (tuple,i) => {
    updateStatus('  ' + (i+1) + '/' + tuples.length);
    const currentPoints = tuple.map(a => points[audioFiles.indexOf(a)]);
    if (currentPoints[0] && currentPoints[1]) {
      return getDualSmithWaterman(currentPoints[0], currentPoints[1],
        getOptionsWithCaching(getMultiCacheDir(...tuple), options));
    }
    return getDualSmithWaterman([], [], getOptionsWithCaching(getMultiCacheDir(...tuple), options));
  });
}

async function getMultiCosiatecs(name: string, size: number, index: number, audioFiles: string[], maxLength?: number, count?: number) {
  const options = getBestGdOptions(initDirRec(GD_PATTERNS));
  let points = mapSeries(audioFiles, a => getPointsFromAudio(a, options));
  const tuples = getMultiConfig(name, size, index, audioFiles, maxLength, count);
  return mapSeries(tuples, async (tuple,i) => {
    updateStatus('  ' + (i+1) + '/' + tuples.length);
    const currentPoints = tuple.map(a => points[audioFiles.indexOf(a)]);
    return getMultiCosiatec(currentPoints,
      getOptionsWithCaching(getMultiCacheDir(...tuple), options));
  })
}

/*async function getSlicedMultiCosiatec(name: string, size: number, index: number, audioFiles: string[]) {
  const pairs = getMultiConfig(name, size, index, audioFiles);
  //TODO UPDATE PATH!!!!
  const options = getBestGdOptions(initDirRec(GD_PATTERNS+'/multi'+index));
  return _.flatten(await mapSeries(pairs, async (pair,i) => {
    updateStatus('  ' + (i+1) + '/' + pairs.length);
    const points = await Promise.all(pair.map(p => getPointsFromAudio(p, options)));
    const slices = points.map(p => getSlices(p));
    const multis = _.zip(...slices).map(s => s[0].concat(s[1]));
    return multis.map(h => {
      return getInducerWithCaching(pair[0], h, options).getCosiatec();
    });
  }))
}*/

export function getMultiCacheDir(...audio: string[]) {
  let names = audio.map(audioPathToDirName)
  //only odd chars if too long :)
  if (audio.length > 3) names = names.map(n => n.split('').filter((_,i)=>i%2==0).join(''));
  return names.join('_X_');
}

function getMultiConfig(name: string, size: number, index: number, audioFiles: string[], maxLength = 0, count = 0): string[][] {
  const file = GD_PATTERNS+'multi-config.json';
  const config: {} = loadJsonFile(file) || {};
  if (!config[name]) config[name] = {};
  if (!config[name][size]) config[name][size] = {};
  if (!config[name][size][maxLength]) config[name][size][maxLength] = {};
  if (!config[name][size][maxLength][count]) config[name][size][maxLength][count] = [];
  if (!config[name][size][maxLength][count][index]) {
    config[name][size][maxLength][count][index] = getRandomTuples(audioFiles, size);
    if (config[name][size][maxLength][count][index].length > 0) //only write if successful
      fs.writeFileSync(file, JSON.stringify(config));
  }
  return config[name][size][maxLength][count][index];
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

export async function copyGdVersions(songname: string) {
  fs.existsSync(songname) || fs.mkdirSync(songname);
  const versions = await getGdVersions(songname);
  versions.forEach(v => {
    const destination = v.replace(GD_AUDIO, songname+'/');
    initDirRec(destination.split('/').slice(0, -1).join('/'));
    fs.copyFileSync(v, destination);
  });
}

async function getGdVersions(songname: string, count?: number, extension?: string, maxLength?: number, options?: FeatureOptions) {
  let versions = getGdSongMap().get(songname)
    .map(s => GD_AUDIO+s.recording+'/'
      +(extension ? _.replace(s.track, '.mp3', extension) : s.track))
    .filter(fs.existsSync);
  if (maxLength && options) {
    const points = await mapSeries(versions, a => getPointsFromAudio(a, options));
    versions = versions.filter((_,i) => points[i].length <= maxLength);
  }
  return versions.slice(-count);
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
