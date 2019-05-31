import * as fs from 'fs';
import * as _ from 'lodash';
import { ArrayMap } from 'siafun';
import { createHistogramGraph } from './pattern-stats';
import { getGdVersions } from './run-gd';
import { mapSeries } from './util';
import { FeatureConfig, getFeatures } from './feature-extractor';
import { getQuantizedPoints } from './feature-parser';

export async function histsToGraph() {
  const file = 'hists3chSB.json';
  let hists = JSON.parse(fs.readFileSync(file, 'utf8'));
  hists = hists.map(h => simplifyHistograms(h, 4, true))
  //console.log(proj.slice(0,3));
  createHistogramGraph(hists, 'plots/d3/newest/'+file);
  //analyzePatternGraph("plots/d3/beats/good lovin'mf4be.json");
}

export async function saveGdHists(songs: string[], features: FeatureConfig[], quantFuncs: ArrayMap[], filename: string) {
  const points = await Promise.all(songs.map(async s =>
    mapSeries(getGdVersions(s), async a => getQuantizedPoints(quantFuncs, await getFeatures(a, features)))));
  const hists = points.map(p => p.map(toHistogram));
  fs.writeFileSync(filename, JSON.stringify(hists));
}

async function getMultiFeatures(audioFiles: string[], features: FeatureConfig[]) {
  return mapSeries(audioFiles, f => getFeatures(f, features));
}

function simplifyHistograms(hists: number[][][], maxBins = 4, sort = true): number[][][] {
  const maxes = hists.map(h => h.slice(0, maxBins));
  if (sort) maxes.map(p => p.sort());
  return maxes;
}

function getHistograms(points: number[][][]): number[][][] {
  const hists = points.map(toHistogram);
  return hists.map(h => _.reverse(_.sortBy(_.toPairs(h), 1)))
    .map(h => h.map(b => <number[]>JSON.parse(b[0])));
}

async function toHistogram(points: number[][]) {
  const grouped = _.groupBy(points, p => JSON.stringify(p.slice(1)));
  return _.mapValues(grouped, v => v.length);
}