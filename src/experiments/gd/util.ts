import * as _ from 'lodash';
import { getFoldersInFolder, recGetFilesInFolder } from '../../files/file-manager';
import { FeatureLoader } from '../../files/feature-loader';
import { FeatureOptions } from '../../files/options';
import { GD_RAW } from './config';

export function getTunedSongs() {
  try {
    const folders = getFoldersInFolder(GD_RAW.audio);
    return folders.filter(f => f !== 'temp' && f !== 'studio_reference'
      && f !== "good_lovin'" && f !== "me_and_my_uncle")// && f !== "dancin'_in_the_street" && f !== "dark_star")// && f !== "good_lovin'" && f !== "me_and_my_uncle")
  } catch (e) {
    console.log('failed to load tuned songs');
    return [];
  }
}

export function getTunedAudioFiles(song: string, count = Infinity) {
  return recGetFilesInFolder(GD_RAW.audio+song+'/', ['wav']).slice(0, count);
}

export function getPoints(audioFiles: string[], options: FeatureOptions) {
  return new FeatureLoader(GD_RAW.features)
    .getPointsForAudioFiles(audioFiles, options);
}

export function toHistogram<T>(vals: T[], allVals: T[]) {
  const grouped = _.groupBy(vals, v => JSON.stringify(v));
  return allVals.map(v => JSON.stringify(v))
    .map(v => grouped[v] ? grouped[v].length : 0);
}
