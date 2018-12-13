import * as fs from 'fs';
import { execute, mapSeries, audioPathToDirName } from './util';
import { FeatureConfig, FEATURES_DIR } from './config';

export class FeatureExtractor {

  extractFeatures(audioFiles: string[], features: FeatureConfig[]): Promise<any> {
    return mapSeries(audioFiles, a =>
      mapSeries(features, f => this.extractFeature(a, f)));
  }

  //extracts the given feature from the audio file (path) if it doesn't exist yet
  private extractFeature(audioPath: string, feature: FeatureConfig): Promise<any> {
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

}