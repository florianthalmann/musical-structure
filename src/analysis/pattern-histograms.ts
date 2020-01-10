import * as fs from 'fs';
import * as _ from 'lodash';
import { createHistogramGraph } from './pattern-analysis';

export async function histsToGraph() {
  const file = 'hists3chSB.json';
  let hists: number[][][][] = JSON.parse(fs.readFileSync(file, 'utf8'));
  hists = hists.map(h => simplifyHistograms(h, 4, true));
  //console.log(proj.slice(0,3));
  createHistogramGraph(hists, 'plots/d3/newest/'+file);
  //analyzePatternGraph("plots/d3/beats/good lovin'mf4be.json");
}

function simplifyHistograms(hists: number[][][], maxBins = 4, sort = true): number[][][] {
  const maxes = hists.map(h => h.slice(0, maxBins));
  if (sort) maxes.map(p => p.sort());
  return maxes;
}

export function getMostCommonPoints(points: number[][]): number[][] {
  return _.reverse(_.sortBy(_.toPairs(toHistogram(points)), 1))
    .map(b => <number[]>JSON.parse(b[0]));
}

export function toHistogram(points: number[][]) {
  const grouped = _.groupBy(points, p => JSON.stringify(p));
  return _.mapValues(grouped, v => v.length);
}