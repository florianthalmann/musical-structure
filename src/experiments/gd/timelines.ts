import * as fs from 'fs';
import * as _ from 'lodash';
import { mapSeries } from '../../files/util';
import { TimelineOptions, TimelineAnalysis } from '../../analysis/timeline-analysis';
import { hmmAlign } from '../../models/models';
import { AlignmentAlgorithm } from '../../analysis/alignments';
import { getTunedSongs, getSongFoldersAndOptions, getTunedAudioFiles, GdVersion,
  getSongMap } from './util';
import { GD_RAW, MSA_BASE, GD_GRAPHS, GdOptions, GdFolders } from './config';


export async function analyzeAllRaw(tlo: GdOptions) {
  mapSeries(getTunedSongs(), async s => {
    const [folders, options] = getSongFoldersAndOptions(tlo, s);
    return generateTimelineViaGaussianHMM(folders, options);
  });
}

export async function analyzeRaw(tlo: TimelineOptions) {
  generateTimelineViaGaussianHMM(GD_RAW, tlo);
}

async function generateTimelineViaGaussianHMM(folders: GdFolders, tlo: TimelineOptions) {
  tlo.audioFiles = await getTunedAudioFiles(folders.audio, tlo.count);
  console.log('saving raw sequences')
  const ta = new TimelineAnalysis(Object.assign(tlo,
    {featuresFolder: folders.features, patternsFolder: folders.patterns}));
  if (tlo.multinomial) await ta.saveMultinomialSequences();
  else await ta.saveRawSequences();
  console.log('aligning using hmm')
  await hmmAlign(tlo.filebase+'-points.json',
    MSA_BASE+tlo.filebase.split('/').slice(-1)[0]+'/');
  //ta.printMSAStats();
  console.log('saving timeline')
  await ta.saveTimelineFromMSAResults();
  /*console.log('saving sssm');
  await ta.saveSumSSMfromMSAResults();*/
  //ta.getStructure();
}

export async function saveAllSongSequences(offset = 0, skip = 0, total = 10) {
  let songs: [string, GdVersion[]][] = _.toPairs(getSongMap());
  songs = _.reverse(_.sortBy(songs, s => s[1].length));
  mapSeries(songs.slice(offset).filter((_,i) => i%(skip+1)==0).slice(0, total),
    s => new TimelineAnalysis(getBasicTimelineOptions(s[0]))
      .savePatternAndVectorSequences(GD_GRAPHS+s[0], true));
}

export async function saveThomasSongSequences() {
  mapSeries(getTunedSongs(), folder => {
    GD_RAW.audio = '/Volumes/gspeed1/florian/musical-structure/thomas/'+folder+'/';
    const songname = folder.split('_').join(' ');
    return new TimelineAnalysis(getBasicTimelineOptions(songname))
      .savePatternAndVectorSequences(GD_GRAPHS+songname, true);
  });
}

function getBasicTimelineOptions(songname: string) {
  return {collectionName: songname,
    audioFiles: getTunedAudioFiles(songname),
    featuresFolder: GD_RAW.features, patternsFolder: GD_RAW.patterns}
}

export async function saveThomasSongAlignments() {
  const DIR = 'results/gd/graphs-sw-full-30-5/';
  fs.existsSync(DIR) || fs.mkdirSync(DIR);
  mapSeries(getTunedSongs(), folder => {
    GD_RAW.audio = '/Volumes/gspeed1/florian/musical-structure/thomas/'+folder+'/';
    const songname = folder.split('_').join(' ');
    return new TimelineAnalysis(Object.assign(getBasicTimelineOptions(songname),
      {filebase: DIR+songname, song: songname,
        extension: '.wav', count: 5, algorithm: AlignmentAlgorithm.SW,
        includeSelfAlignments: true})).saveMultiTimelineDecomposition();
  });
}