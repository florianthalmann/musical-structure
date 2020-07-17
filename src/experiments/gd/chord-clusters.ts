import * as _ from 'lodash';
import * as KNN from 'ml-knn';
import { agnes } from 'ml-hclust';
import { QUANT_FUNCS as QF } from 'siafun';
import { FEATURES } from '../../files/feature-extractor';
import { mapSeries } from '../../files/util';
import { getMode } from '../../analysis/util';
import { getTunedSongs, getTunedAudioFiles, getPoints, toHistogram } from './util';

const SONGS = getTunedSongs();
const VERSIONS = 100//Infinity;
const HCLUST_CUT = 5000;

classifyWithHClust();

async function classifyWithKNN() {
  const hists = await getChordHists();
  const data = _.flatten(hists);
  const classes = _.flatten(hists.map((s, i) => s.map(_v => i)));
  const predictions = <number[]>new KNN(data, classes).predict(data);
  printProbabilities(classes, predictions);
}

async function classifyWithHClust() {
  console.log('preparing data');
  const hists = await getChordHists();
  const data = _.flatten(hists);
  const classes = _.flatten(hists.map((s, i) => s.map(_v => i)));
  console.log('clustering')
  const tree = agnes(data, {method: 'ward'});
  const clusters = tree.group(15).children.map(c => c.indices());
  //const clusters = tree.cut(HCLUST_CUT).map(c => c.indices());
  console.log('count', clusters.length);
  console.log('avg', _.mean(clusters.map(c => c.length)));
  console.log('sizes', JSON.stringify(clusters.map(c => c.length)));
  const memberClasses = clusters.map(c => _.reverse(_.sortBy(
    _.toPairs(_.groupBy(c.map(i => classes[i]))), p => p[1].length)));
  const mainMembers = memberClasses.map(c =>
    c.filter(p => p[1].length > 0.2*c.length).map(p => parseInt(p[0])))
  console.log('members', JSON.stringify(mainMembers));
  const clusterClasses = clusters.map(c => getMode(c.map(i => classes[i])));
  const predictions = _.range(0, data.length).map(i =>
    clusterClasses[clusters.findIndex(c => _.includes(c, i))]);
  console.log(JSON.stringify(predictions));
  printProbabilities(classes, predictions);
}

function printProbabilities(classes: number[], predictions: number[]) {
  const grouped = SONGS.map((_s,i) =>
    predictions.filter((_p,j) => classes[j] == i));
  const probs = grouped.map((g,i) => g.filter(c => c == i).length/g.length);
  SONGS.forEach((s,i) => console.log(s, probs[i]));//, grouped[i].length));
  console.log(_.mean(probs));
}

async function getChordHists() {
  const audio = SONGS.map(s => getTunedAudioFiles(s, VERSIONS));
  const features: number[][][][][] = await mapSeries(audio, a => getPoints(a, {
    selectedFeatures: [FEATURES.MADMOM_BEATS, FEATURES.GO_CHORDS],
    quantizerFunctions: [QF.ORDER(), QF.IDENTITY()]
  }));
  const chords = features.map(s => s.map(v => v.map(p => p[1])));
  const allChords = _.uniqBy(_.flatten(_.flatten(chords)), c => JSON.stringify(c));
  //console.log('chord vocab', JSON.stringify(allChords))
  return chords.map(s => s.map(v => toHistogram(v, allChords)));
}
