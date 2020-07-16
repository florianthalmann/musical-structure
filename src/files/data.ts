import * as _ from 'lodash';
import { saveJsonFile, loadJsonFile } from '../files/file-manager';

type Value = number | string;

export class DataFrame {
  
  private columnNames: string[] = [];
  private columnData = new Map<string, Value[]>();
  private nextRowIndex = 0;
  
  constructor(private path: string, columnNames?: string[]) {
    if (columnNames) this.updateColumns(columnNames);
    this.load();
  }
  
  addRow(values: Value[], columnNames?: string[]) {
    if (columnNames) {
      this.updateColumns(columnNames);
    } else {
      columnNames = this.columnNames.slice(0, values.length);
    }
    _.zip(columnNames, values).forEach(([n,v]) =>
      this.columnData.get(n)[this.nextRowIndex] = v);
    this.nextRowIndex++;
  }
  
  hasRow(values: Value[], columnNames = this.columnNames.slice(0, values.length)) {
    let valueArray = _.zip(columnNames, values);
    let candidateRows = _.range(0, this.nextRowIndex);
    while (valueArray.length > 0 && candidateRows.length > 0) {
      const currentColumn = this.columnData.get(valueArray[0][0]);
      candidateRows = candidateRows.filter(i =>
        currentColumn[i] === valueArray[0][1]);
      valueArray.splice(0, 1);
    }
    return candidateRows.length > 0;
  }
  
  private updateColumns(columnNames: string[]) {
    if (_.difference(columnNames, this.columnNames).length > 0) {
      let indexOfLastCommon = -1;
      columnNames.forEach(n => {
        const currentIndex = this.columnNames.indexOf(n);
        if (currentIndex != -1) {
          indexOfLastCommon = currentIndex;
        } else {
          this.columnNames.splice(indexOfLastCommon+1, 0, n);
          this.columnData.set(n, []);
          indexOfLastCommon++;
        }
      });
    }
  }
  
  save() {
    saveJsonFile(this.path,
      {"columns": this.columnNames, "data": this.dataToRows()});
  }
  
  private load() {
    const json = loadJsonFile(this.path);
    if (json) {
      this.columnNames = json.columns;
      this.nextRowIndex = json.data.length;
      const loadedColumns = this.rowsToData(json.data);
      this.columnData = new Map<string, Value[]>();
      this.columnNames.forEach((n,i) =>
        this.columnData.set(n, loadedColumns[i]));
    }
    return this;
  }
  
  private dataToRows() {
    const columns = this.columnNames.map(n => {
      const column: Value[] = [];
      this.columnData.get(n).forEach((v,i) => column[i] = v);
      return column;
    });
    return _.zip(...columns);
  }
  
  private rowsToData(rows: Value[][]) {
    const columns = _.range(0, rows[0].length);
    return columns.map(c => {
      const column = [];
      rows.map(r => r[c]).forEach((v,i) => v == null || (column[i] = v));
      return column;
    });
  }
}