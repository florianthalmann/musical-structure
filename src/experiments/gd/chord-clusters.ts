import * as _ from 'lodash';
import * as KNN from 'ml-knn';
import { QUANT_FUNCS as QF } from 'siafun';
import { FEATURES } from '../../files/feature-extractor';
import { mapSeries } from '../../files/util';
import { getTunedSongs, getTunedAudioFiles, getPoints, toHistogram } from './util';

const SONGS = getTunedSongs();
const VERSIONS = 200;

classifyWithKNN();

async function classifyWithKNN() {
  const hists = await getChordHists();
  const dataset = _.flatten(hists);
  const classes = _.flatten(hists.map((s, i) => s.map(_v => i)));
  const predictions = <number[]>new KNN(dataset, classes).predict(dataset);
  const grouped = SONGS.map((_s,i) =>
    predictions.filter((_p,j) => classes[j] == i));
  const probs = grouped.map((g,i) => g.filter(c => c == i).length/g.length);
  SONGS.forEach((s,i) => console.log(s, probs[i]))
  console.log(_.mean(probs));
}

async function classifyWithKMeans() {

}

async function getChordHists() {
  const audio = SONGS.map(s => getTunedAudioFiles(s, VERSIONS));
  const features: number[][][][][] = await mapSeries(audio, a => getPoints(a, {
    selectedFeatures: [FEATURES.MADMOM_BEATS, FEATURES.GO_CHORDS],
    quantizerFunctions: [QF.ORDER(), QF.IDENTITY()]
  }));
  const chords = features.map(s => s.map(v => v.map(p => p[1])));
  const allChords = _.uniqBy(_.flatten(_.flatten(chords)), c => JSON.stringify(c));
  console.log('chord vocab', JSON.stringify(allChords))
  return chords.map(s => s.map(v => toHistogram(v, allChords)));
}
