import * as fs from 'fs';
import * as fse from 'fs-extra';
import * as _ from 'lodash';
import { audioPathToDirName } from './util';

export function initDirRecForFile(filePath: string) {
  return initDirRec(filePath.split('/').slice(0, -1).join('/'));
}

export function initDirRec(path: string) {
  const dirNames = path.split('/').filter(d => d != "");
  dirNames.forEach((_,i) => {
    const subdir = dirNames.slice(0, i+1).join('/');
    fs.existsSync(subdir) || fs.mkdirSync(subdir);
  });
  return dirNames.join('/')+'/';
}

export function importFeaturesFolder(audioPath: string, fromPath: string, featuresDir: string) {
  const folder = audioPathToDirName(audioPath)+'/';
  const source = fromPath+folder;
  const target = featuresDir+folder;
  const wavSource = source.replace('mp3', 'wav');
  if (fs.existsSync(source)) {
    fse.copySync(source, target);
    console.log('copied', source);
  } else if (fs.existsSync(wavSource)) {
    fse.copySync(wavSource, target);
    fs.readdirSync(target).forEach(f =>
      fs.renameSync(target+f, target+f.replace('wav','mp3')));
    console.log('copied wav as mp3', wavSource);
  } else {
    console.log('NOT FOUND', source);
  }
}

export function moveToFeaturesDir(currentDir: string, featuresDir: string) {
  fs.readdirSync(currentDir).forEach(f => {
    const destDir = featuresDir + f.slice(0, _.lastIndexOf(f, '_')) + '/';
    fs.existsSync(destDir) || fs.mkdirSync(destDir);
    fs.copyFileSync(currentDir+f, destDir+f);
  });
}

export function renameJohanChordFeatures(featuresDir: string) {
  fs.readdirSync(featuresDir).filter(d => d.indexOf('.DS_Store') < 0).forEach(d =>
    fs.readdirSync(featuresDir+d).filter(p => p.indexOf('johanchords') >= 0).forEach(j =>
      fs.renameSync(featuresDir+d+'/'+j, featuresDir+d+'/'+j.replace('johanchords', 'johan'))));
}

export async function cleanCaches(path: string, search: string) {
  const subpaths = fs.readdirSync(path)
    .filter(p => p.indexOf('lma-audio') >= 0)
    .map(p => path+'/'+p);
  const filepaths = _.flatten(subpaths.map(p => fs.readdirSync(p)
    .filter(f => f.indexOf(search) >= 0)
    .map(f => p+'/'+f)));
  console.log('removing', filepaths.length, 'files');
  filepaths.forEach(f => fs.unlinkSync(f));
}

export async function getAllFeatureFiles(audioPath: string, featuresDir: string): Promise<string[]> {
  var folder = featuresDir + audioPathToDirName(audioPath) + '/';
  return getFilesInFolder(folder, ["json", "n3"]).map(f => folder + f);
}

export function loadJsonFile(path: string) {
  return fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, 'utf8')) : null;
}

export function loadTextFile(path: string) {
  return fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : null;
}

export function saveJsonFile(path: string, content: {}) {
  fs.writeFileSync(path, JSON.stringify(content));
}

export function saveTextFile(path: string, content: string) {
  fs.writeFileSync(path, content);
}

export function saveOutFile(filePath: string, content: string): Promise<any> {
  return new Promise((resolve, reject) => {
    fs.writeFile(filePath, content, err => {
      if (err) return reject(err);
      resolve('file saved at ' + filePath);
    });
  });
}

export function getFoldersInFolder(folder: string): string[] {
  return fs.readdirSync(folder, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
}

export function getFilesInFolder(folder: string, fileTypes: string[]): string[] {
  try {
    return fs.readdirSync(folder).filter(f =>
      fileTypes.indexOf(f.split('.').slice(-1)[0]) >= 0);
  } catch (err) { console.log(err); }
}
