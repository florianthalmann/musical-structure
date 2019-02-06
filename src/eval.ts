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
  const posAndProp = pattern2.map(o => findPositionInAnyOccurrence(o, pattern1))
    .filter(p => p != null);
  //console.log(JSON.stringify(posAndProp))
  const positions = posAndProp.map(p => p[0]);
  //all occs with reoccurring indices are explained by the patterns
  const reoccurring = positions.filter((p,i) => _.includes(positions, p, i+1));
  //filter involved segments
  const involved = posAndProp.filter(p => _.includes(reoccurring, p[0]));
  //overlap proportion of involved pattern2 segments compared to all segments
  return _.sum(involved.map(p => p[1])) / pattern2.length;
}

/** returns relative position and overlapping proportion of the segment and the
  * first overlapping occurrence of the given pattern */
function findPositionInAnyOccurrence(segment: number[], pattern: number[][]): [number, number] {
  const firstOverlap = pattern.find(occ => overlap(segment, occ));
  if (firstOverlap) {
    const spos = _.first(segment) - _.first(firstOverlap);
    const epos = _.last(segment) - _.last(firstOverlap);
    const len = _.last(segment) - _.first(segment) + 1;
    const proportion = (len - Math.max(-spos, 0) - Math.max(epos, 0)) / len;
    return [spos, proportion];
  }
}

function overlap(segment1: number[], segment2: number[]) {
  return inSegment(_.first(segment1), segment2)
    || inSegment(_.last(segment1), segment2);
}

function inSegment(point: number, segment: number[]) {
  return _.first(segment) <= point && point <= _.last(segment);
}