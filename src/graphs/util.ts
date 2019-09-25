import * as _ from 'lodash';

export function toIndexSeqMap<T>(mdArray: T[][], func: (t: T) => string): _.Dictionary<number[][]> {
  const indexSeq = _.flatten(mdArray.map((a,i) => a.map((_,j) => [i, j])));
  return _.groupBy(indexSeq, ([i,j]) => func(mdArray[i][j]));
}

export function powerset<T>(set: T[]): T[][] {
  return set.reduce(
    (subsets, value) => subsets.concat(subsets.map(s => [value, ...s])),
    [[]]);
}