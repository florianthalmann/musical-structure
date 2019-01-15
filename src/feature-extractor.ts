import * as fs from 'fs';
import { execute, mapSeries, audioPathToDirName } from './util';
import { FEATURES_DIR } from './config';

export interface FeatureConfig {
  name: string,
  isSegmentation: boolean,
  subset?: string
}

export interface VampFeatureConfig extends FeatureConfig {
  plugin: string
}

export const FEATURES = {
  SECTIONS: {name:'sections', plugin:'vamp:qm-vamp-plugins:qm-segmenter:segmentation', isSegmentation: true},
  BARS: {name:'bars', plugin:'vamp:qm-vamp-plugins:qm-barbeattracker:beats', isSegmentation: true, subset:'1'},
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
  JOHAN_CHORDS: {name:'johanchords', isSegmentation: false}
}

export class FeatureExtractor {

  extractFeatures(audioFiles: string[], features: FeatureConfig[]): Promise<any> {
    return mapSeries(audioFiles, a => mapSeries(features, f => {
      if (f.hasOwnProperty('plugin')) return this.extractVampFeature(a, <VampFeatureConfig>f);
      else if (f === FEATURES.JOHAN_CHORDS) this.extractJohanChords(a);
    }));
  }

  //extracts the given feature from the audio file (path) if it doesn't exist yet
  private extractVampFeature(audioPath: string, feature: VampFeatureConfig): Promise<any> {
    const outFileName = audioPathToDirName(audioPath);
    const extension = audioPath.slice(audioPath.lastIndexOf('.'));
    const featureOutFile = audioPath.replace(extension, '.json');
    const featureDestDir = FEATURES_DIR+outFileName+'/';
    fs.existsSync(featureDestDir) || fs.mkdirSync(featureDestDir);
    const featureDestPath = featureDestDir+outFileName+'_'+feature.name+'.json';
    return new Promise(resolve =>
      fs.stat(featureDestPath, err => {
        if (err) { //only extract if file doesn't exist yet
          console.log('extracting '+feature.name+' for '+audioPath);
          execute('sonic-annotator -d ' + feature.plugin + ' ' + audioPath + ' -w jams --jams-force', success => {
            if (success) {
              execute('mv '+featureOutFile+' '+featureDestPath, resolve);
            }
          });
        } else {
          resolve();
        }
      }));
  }
  
  //extracts the given feature from the audio file (path) if it doesn't exist yet
  private extractJohanChords(audioPath: string): Promise<any> {
    const outFileName = audioPathToDirName(audioPath);
    const extension = audioPath.slice(audioPath.lastIndexOf('.'));
    const featureOutFile = audioPath.replace(extension, '.json');
    const featureDestDir = FEATURES_DIR+outFileName+'/';
    const feature = FEATURES.JOHAN_CHORDS;
    const outPath = audioPath.slice(0, audioPath.lastIndexOf('/'));
    const audioFile = audioPath.slice(audioPath.lastIndexOf('/')+1);
    fs.existsSync(featureDestDir) || fs.mkdirSync(featureDestDir);
    const featureDestPath = featureDestDir+outFileName+'_'+feature.name+'.json';
    return new Promise(resolve =>
      fs.stat(featureDestPath, err => {
        if (err) { //only extract if file doesn't exist yet
          console.log('extracting '+feature.name+' for '+audioPath);
          const command = 'echo -n /srv/'+audioFile+' | docker run --rm -i -v '
            +outPath+':/srv audiocommons/faas-confident-chord-estimator python3 index.py > '
            +featureOutFile;
          execute(command, (success, err) => {
            if (success) {
              execute('mv '+featureOutFile+' '+featureDestPath, resolve);
            }
          });
        } else {
          resolve();
        }
      }));
  }

}