import * as fs from 'fs';
import { GD_RESULTS } from './config';
import { getFoldersInFolder, getFilesInFolder, saveJsonFile } from './file-manager';

const TUNING_FILE = GD_RESULTS+'tunings.json';
const TUNINGS = JSON.parse(fs.readFileSync(TUNING_FILE, 'utf8'));

export function getTuningRatio(recording: string, track: string) {
  if (TUNINGS[recording]) return TUNINGS[recording][track];
}

export function gatherTunings(dir: string) {
  const songs = getFoldersInFolder(dir);
  const tunings = {};
  songs.forEach(s => getFoldersInFolder(dir+s).forEach(v =>
    getFilesInFolder(dir+s+'/'+v, ['txt']).forEach(f => {
      if (!tunings[v]) tunings[v] = {};
      tunings[v][f.replace('_tuning.txt','')] = parseTuning(dir+s+'/'+v+'/'+f);
    })));
  saveJsonFile(dir+'tunings.json', tunings);
}

function parseTuning(path: string) {
  const text = fs.readFileSync(path, 'utf8');
  return parseFloat(text.split('ratio: ')[1]);
}