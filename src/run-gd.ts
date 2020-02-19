import * as fs from 'fs';
import * as _ from 'lodash';
import { ArrayMap } from 'siafun';
//import { GD_AUDIO as GDA, GD_SONG_MAP, GD_PATTERNS, GD_GRAPHS } from './files/config';
import { mapSeries } from './files/util';
import { initDirRec, getFoldersInFolder, importFeaturesFolder } from './files/file-manager';
import { getOptions } from './files/options';
import { FeatureConfig, FEATURES } from './files/feature-extractor';
import { FeatureLoader } from './files/feature-loader';
import { actuallyTuneFile } from './files/tuning';
import { toHistogram } from './analysis/pattern-histograms';
import { AlignmentAlgorithm, TimelineOptions, TimelineAnalysis } from './analysis/timeline-analysis';

interface GdVersion {
  recording: string,
  track: string
}

const GD_SONG_MAP = 'data/gd_raw/app_song_map.json';
const GD_PATTERNS = initDirRec('results/gd/patterns/');
const GD_GRAPHS = initDirRec('results/gd/graphs/');
const GD_RAW = initDirRec('data/gd_raw/');
const GD_TUNED = initDirRec('data/gd_tuned/');
const RAW_FEATURES = initDirRec('data/gd_raw_features/');
const TUNED_FEATURES = initDirRec('data/gd_tuned_features/');

export class GdExperiment {
  
  private songMap: Map<string, GdVersion[]>;
  private audioFolder: string;
  private tunedFolder: string;
  
  constructor(audioSubfolder = "") {
    this.initGdSongMap();
    this.audioFolder = GD_RAW+audioSubfolder;
    this.tunedFolder = GD_TUNED+audioSubfolder;
  }
  
  async tuneAndCheck(tlo: TimelineOptions) {
    await this.tuneSongVersions(tlo, 440, this.audioFolder, RAW_FEATURES, this.tunedFolder);
    const tunedVersions = await this.getGdVersionsQuick(this.tunedFolder, tlo);
    const tunedFeatures = await this.getTuningFeatures(tunedVersions, TUNED_FEATURES);
  }
  
  private async tuneSongVersions(tlo: TimelineOptions, targetFreq: number,
      originalFolder: string, featuresFolder: string, tunedFolder: string) {
    const versions = await this.getGdVersionsQuick(originalFolder, tlo);
    const tuningFeatures = await this.getTuningFeatures(versions, featuresFolder);
    return mapSeries(versions, (v,i) => actuallyTuneFile(v,
      v.replace(originalFolder, tunedFolder), tuningFeatures.tuningFreqs[i],
      targetFreq, tuningFeatures.keys[i], tuningFeatures.mostCommonKey));
  }
  
  private getGdVersionsQuick(folder: string, tlo: TimelineOptions) {
    return this.getGdVersions(tlo.song, folder, tlo.maxVersions, tlo.extension);
  }
  
  private async getTuningFeatures(audioFiles: string[], featuresFolder: string) {
    const features = new FeatureLoader(featuresFolder);
    const tuningFreqs: number[] =
      await features.getFeaturesFromAudio(audioFiles, FEATURES.ESSENTIA_TUNING);
    const keys: string[] =
      await features.getFeaturesFromAudio(audioFiles, FEATURES.ESSENTIA_KEY);
    console.log(JSON.stringify(tuningFreqs))
    console.log(JSON.stringify(keys))
    const mostCommonKey = <string>_.head(_(keys).countBy().entries().maxBy(_.last));
    console.log(mostCommonKey);
    return {tuningFreqs: tuningFreqs, keys: keys, mostCommonKey: mostCommonKey};
  }
  
  async saveAllSongSequences(offset = 0, skip = 0, total = 10) {
    let songs: [string, GdVersion[]][] = _.toPairs(this.songMap);
    songs = _.reverse(_.sortBy(songs, s => s[1].length));
    mapSeries(songs.slice(offset).filter((_,i) => i%(skip+1)==0).slice(0, total),
      s => new TimelineAnalysis(s[0], this.getGdVersions(s[0], this.audioFolder), RAW_FEATURES, GD_PATTERNS)
        .savePatternAndVectorSequences(GD_GRAPHS+s[0], true));
  }

  async saveThomasSongSequences() {
    mapSeries(this.getTunedSongs(), folder => {
      this.audioFolder = '/Volumes/gspeed1/florian/musical-structure/thomas/'+folder+'/';
      const songname = folder.split('_').join(' ');
      return new TimelineAnalysis(songname, this.getGdVersions(songname, this.audioFolder), RAW_FEATURES, GD_PATTERNS)
        .savePatternAndVectorSequences(GD_GRAPHS+songname, true);
    });
  }

  async saveThomasSongAlignments() {
    const DIR = 'results/gd/graphs-sw-full-30-5/';
    fs.existsSync(DIR) || fs.mkdirSync(DIR);
    mapSeries(this.getTunedSongs(), folder => {
      this.audioFolder = '/Volumes/gspeed1/florian/musical-structure/thomas/'+folder+'/';
      const songname = folder.split('_').join(' ');
      return new TimelineAnalysis(songname, this.getGdVersions(songname, this.audioFolder), RAW_FEATURES, GD_PATTERNS)
        .saveMultiTimelineDecomposition({
          filebase: DIR+songname, song: songname,
          extension: '.wav', count: 5, algorithm: AlignmentAlgorithm.SW,
          includeSelfAlignments: true});
    });
  }

  private async getSelectedTunedSongs(numSongs: number, versionsPerSong: number, offset = 0) {
    return await Promise.all(_.flatten(this.getTunedSongs().slice(offset, offset+numSongs).map(async s => {
      this.audioFolder = '/Volumes/gspeed1/florian/musical-structure/thomas/'+s+'/';
      return (await this.getGdVersions(s.split('_').join(' '), this.audioFolder, undefined, '.wav')).slice(0, versionsPerSong)
    })));
  }

  private getTunedSongs() {
    return getFoldersInFolder('/Volumes/gspeed1/florian/musical-structure/thomas/')
      .filter(f => f !== 'temp' && f !== 'studio_reference' && f !== "dancin'_in_the_street")
  }

  private async moveFeatures(tlo: TimelineOptions) {
    const versions = await this.getGdVersions(tlo.song, this.audioFolder, null, tlo.extension);
    versions.forEach(v => importFeaturesFolder(v, '/Volumes/FastSSD/gd_tuned/features/', 'features/'));
  }

  private async saveGdHists(features: FeatureConfig[], quantFuncs: ArrayMap[], filename: string) {
    const SONGS = ["good_lovin'", "me_and_my_uncle", "box_of_rain"];
    const options = getOptions(features, quantFuncs);
    const points = await mapSeries(SONGS, async s =>
      mapSeries(this.getGdVersions(s, this.audioFolder),
        a => new FeatureLoader(RAW_FEATURES).getQuantizedPoints(a, options)));
    const atemporalPoints = points.map(s => s.map(p => p.slice(1)));
    const hists = atemporalPoints.map(p => p.map(toHistogram));
    fs.writeFileSync(filename, JSON.stringify(hists));
  }

  /*function plot(): Promise<any> {
    return new Promise(resolve => {
      execute('python '+ROOT+'../plot.py '+ROOT+DIRS.out, success => resolve());
    })
  }*/

  private async copyGdVersions(songname: string) {
    fs.existsSync(songname) || fs.mkdirSync(songname);
    const versions = this.getGdVersions(songname, this.audioFolder);
    versions.forEach(v => {
      const destination = v.replace(this.audioFolder, songname+'/');
      initDirRec(destination.split('/').slice(0, -1).join('/'));
      fs.copyFileSync(v, destination);
    });
  }

  private getGdVersions(songname: string, audioFolder: string, count?: number, extension?: string) {//, maxLength?: number, options?: FeatureOptions) {
    let versions = this.songMap.get(songname)
      .map(s => audioFolder+s.recording+'/'
        +(extension ? _.replace(s.track, '.mp3', extension) : s.track))
      .filter(fs.existsSync);
    /*if (maxLength && options) {
      const points = new FeatureParser().getPointsForAudioFiles(versions, options);
      versions = versions.filter((_,i) => points[i].length <= maxLength);
    }*/
    return versions.slice(-count);
  }

  private initGdSongMap() {
    if (!this.songMap) {
      const json = JSON.parse(fs.readFileSync(GD_SONG_MAP, 'utf8'));
      this.songMap = new Map<string, GdVersion[]>();
      _.mapValues(json, (recs, song) => this.songMap.set(song,
        _.flatten(_.map(recs, (tracks, rec) =>
          _.map(tracks, track => ({recording: rec, track: track.filename}))))));
    }
    return this.songMap;
  }

}