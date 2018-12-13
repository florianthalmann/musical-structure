import * as fs from 'fs';
import { FEATURES_DIR, RESULTS_DIR } from './config';
import { audioPathToDirName } from './util';

export class FileManager {

  constructor() {
    fs.existsSync(FEATURES_DIR) || fs.mkdirSync(FEATURES_DIR);
    fs.existsSync(RESULTS_DIR) || fs.mkdirSync(RESULTS_DIR);
  }

  getFeatureFiles(audioPath: string): Promise<string[]> {
    var folder = FEATURES_DIR + audioPathToDirName(audioPath) + '/';
    return this.getFilesInFolder(folder, ["json", "n3"])
      .then(files => files.map(f => folder + f));
  }

  saveOutFile(filePath: string, content: string): Promise<any> {
    return new Promise((resolve, reject) => {
      fs.writeFile(RESULTS_DIR + filePath, content, err => {
        if (err) return reject(err);
        resolve('file saved at ' + filePath);
      });
    });
  }

  private getFilesInFolder(folder, fileTypes): Promise<string[]> {
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

}