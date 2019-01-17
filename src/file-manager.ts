import * as fs from 'fs';
import { FEATURES_DIR, RESULTS_DIR, PATTERNS_DIR } from './config';
import { audioPathToDirName, audioPathToJsonFileName } from './util';

fs.existsSync(FEATURES_DIR) || fs.mkdirSync(FEATURES_DIR);
fs.existsSync(RESULTS_DIR) || fs.mkdirSync(RESULTS_DIR);
fs.existsSync(PATTERNS_DIR) || fs.mkdirSync(PATTERNS_DIR);

export async function getFeatureFiles(audioPath: string): Promise<string[]> {
  var folder = FEATURES_DIR + audioPathToDirName(audioPath) + '/';
  return (await getFilesInFolder(folder, ["json", "n3"])).map(f => folder + f);
}

export function savePatternsFile(audioPath: string, patterns: number[][][][]) {
  const outFileName = audioPathToJsonFileName(audioPath);
  saveOutFile(PATTERNS_DIR+outFileName, JSON.stringify(patterns));
}

export function loadPatterns(audioPath: string): number[][][][] {
  return loadJsonFile(PATTERNS_DIR + audioPathToJsonFileName(audioPath));
}

export function loadJsonFile(path: string) {
  return fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, 'utf8')) : null;
}

function saveOutFile(filePath: string, content: string): Promise<any> {
  return new Promise((resolve, reject) => {
    fs.writeFile(filePath, content, err => {
      if (err) return reject(err);
      resolve('file saved at ' + filePath);
    });
  });
}

function getFilesInFolder(folder, fileTypes): Promise<string[]> {
  return new Promise(resolve => {
    fs.readdir(folder, (err, files) => {
      if (err) {
        console.log(err);
      } else if (files) {
        var files = files.filter(f =>
          //check if right extension
          fileTypes.indexOf(f.split('.').slice(-1)[0]) >= 0
        );
      }
      resolve(files);
    });
  });
}