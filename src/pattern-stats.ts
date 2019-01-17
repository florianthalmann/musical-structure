import * as _ from 'lodash';

export function comparePatterns(patterns: number[][][][][]) {
  const norms = patterns.map(ps => ps.map(p => JSON.stringify(toNormalForm(p))));
  const counts = _.toPairs(_.countBy(_.flatten(norms)));
  counts.sort((a,b)=>b[1]-a[1]);
  console.log("TOTAL DISTINCT PATTERNS:", counts.length);
  console.log("MOST COMMON PATTERN", counts[0][1], "TIMES:", counts[0][0]);
  console.log(counts.slice(0,10));
}

function toNormalForm(pattern: number[][][]) {
  let normalForm = pattern[0];
  normalForm.sort((a,b)=>a[0]-b[0]);
  const offset = normalForm[0][0];
  normalForm.forEach(p => p[0] -= offset);
  return normalForm;
}