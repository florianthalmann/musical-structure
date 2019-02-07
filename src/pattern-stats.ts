import * as _ from 'lodash';

export function comparePatterns(patterns: number[][][][][]) {
  const norms = patterns.map(ps => ps.map(p => JSON.stringify(toNormalForm(p))));
  const counts = _.toPairs(_.countBy(_.flatten(norms)));
  counts.sort((a,b)=>b[1]-a[1]);
  console.log("TOTAL DISTINCT PATTERNS:", counts.length);
  console.log("MOST COMMON PATTERN", counts[0][1], "TIMES:", counts[0][0]);
  //console.log(counts.slice(0,10));
}

function toNormalForm(pattern: number[][][]) {
  const normalForm = pattern[0];
  normalForm.sort((a,b)=>a[0]-b[0]);
  const offset = normalForm[0][0];
  normalForm.forEach(p => p[0] -= offset);
  return normalForm;
}

export function mapToTimegrid(times: number[], patterns: number[][][], timegrid: number[], round?: boolean): number[][][] {
  return patterns.map(p => p.map(o => {
    const start = times[_.first(o)];
    const end = times[_.last(o)+1];
    let iStart = timegrid.findIndex(t => t > start) - 1;
    let iEnd = timegrid.findIndex(t => t > end) - 1;
    iStart = iStart >= 0 ? iStart : 0;
    iEnd = iEnd >= 0 ? iEnd : timegrid.length-1;
    if (round) {
      iStart += indexOfClosest(start, [timegrid[iStart], timegrid[iStart+1]]);
      iEnd += indexOfClosest(end, [timegrid[iEnd], timegrid[iEnd+1]]);
    }
    return _.range(iStart, iEnd);
  }));
}

/** returns a normalized copy of the pattern (filled gaps and equal *
  * occurrence lengths) */
export function normalize(patterns: number[][][]) {
  return patterns.map(p => {
    const lengths = p.map(o => o[o.length-1] - o[0] + 1);
    const mode = parseInt(_(lengths).countBy().entries().maxBy('[1]')[0]);
    return p.map(o => _.range(o[0], o[0]+mode));
  });
}

function indexOfClosest(b: number, as: number[]): number {
  const absDists = as.map(a => Math.abs(b-a));
  return absDists.reduce((iMin,d,i) => d < absDists[iMin] ? i : iMin, 0);
}