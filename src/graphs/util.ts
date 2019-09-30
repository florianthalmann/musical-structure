import * as _ from 'lodash';
import { compareArrays } from 'arrayutils';

export function toIndexSeqMap<T>(mdArray: T[][], func: (t: T) => string): _.Dictionary<number[][]> {
  const indexSeq = _.flatten(mdArray.map((a,i) => a.map((_,j) => [i, j])));
  return _.groupBy(indexSeq, ([i,j]) => func(mdArray[i][j]));
}

export function powerset<T>(set: T[]): T[][] {
  return set.reduce(
    (subsets, value) => subsets.concat(subsets.map(s => [value, ...s])),
    [[]]);
}

export function toNormalForm(points: number[][]): number[][] {
  const normalForm = _.cloneDeep(points);
  normalForm.sort(compareArrays);
  const offset = normalForm[0][0];
  normalForm.forEach(p => p[0] -= offset);
  return normalForm;
}

export function toVectorNormalForms(points: number[][], vectors: number[][]): number[][][] {
  const norm = toNormalForm(points);
  return vectors.filter(v => v.some(c => c !== 0)).map(v => _.concat(norm, [v]));
}