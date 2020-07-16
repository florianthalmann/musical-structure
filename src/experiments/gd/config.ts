import { initDirRec } from '../../files/file-manager';

interface GdFolders {
  audio: string,
  features: string,
  patterns: string
}

export const GD_GRAPHS = initDirRec('results/gd/graphs/');

export const DATA = '/media/florian/FastSSD/gd_tuned/';//'/Volumes/gspeed1/florian/musical_structure/data/'
export const GD_SONG_MAP = DATA+'audio/app_song_map.json';
export const GD_RAW: GdFolders = { audio: DATA+'audio/',
  features: DATA+'features/', patterns: DATA+'patterns/' };
export const GD_TUNED: GdFolders = { audio: DATA+'gd_retuned/',//no longer used
  features: DATA+'gd_retuned_features/', patterns: DATA+'gd_retuned_patterns/' };
export const MSA_BASE = DATA+'msa/';

export const swBest = {
  maxIterations: 1,//true,
  //similarityThreshold: .95,
  minSegmentLength: 16, //only take segments longer than this
  //maxThreshold: [50], //stop when max value below this
  nLongest: 10,//[10]
  maxGapSize: 4,
  //maxGaps: 5,
  maxGapRatio: 0.25,
  minDistance: 4
}
