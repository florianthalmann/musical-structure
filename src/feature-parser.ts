import * as fs from 'fs';
import * as _ from 'lodash';

interface VampValue {
  time: number,
  value: number
}

export function generatePoints(featureFiles: string[], condition?: any) {
  const points: any = initPoints(featureFiles[0], condition);
  return featureFiles.slice(1).reduce((p,f) => addFeature(f, p), points);
}

function initPoints(filename: string, condition?: any): number[][] {
  let values = getValues(filename);
  if (condition != null) {
    values = values.filter(v => v.value === condition);
  }
  return values.map(v => [v.time]);
}

function addFeature(filename: string, points: number[][]) {
  const values = getValues(filename);
  const grouped : Number[][] = values.reduce((grp,v) => {
    if (grp.length-1 < points.length && v.time < points[grp.length-1][0]) {
      _.last(grp).push(v);
    } else if (grp.length-1 < points.length) {
      grp.push([v]);
    } else {
      _.last(grp).push(v);
    }
    return grp;
  }, [[]]).map(g => g.map(v => v.value));
  return _.zip(points, grouped.slice(1).map(g => mean(g)));
}

function mean(array: Number[] | Number[][]) {
  if (array[0] instanceof Array) {
    return _.zip(...<number[][]>array).map(a => _.mean(a));
  }
  return _.mean(array);
}

function getValues(filename: string): VampValue[] {
  const json = JSON.parse(fs.readFileSync(filename, 'utf8'));
  return json['annotations'][0]['data'];
}