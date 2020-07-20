import * as _ from 'lodash';
import { getFoldersInFolder, recGetFilesInFolder } from '../../files/file-manager';
import { FeatureLoader } from '../../files/feature-loader';
import { FeatureOptions } from '../../files/options';
import { GD_RAW } from './config';

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

export function getTunedAudioFiles(song: string, count = Infinity) {
  return recGetFilesInFolder(GD_RAW.audio+song+'/', ['wav']).slice(0, count);
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
