import * as fs from 'fs';
import * as _ from 'lodash';
import { ArrayMap } from 'siafun';
import { mapSeries } from './files/util';
import { initDirRec, getFoldersInFolder, importFeaturesFolder
  } from './files/file-manager';
import { getOptions } from './files/options';
import { FeatureConfig, FEATURES } from './files/feature-extractor';
import { FeatureLoader } from './files/feature-loader';
import { actuallyTuneFile } from './files/tuning';
import { toHistogram } from './analysis/pattern-histograms';
import { AlignmentAlgorithm, TimelineOptions, TimelineAnalysis
  } from './analysis/timeline-analysis';
import { getStandardDeviation } from './analysis/util';
import { hmmAlign } from './models/models';

interface GdVersion {
  recording: string,
  track: string
}

interface GdFolders {
  audio: string,
  features: string,
  patterns: string
}

const GD_SONG_MAP = 'data/gd_raw/app_song_map.json';
const GD_GRAPHS = initDirRec('results/gd/graphs/');
const GD_RAW: GdFolders = { audio: 'data/gd_raw/',
  features: 'data/gd_raw_features/', patterns: 'data/gd_raw_patterns/' };
const GD_TUNED: GdFolders = { audio: 'data/gd_tuned/',
  features: 'data/gd_tuned_features/', patterns: 'data/gd_tuned_patterns/' };

export class GdExperiment {
  
  private songMap: Map<string, GdVersion[]>;
  
  constructor(audioSubfolder = "") {
    this.initGdSongMap();
    GD_RAW.audio += audioSubfolder;
    GD_TUNED.audio += audioSubfolder;
  }
  
  async analyzeRaw(tlo: TimelineOptions) {
    this.generateTimelineViaGaussianHMM(GD_RAW, tlo);
  }
  
  async analyzeTuned(tlo: TimelineOptions) {
    await this.tuneSongVersions(tlo, 440, GD_RAW.audio, GD_RAW.features, GD_TUNED.audio);
    this.generateTimelineViaGaussianHMM(GD_TUNED, tlo);
  }
  
  private async generateTimelineViaGaussianHMM(folders: GdFolders, tlo: TimelineOptions) {
    tlo.audioFiles = await this.getGdVersionsQuick(folders.audio, tlo);
    console.log('saving raw sequences')
    const ta = new TimelineAnalysis(Object.assign(tlo,
      {featuresFolder: folders.features, patternsFolder: folders.patterns}));
    await ta.saveGdRawSequences();
    console.log('aligning using hmm')
    await hmmAlign(tlo.filebase, 50);
    console.log('saving timeline')
    await ta.saveTimelineFromMSAResults();
  }
  
  /** shows that standard deviation of tuning frequency never goes below 2-3,
    * which is reached after one tuning step. due to noisy audio and features.
    * 440.1869824218302 4.402311809256126 {"E minor":87,"Eb minor":1,"G major":10,"F minor":1,"A major":1}
    * 439.48486022934986 3.079363065396714 {"E minor":87,"G major":12,"F major":1}
    * 439.5063250731498 2.8715271942085785 {"E minor":87,"F minor":2,"G major":10,"A major":1}
    * 439.1745877074401 2.562394352922307 {"E minor":84,"G major":9,"F minor":6,"F major":1}
    * 439.65179229723003 2.9820525206578012 {"E minor":84,"G major":14,"A major":1,"F minor":1}
    * 439.22349029528 2.683435453520694 {"E minor":85,"G major":11,"F major":1,"F minor":2,"Eb minor":1} */
  async tuningTest(numIterations = 5, tlo: TimelineOptions) {
    await this.tuneSongVersions(tlo, 440, GD_RAW.audio, GD_RAW.features, GD_TUNED.audio);
    const folders = _.range(1, numIterations).map(i => i == 1 ? GD_TUNED : {
      audio: 'data/gd_tuned'+i+'/',
      features: 'data/gd_tuned'+i+'_features/',
      patterns: 'data/gd_tuned'+i+'_patterns/'
    });
    await mapSeries(folders, async (f,i) => {
      if (i > 0) {
        const features = await this.tuneSongVersions(tlo, 440,
          folders[i-1].audio, folders[i-1].features, f.audio);
        const keyFreq = _.mapValues(_.groupBy(features.keys), v => v.length);
        console.log(JSON.stringify(_.zip(_.range(f.audio.length),
          features.tuningFreqs, features.keys)));
        console.log(features.mostCommonKey, _.mean(features.tuningFreqs),
          getStandardDeviation(features.tuningFreqs), JSON.stringify(keyFreq));
      }
    });
    const lastVersions = await this.getGdVersionsQuick(_.last(folders).audio, tlo);
    await this.getTuningFeatures(lastVersions, _.last(folders).features);
  }
  
  private async tuneSongVersions(tlo: TimelineOptions, targetFreq: number,
      originalFolder: string, featuresFolder: string, tunedFolder: string) {
    const versions = await this.getGdVersionsQuick(originalFolder, tlo);
    const tuningFeatures = await this.getTuningFeatures(versions, featuresFolder);
    await mapSeries(versions, (v,i) => actuallyTuneFile(v,
      v.replace(originalFolder, tunedFolder), tuningFeatures.tuningFreqs[i],
      targetFreq, tuningFeatures.keys[i], tuningFeatures.mostCommonKey));
    return tuningFeatures;
  }
  
  private getGdVersionsQuick(folder: string, tlo: TimelineOptions) {
    return this.getGdVersions(tlo.collectionName, folder, tlo.maxVersions, tlo.extension);
  }
  
  private async getTuningFeatures(audioFiles: string[], featuresFolder: string) {
    const features = new FeatureLoader(featuresFolder);
    const tuningFreqs: number[] =
      await features.getFeaturesFromAudio(audioFiles, FEATURES.ESSENTIA_TUNING);
    const keys: string[] =
      await features.getFeaturesFromAudio(audioFiles, FEATURES.ESSENTIA_KEY);
    const mostCommonKey = <string>_.head(_(keys).countBy().entries().maxBy(_.last));
    return {tuningFreqs: tuningFreqs, keys: keys, mostCommonKey: mostCommonKey};
  }
  
  async saveAllSongSequences(offset = 0, skip = 0, total = 10) {
    let songs: [string, GdVersion[]][] = _.toPairs(this.songMap);
    songs = _.reverse(_.sortBy(songs, s => s[1].length));
    mapSeries(songs.slice(offset).filter((_,i) => i%(skip+1)==0).slice(0, total),
      s => new TimelineAnalysis(this.getBasicTimelineOptions(s[0]))
        .savePatternAndVectorSequences(GD_GRAPHS+s[0], true));
  }

  async saveThomasSongSequences() {
    mapSeries(this.getTunedSongs(), folder => {
      GD_RAW.audio = '/Volumes/gspeed1/florian/musical-structure/thomas/'+folder+'/';
      const songname = folder.split('_').join(' ');
      return new TimelineAnalysis(this.getBasicTimelineOptions(songname))
        .savePatternAndVectorSequences(GD_GRAPHS+songname, true);
    });
  }
  
  private getBasicTimelineOptions(songname: string) {
    return {collectionName: songname,
      audioFiles: this.getGdVersions(songname, GD_RAW.audio),
      featuresFolder: GD_RAW.features, patternsFolder: GD_RAW.patterns}
  }

  async saveThomasSongAlignments() {
    const DIR = 'results/gd/graphs-sw-full-30-5/';
    fs.existsSync(DIR) || fs.mkdirSync(DIR);
    mapSeries(this.getTunedSongs(), folder => {
      GD_RAW.audio = '/Volumes/gspeed1/florian/musical-structure/thomas/'+folder+'/';
      const songname = folder.split('_').join(' ');
      return new TimelineAnalysis(Object.assign(this.getBasicTimelineOptions(songname), 
        {filebase: DIR+songname, song: songname,
          extension: '.wav', count: 5, algorithm: AlignmentAlgorithm.SW,
          includeSelfAlignments: true})).saveMultiTimelineDecomposition();
    });
  }

  private async getSelectedTunedSongs(numSongs: number, versionsPerSong: number, offset = 0) {
    return await Promise.all(_.flatten(this.getTunedSongs().slice(offset, offset+numSongs).map(async s => {
      GD_RAW.audio = '/Volumes/gspeed1/florian/musical-structure/thomas/'+s+'/';
      return (await this.getGdVersions(s.split('_').join(' '), GD_RAW.audio, undefined, '.wav')).slice(0, versionsPerSong)
    })));
  }

  private getTunedSongs() {
    return getFoldersInFolder('/Volumes/gspeed1/florian/musical-structure/thomas/')
      .filter(f => f !== 'temp' && f !== 'studio_reference' && f !== "dancin'_in_the_street")
  }

  private async moveFeatures(tlo: TimelineOptions) {
    const versions = await this.getGdVersions(tlo.collectionName, GD_RAW.audio, null, tlo.extension);
    versions.forEach(v => importFeaturesFolder(v, '/Volumes/FastSSD/gd_tuned/features/', 'features/'));
  }

  private async saveGdHists(features: FeatureConfig[], quantFuncs: ArrayMap[], filename: string) {
    const SONGS = ["good_lovin'", "me_and_my_uncle", "box_of_rain"];
    const options = getOptions(features, quantFuncs);
    const points = await mapSeries(SONGS, async s =>
      mapSeries(this.getGdVersions(s, GD_RAW.audio),
        a => new FeatureLoader(GD_RAW.features).getQuantizedPoints(a, options)));
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
    const versions = this.getGdVersions(songname, GD_RAW.audio);
    versions.forEach(v => {
      const destination = v.replace(GD_RAW.audio, songname+'/');
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