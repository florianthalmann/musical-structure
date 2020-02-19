import * as fs from 'fs';
import { getFoldersInFolder, getFilesInFolder, saveJsonFile,
  initDirRecForFile } from './file-manager';
import { chromaticKeyDifference } from './theory';
import { execute } from './util';

const TUNING_FILE = 'results/gd/thomas-tunings.json';
const TUNINGS = JSON.parse(fs.readFileSync(TUNING_FILE, 'utf8'));

export function actuallyTuneFile(audioFile: string, targetFile: string,
    currentTuningFreq: number, targetTuningFreq: number, currentKey: string,
    targetKey: string) {
  if (!fs.existsSync(targetFile)) {
    const keyDifference = chromaticKeyDifference(targetKey, currentKey);
    const keyRatio = Math.pow(2, keyDifference/12);
    const tuningFreqRatio = targetTuningFreq/currentTuningFreq;
    const totalRatio = keyRatio * tuningFreqRatio;
    console.log("tuning", audioFile, "at", totalRatio);
    initDirRecForFile(targetFile);
    return new Promise<void>(resolve =>
      execute('sox "'+audioFile+'" "'+targetFile+'" speed '+totalRatio, resolve));
  }
}

export function getThomasTuningRatio(recording: string, track: string) {
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