import * as fs from 'fs';
import { execute, mapSeries, audioPathToDirName } from './util';
import { getAllFeatureFiles, initDirRec } from './file-manager';

export interface FeatureConfig {
  name: string,
  file?: string,
  isSegmentation: boolean
}

export interface VampFeatureConfig extends FeatureConfig {
  plugin: string
}

export const FEATURES = {
  SECTIONS: {name:'sections', plugin:'vamp:qm-vamp-plugins:qm-segmenter:segmentation', isSegmentation: true},
  BARS: {name:'bars', file:'beats', plugin:'vamp:qm-vamp-plugins:qm-barbeattracker:beats', isSegmentation: true},
  BEATS: {name:'beats', plugin:'vamp:qm-vamp-plugins:qm-barbeattracker:beats', isSegmentation: true},
  ONSETS: {name:'onsets', plugin:'vamp:qm-vamp-plugins:qm-onsetdetector:onsets', isSegmentation: true},
  ONSETS2: {name:'onsets2', plugin:'vamp:vamp-aubio:aubioonset:onsets', isSegmentation: true},
  CENTROID: {name:'logcentroid', plugin:'vamp:vamp-example-plugins:spectralcentroid:logcentroid', isSegmentation: false},
  MELODY: {name:'melody', plugin:'vamp:mtg-melodia:melodia:melody', isSegmentation: false},
  PITCH: {name:'pitch', plugin:'vamp:vamp-aubio:aubiopitch:frequency', isSegmentation: false},
  AMPLITUDE: {name:'amplitude', plugin:'vamp:vamp-example-plugins:amplitudefollower:amplitude', isSegmentation: false},
  ENERGY: {name:'energy', plugin:'vamp:bbc-vamp-plugins:bbc-energy:rmsenergy', isSegmentation: false},
  INTENSITY: {name:'intensity', plugin:'vamp:bbc-vamp-plugins:bbc-intensity:intensity', isSegmentation: false},
  FLUX: {name:'flux', plugin:'vamp:bbc-vamp-plugins:bbc-spectral-flux:spectral-flux', isSegmentation: false},
  SKEWNESS: {name:'skewness', plugin:'vamp:bbc-vamp-plugins:bbc-speechmusic-segmenter:skewness', isSegmentation: false},
  ZERO: {name:'zero', plugin:'vamp:vamp-example-plugins:zerocrossing:counts', isSegmentation: false},
  TONAL: {name:'tonal', plugin:'vamp:qm-vamp-plugins:qm-tonalchange:tcfunction', isSegmentation: false},
  ONSETFREQ: {name:'onsetfreq', plugin:'vamp:bbc-vamp-plugins:bbc-rhythm:avg-onset-freq', isSegmentation: false},
  KEYSTRENGTH: {name:'keystrength', plugin:'vamp:qm-vamp-plugins:qm-keydetector:keystrength', isSegmentation: false},
  TUNING: {name:'tuning', plugin:'vamp:nnls-chroma:tuning:tuning', isSegmentation: false},
  TEMPO: {name:'tempo', plugin:'vamp:vamp-example-plugins:fixedtempo:tempo', isSegmentation: false},
  MFCC: {name:'mfcc', plugin:'vamp:qm-vamp-plugins:qm-mfcc:coefficients', isSegmentation: false},
  CHROMA: {name:'chroma', plugin:'vamp:qm-vamp-plugins:qm-chromagram:chromagram', isSegmentation: false},
  CHORDS: {name:'chords', plugin:'vamp:nnls-chroma:chordino:simplechord', isSegmentation: false},
  JOHAN_CHORDS: {name:'johan', file: 'johan', isSegmentation: false},
  JOHAN_SEVENTHS: {name:'johan7', file: 'johan', isSegmentation: false},
  FLOHAN_BEATS: {name:'flohanbeats', file: 'johan', isSegmentation: true},
  FLOHAN_BARS: {name:'flohanbeats', file: 'johan', isSegmentation: true},
  MADMOM_BARS: {name:'madbars', file: 'madbars', isSegmentation: true},
  MADMOM_BEATS: {name:'madbeats', file: 'madbars', isSegmentation: true},
  MADHAN_BARS: {name: 'madhanbars', file: 'johan', isSegmentation: true},
  SILVET: {name:'silvet', plugin:'vamp:silvet:silvet:notes', isSegmentation: false},
  TRANSCRIPTION: {name:'qmtrans', plugin:'vamp:qm-vamp-plugins:qm-transcription:transcription', isSegmentation: false},
  ESSENTIA_BEATS: {name: 'essentiabeats', file: 'essentia', isSegmentation: true},
  ESSENTIA_TUNING: {name: 'essentiatuning', file: 'essentia', isSegmentation: false},
  ESSENTIA_KEY: {name: 'essentiakey', file: 'essentia', isSegmentation: false},
  ESSENTIA_CHORDS: {name: 'essentiachords', file: 'freesound', isSegmentation: false},
  FLOSSENTIA_BARS: {name: 'flossentiabars', file: 'essentia', isSegmentation: true}
}

export class FeatureExtractor {
  
  constructor(private targetDir: string) {
    initDirRec(targetDir);
  }
  
  async getFeatureFile(audioPath: string, feature: FeatureConfig) {
    return (await this.getFeatureFiles(audioPath, [feature]))[0];
  }
  
  async getFeatureFiles(audioPath: string, features: FeatureConfig[]): Promise<string[]> {
    await this.extractFeatures([audioPath], features);
    const files = await getAllFeatureFiles(audioPath, this.targetDir);
    return features.map(f => files.filter(u => u.indexOf(f.file||f.name) >= 0)[0]);
  }

  private extractFeatures(audioFiles: string[], features: FeatureConfig[]): Promise<any> {
    return mapSeries(audioFiles, a => mapSeries(features, f =>
      f.hasOwnProperty('plugin') ? this.extractVampFeature(a, <VampFeatureConfig>f)
        : f === FEATURES.MADMOM_BARS ? this.extractMadmomBars(a)
        : f === FEATURES.MADMOM_BEATS ? this.extractMadmomBeats(a)
        : f.file === 'johan' ? this.extractJohanChords(a, f)
        : f.file === 'essentia' ? this.extractEssentia(a)
        : f.file === 'freesound' ? this.extractEssentiaFreesound(a)
        : null
    ));
  }

  //extracts the given feature from the audio file (path) if it doesn't exist yet
  private extractVampFeature(audioPath: string, feature: VampFeatureConfig): Promise<any> {
    return this.extractAndMove(audioPath, feature,
      () => 'sonic-annotator -d ' + feature.plugin + ' ' + audioPath + ' -w jams --jams-force');
  }

  //extracts the given feature from the audio file (path) if it doesn't exist yet
  private extractJohanChords(audioPath: string, config: FeatureConfig): Promise<any> {
    return this.extractAndMove(audioPath, config,
      (featureOutFile) => {
        const audioFile = audioPath.slice(audioPath.lastIndexOf('/')+1);
        const outPath = audioPath.slice(0, audioPath.lastIndexOf('/'));
        return 'echo -n /srv/'+audioFile+' | docker run --rm -i -v "'
          +outPath+':/srv" audiocommons/faas-confident-chord-estimator python3 index.py > "'
          +featureOutFile+'"'
      });
  }

  //extracts the given feature from the audio file (path) if it doesn't exist yet
  private extractMadmomBeats(audioPath: string): Promise<any> {
    return this.extractAndMove(audioPath, FEATURES.MADMOM_BEATS,
      (featureOutFile) => {
        return 'DBNBeatTracker single -o "'+featureOutFile+'" "'+audioPath+'"'
      });
  }

  //extracts the given feature from the audio file (path) if it doesn't exist yet
  private extractMadmomBars(audioPath: string): Promise<any> {
    return this.extractAndMove(audioPath, FEATURES.MADMOM_BARS,
      (featureOutFile) => {
        return 'DBNDownbeatTracker single -o "'+featureOutFile+'" "'+audioPath+'"'
      });
  }

  //extracts the given feature from the audio file (path) if it doesn't exist yet
  private extractEssentia(audioPath: string): Promise<any> {
    return this.extractAndMove(audioPath, FEATURES.ESSENTIA_BEATS,
      (featureOutFile) => {
        return 'essentia_streaming_extractor_music "'+audioPath+'" "'+featureOutFile+'"'
      });
  }
  
  private extractEssentiaFreesound(audioPath: string): Promise<any> {
    return this.extractAndMove(audioPath, FEATURES.ESSENTIA_CHORDS,
      (featureOutFile) => {
        return 'essentia_streaming_extractor_freesound "'+audioPath+'" "'+featureOutFile+'"'
      });
  }

  private async extractAndMove(audioPath: string, feature: FeatureConfig,
      commandFunc: (featureOutFile: string) => string) {
    const outFileName = audioPathToDirName(audioPath);
    const extension = audioPath.slice(audioPath.lastIndexOf('.'));
    const featureOutFile = audioPath.replace(extension, '.json');
    const featureDestDir = this.targetDir+outFileName+'/';
    const featureDestPath = featureDestDir+outFileName+'_'+(feature.file||feature.name)+'.json';
    if (!fs.existsSync(featureDestPath)) {
      console.log('extracting '+feature.name+' for '+audioPath);
      try {
        await execute(commandFunc(featureOutFile));
        fs.existsSync(featureDestDir) || fs.mkdirSync(featureDestDir);
        await execute('mv "'+featureOutFile+'" "'+featureDestPath+'"');
      } catch {
        console.log('failed to extract '+feature.name+' for '+audioPath);
      }
    }
  }

}