import * as _ from 'lodash';

export function evaluate(patterns: number[][][], groundtruth: number[][][]) {
  const ratings = patterns.map(p => ratePattern(p, groundtruth));
  //console.log(ratings)
  //TODO MEAN OF NON-ZERO?????
  return _.mean(ratings);
}

function ratePattern(pattern: number[][], groundtruth: number[][][]) {
  //find where groundtruth occs occur in pattern occs
  const proportions = groundtruth.map(p => contains(pattern, p));
  //console.log(JSON.stringify(proportions))
  //TODO MEAN OF NON-ZERO?????
  return _.mean(proportions);
}

/** returns the proportion of pattern2 contained in pattern1 */
function contains(pattern1: number[][], pattern2: number[][]) {
  const positions = pattern2.map(o => findPositionInAnyOccurrence(o[0], pattern1))
    .filter(p => p != null);
  //all occs with reoccurring indices are explained by the patterns
  const reoccurring = positions.filter((p,i) => _.includes(positions, p, i+1));
  //filter involved segments
  const involved = positions.filter(p => _.includes(reoccurring, p));
  //return proportion
  return involved.length / pattern2.length;
}

function findPositionInAnyOccurrence(point: number, pattern: number[][]) {
  return pattern.map(occ =>
    occ[0] <= point && point <= occ[occ.length-1] ? point - occ[0] : null)
  .filter(pos => pos != null)[0];
}