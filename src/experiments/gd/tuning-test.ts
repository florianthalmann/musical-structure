import * as _ from 'lodash';
import { mapSeries } from '../../files/util';
import { FEATURES } from '../../files/feature-extractor';
import { FeatureLoader } from '../../files/feature-loader';
import { actuallyTuneFile } from '../../files/tuning';
import { getStandardDeviation } from '../../analysis/util';
import { GD_RAW, GdFolders, DATA } from './config';
import { getOriginalAudioFiles, saveDataset } from './util';

saveDataset('dataset.json')

const GD_TUNED: GdFolders = { audio: DATA+'gd_retuned/',//no longer used
features: DATA+'gd_retuned_features/', patterns: DATA+'gd_retuned_patterns/' };

/* these experiments were performed on the non-tuned files. files tuned by
  thomas and chris are tuned more reliably than with this method */

/** shows that standard deviation of tuning frequency never goes below 2-3,
  * which is reached after one tuning step. due to noisy audio and features.
  * 440.1869824218302 4.402311809256126 {"E minor":87,"Eb minor":1,"G major":10,"F minor":1,"A major":1}
  * 439.48486022934986 3.079363065396714 {"E minor":87,"G major":12,"F major":1}
  * 439.5063250731498 2.8715271942085785 {"E minor":87,"F minor":2,"G major":10,"A major":1}
  * 439.1745877074401 2.562394352922307 {"E minor":84,"G major":9,"F minor":6,"F major":1}
  * 439.65179229723003 2.9820525206578012 {"E minor":84,"G major":14,"A major":1,"F minor":1}
  * 439.22349029528 2.683435453520694 {"E minor":85,"G major":11,"F major":1,"F minor":2,"Eb minor":1} */
export async function tuningTest(numIterations = 5) {
  await tuneSongVersions(440, GD_RAW.audio, GD_RAW.features, GD_TUNED.audio);
  const folders = _.range(1, numIterations).map(i => i == 1 ? GD_TUNED : {
    audio: 'data/gd_tuned'+i+'/',
    features: 'data/gd_tuned'+i+'_features/',
    patterns: 'data/gd_tuned'+i+'_patterns/'
  });
  await mapSeries(folders, async (f,i) => {
    if (i > 0) {
      const features = await tuneSongVersions(440,
        folders[i-1].audio, folders[i-1].features, f.audio);
      const keyFreq = _.mapValues(_.groupBy(features.keys), v => v.length);
      console.log(JSON.stringify(_.zip(_.range(f.audio.length),
        features.tuningFreqs, features.keys)));
      console.log(features.mostCommonKey, _.mean(features.tuningFreqs),
        getStandardDeviation(features.tuningFreqs), JSON.stringify(keyFreq));
    }
  });
  const lastVersions = await getOriginalAudioFiles(_.last(folders).audio);
  await getTuningFeatures(lastVersions, _.last(folders).features);
}

async function tuneSongVersions(targetFreq: number,
    originalFolder: string, featuresFolder: string, tunedFolder: string) {
  const versions = await getOriginalAudioFiles(originalFolder);
  const tuningFeatures = await getTuningFeatures(versions, featuresFolder);
  await mapSeries(versions, (v,i) => actuallyTuneFile(v,
    v.replace(originalFolder, tunedFolder), tuningFeatures.tuningFreqs[i],
    targetFreq, tuningFeatures.keys[i], tuningFeatures.mostCommonKey));
  return tuningFeatures;
}

async function getTuningFeatures(audioFiles: string[], featuresFolder: string) {
  const features = new FeatureLoader(featuresFolder);
  const tuningFreqs: number[] =
    await features.getFeaturesFromAudio(audioFiles, FEATURES.ESSENTIA_TUNING);
  const keys: string[] =
    await features.getFeaturesFromAudio(audioFiles, FEATURES.ESSENTIA_KEY);
  const mostCommonKey = <string>_.head(_(keys).countBy().entries().maxBy(_.last));
  return {tuningFreqs: tuningFreqs, keys: keys, mostCommonKey: mostCommonKey};
}