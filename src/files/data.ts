import * as _ from 'lodash';
import { saveJsonFile, loadJsonFile } from '../files/file-manager';

export class DataFrame {
  
  private rows: (number | string)[][] = [];
  
  constructor(private columnNames?: string[]) {}
  
  addRow(values: (number | string)[]) {
    if (!this.columnNames || values.length === this.columnNames.length) {
      this.rows.push(values);
    }
  }
  
  hasRow(values: (number | string)[]) {
    return this.rows.filter(r => values.every((v,i) => r[i] === v)).length > 0;
  }
  
  save(path: string) {
    saveJsonFile(path, {"columns": this.columnNames, "data": this.rows});
  }
  
  load(path: string) {
    const json = loadJsonFile(path);
    if (json) {
      this.columnNames = json.columns;
      this.rows = json.data;
    }
    return this;
  }
}