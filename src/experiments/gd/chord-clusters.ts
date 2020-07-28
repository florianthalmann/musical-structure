import * as _ from 'lodash';
import * as KNN from 'ml-knn';
import { agnes } from 'ml-hclust';
import * as dc from 'density-clustering';
import { getMode } from '../../analysis/util';
import { getTunedSongs, getBeatwiseChords, toFrequencyHistogram } from './util';

const SONGS = getTunedSongs();
const VERSIONS = Infinity;
const HCLUST_CUT = 5000;
const DBSCAN_RADIUS = 0.085;
const OPTICS_RADIUS = 0.085;
const DBSOPT_MIN = 10;

run();

async function run() {
  const data = await getAnnotatedData();
  classifyWithKNN(data.data, data.classes);
  classifyWithHclust(data.data, data.classes);
  classifyWithDbscan(data.data, data.classes);
  classifyWithOptics(data.data, data.classes);
}

function classifyWithKNN(data: number[][], classes: number[]) {
  console.log('knning...')
  const predictions = <number[]>new KNN(data, classes).predict(data);
  printProbabilities(classes, predictions);
}

function classifyWithHclust(data: number[][], classes: number[]) {
  console.log('hclustering...')
  const tree = agnes(data, {method: 'ward'});
  const clusters = tree.group(15).children.map(c => c.indices());
  //const clusters = tree.cut(HCLUST_CUT).map(c => c.indices());
  const predictions = getPredictionsFromClusters(clusters, classes);
  printProbabilities(classes, predictions);
}

function classifyWithDbscan(data: number[][], classes: number[]) {
  console.log('dbscanning...')
  const clusters = <number[][]>new dc.DBSCAN().run(data, DBSCAN_RADIUS, DBSOPT_MIN);
  const predictions = getPredictionsFromClusters(clusters, classes);
  printProbabilities(classes, predictions);
}

function classifyWithOptics(data: number[][], classes: number[]) {
  console.log('optics...')
  const optics = new dc.OPTICS();
  const clusters = <number[][]>optics.run(data, OPTICS_RADIUS, DBSOPT_MIN);
  const predictions = getPredictionsFromClusters(clusters, classes);
  //console.log(JSON.stringify(optics.getReachabilityPlot()))
  printProbabilities(classes, predictions);
}

function printProbabilities(classes: number[], predictions: number[],
    printSongs = false) {
  const grouped = SONGS.map((_s,i) =>
    predictions.filter((_p,j) => classes[j] == i));
  const probs = grouped.map((g,i) => g.filter(c => c == i).length/g.length);
  if (printSongs) SONGS.forEach((s,i) => console.log(s, probs[i]));//, grouped[i].length));
  console.log(_.mean(probs));
}

function getPredictionsFromClusters(clusters: number[][], classes: number[],
    removeOutliers = true) {
  if (removeOutliers) clusters = clusters.filter(c => c.length > 1);
  const sizes = clusters.map(c => c.length);
  console.log('count', clusters.length);
  console.log('avg', _.mean(sizes));
  console.log('range', _.min(sizes), _.max(sizes))
  //console.log('sizes', JSON.stringify(clusters.map(c => c.length)));
  const memberClasses = clusters.map(c => _.reverse(_.sortBy(
    _.toPairs(_.groupBy(c.map(i => classes[i]))), p => p[1].length)));
  const mainMembers = memberClasses.map(c =>
    c.filter(p => p[1].length > 0.2*c.length).map(p => parseInt(p[0])))
  //console.log('members', JSON.stringify(mainMembers));
  const clusterClasses = clusters.map(c => getMode(c.map(i => classes[i])));
  const predictions = _.range(0, classes.length).map(i =>
    clusterClasses[clusters.findIndex(c => _.includes(c, i))]);
  console.log('outliers', predictions.filter(p => p == null).length);
  //console.log(JSON.stringify(predictions));
  return predictions;
}

async function getAnnotatedData() {
  console.log('preparing data');
  const hists = await getChordHists();
  const data = _.flatten(hists);
  const classes = _.flatten(hists.map((s, i) => s.map(_v => i)));
  return {data: data, classes: classes};
}

async function getChordHists() {
  const features = await getBeatwiseChords(SONGS, VERSIONS);
  const chords = features.map(s => s.map(v => v.map(p => p[1])));
  const allChords = _.uniqBy(_.flatten(_.flatten(chords)), c => JSON.stringify(c));
  //console.log('chord vocab', JSON.stringify(allChords))
  return chords.map(s => s.map(v => toFrequencyHistogram(v, allChords)));
}
