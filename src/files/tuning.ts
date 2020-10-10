import * as fs from 'fs';
import * as _ from 'lodash';
import { getFoldersInFolder, getFilesInFolder, saveJsonFile,
  initDirRecForFile } from './file-manager';
import { chromaticKeyDifference } from './theory';
import { execute } from './util';

const TUNING_FILE = 'results/gd/thomas-tunings.json';
let TUNINGS;

/** maxKeyDiff: only consider if difference within this range. makes this more
  * resilient to analytical errors, e.g. identification as (sub)dominant key */
export function actuallyTuneFile(audioFile: string, targetFile: string,
    currentTuningFreq: number, targetTuningFreq: number, currentKey: string,
    targetKey: string, maxKeyDiff = 3) {
  let keyDifference = chromaticKeyDifference(targetKey, currentKey);
  keyDifference = Math.abs(keyDifference) <= maxKeyDiff ? keyDifference : 0;
  const keyRatio = Math.pow(2, keyDifference/12);
  const tuningFreqRatio = targetTuningFreq/currentTuningFreq;
  const totalRatio = keyRatio * tuningFreqRatio;
  //console.log(keyDifference, keyRatio, tuningFreqRatio, totalRatio);
  if (!fs.existsSync(targetFile)) {
    console.log("tuning", audioFile, "at", totalRatio);
    initDirRecForFile(targetFile);
    return execute('sox "'+audioFile+'" "'+targetFile+'" speed '+totalRatio);
  }
}

export function getThomasTuningRatio(recording: string, track: string) {
  if (!TUNINGS) TUNINGS = JSON.parse(fs.readFileSync(TUNING_FILE, 'utf8'));
  if (TUNINGS[recording]) return TUNINGS[recording][track];
}

export function gatherThomasTunings(dir: string) {
  const songs = getFoldersInFolder(dir);
  const tunings = {};
  songs.forEach(s => getFoldersInFolder(dir+s).forEach(v =>
    getFilesInFolder(dir+s+'/'+v, ['txt']).forEach(f => {
      if (!tunings[v]) tunings[v] = {};
      tunings[v][f.replace('_tuning.txt','')] =
        parseThomasTuning(dir+s+'/'+v+'/'+f);
    })));
  saveJsonFile(dir+'tunings.json', tunings);
}

function parseThomasTuning(path: string) {
  const text = fs.readFileSync(path, 'utf8');
  return parseFloat(text.split('ratio: ')[1]);
}