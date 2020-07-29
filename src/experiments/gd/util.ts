import * as fs from 'fs';
import * as _ from 'lodash';
import { QUANT_FUNCS as QF } from 'siafun';
import { FEATURES } from '../../files/feature-extractor';
import { mapSeries } from '../../files/util';
import { getFoldersInFolder, recGetFilesInFolder, initDirRec,
  loadJsonFile } from '../../files/file-manager';
import { FeatureLoader } from '../../files/feature-loader';
import { FeatureOptions } from '../../files/options';
import { getThomasTuningRatio } from '../../files/tuning';
import { GD_SONG_MAP, GD_RAW, MSA_BASE, GdOptions, GdFolders } from './config';

interface GdVersion {
  recording: string,
  track: string
}

export function getSongFoldersAndOptions(options: GdOptions, songname: string) {
  const folders = _.clone(GD_RAW);
  folders.audio += songname + "/";
  console.log(folders.audio)
  options = _.clone(options);
  options.filebase += songname + options.appendix;
  options.collectionName = songname.split('_').join(' ');
  return <[GdFolders,GdOptions]>[folders, options];
}

export function getMSAFolder(options: GdOptions) {
  return initDirRec(MSA_BASE+options.filebase.split('/').slice(-1)[0]+'/');
}

export function saveDataset(path: string) {
  const songs = getTunedSongs();
  const versions = getVersions(songs).map(vs => vs.map(v =>
    v.split('/').slice(-2).join('/').replace('.wav', '.mp3')));
  const tunings = versions.map(vs => vs.map(v =>
    getThomasTuningRatio(v.split('/')[0], v.split('/')[1].replace('.mp3',''))));
  const versionsWithTuning = versions.map((v,i) => _.zipObject(v, tunings[i]));
  fs.writeFileSync(path, JSON.stringify(_.zipObject(songs, versionsWithTuning)));
}

export function getTunedSongs(excludeWronglyAnnotated = true) {
  try {
    let songs = getFoldersInFolder(GD_RAW.audio)
      .filter(f => f !== 'temp' && f !== 'studio_reference');
    //exclude nontuned
    songs = songs.filter(f => f !== "good_lovin'" && f !== "me_and_my_uncle");
    //exclude severely misannotated
    if (excludeWronglyAnnotated) songs = songs.filter(f =>
      !_.includes(['brokedown_palace', 'friend_of_the_devil',
      'mountains_of_the_moon', 'west_l.a._fadeaway'], f));
    return songs;
  } catch (e) {
    console.log('failed to load tuned songs');
    return [];
  }
}

export function getBeatwiseChords(songs: string[], numVersions = Infinity) {
  return getFeatureSequences(songs, numVersions, {
    selectedFeatures: [FEATURES.MADMOM_BEATS, FEATURES.GO_CHORDS],
    quantizerFunctions: [QF.ORDER(), QF.IDENTITY()]
  });
}

export function getFeatureSequences(songs: string[], numVersions: number,
    options: FeatureOptions): Promise<number[][][][][]> {
  const audio = songs.map(s => getTunedAudioFiles(s, numVersions));
  return mapSeries(audio, a => getPoints(a, options));
}

export function getVersions(songs: string[], count = Infinity) {
  return songs.map(s => getTunedAudioFiles(s, count));
}

export function getTunedAudioFiles(song: string, count = Infinity) {
  return recGetFilesInFolder(GD_RAW.audio+song+'/', ['wav']).slice(0, count);
}

export function getOriginalAudioFiles(song: string, count = Infinity) {
  return recGetFilesInFolder(GD_RAW.audio+song+'/', ['mp3']).slice(0, count);
}

export function getPoints(audioFiles: string[], options: FeatureOptions) {
  return new FeatureLoader(GD_RAW.features)
    .getPointsForAudioFiles(audioFiles, options);
}

export function toFrequencyHistogram<T>(vals: T[], allVals: T[]) {
  const hist = toHistogram(vals, allVals);
  const total = _.sum(hist);
  return hist.map(b => b/total);
}

export function toHistogram<T>(vals: T[], allVals: T[]) {
  const grouped = _.groupBy(vals, v => JSON.stringify(v));
  return allVals.map(v => JSON.stringify(v))
    .map(v => grouped[v] ? grouped[v].length : 0);
}

export function getSongMap() {
  try {
    const json = loadJsonFile(GD_SONG_MAP);
    if (!json) throw new Error();
    const songMap = new Map<string, GdVersion[]>();
    _.mapValues(json, (recs, song) => songMap.set(song,
      _.flatten(_.map(recs, (tracks, rec) =>
        _.map(tracks, track => ({recording: rec, track: track.filename}))))));
    return songMap;
  } catch (e) { console.log('failed to load song map'); }
}