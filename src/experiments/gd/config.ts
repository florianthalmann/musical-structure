import { initDirRec } from '../../files/file-manager';
import { TimelineOptions } from '../../analysis/timeline-analysis';

export interface GdFolders {
  audio: string,
  features: string,
  patterns: string
}

export interface GdOptions extends TimelineOptions {
  appendix: string
}

export const GD_RESULTS = initDirRec('results/gd/');
export const GD_SWEEPS = initDirRec(GD_RESULTS+'sweeps/');
export const GD_GRAPHS = initDirRec(GD_RESULTS+'graphs/');

export const DATA = '/Volumes/FastSSD/gd_tuned/';
//export const DATA = '/media/florian/FastSSD/gd_tuned/';
//export const DATA = '/Volumes/gspeed1/florian/musical_structure/data/'
export const GD_SONG_MAP = DATA+'audio/app_song_map.json';
export const GD_RAW: GdFolders = { audio: DATA+'audio/',
  features: DATA+'features/', patterns: DATA+'patterns/' };
export const MSA_BASE = DATA+'msa/';

export const SW_BEST = {
  maxIterations: 1,//true,
  //similarityThreshold: .95,
  minSegmentLength: 16, //only take segments longer than this
  //maxThreshold: [50], //stop when max value below this
  nLongest: 10,//[10]
  maxGapSize: 4,
  //maxGaps: 5,
  maxGapRatio: 0.25,
  minDistance: 4,
  cacheDir: GD_RAW.patterns
}
