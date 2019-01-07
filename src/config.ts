export var PORT = '4199';
export var SERVER_PATH = 'http://localhost:' + PORT + '/';
import { QUANT_FUNCS, OPTIMIZATION, HEURISTICS } from 'siafun';
import * as math from 'mathjs';

export const FEATURES_DIR = 'features/';
export const RESULTS_DIR = 'results/';

export interface FeatureConfig {
  name: string,
  plugin: string,
  subset?: string,
  isSegmentation: boolean,
  selected: boolean
}

export const OPTIONS2 = {
  iterative: true,
  similarityThreshold: .99,
  minSegmentLength: 5, //stop when segment length below this
  maxThreshold: 10, //stop when max value below this
  endThreshold: 0,
  onlyDiagonals: true,
  patternIndices: ""
};

export const OPTIONS = {
  quantizerFunctions: [QUANT_FUNCS.SORTED_SUMMARIZE(3), QUANT_FUNCS.CONSTANT(0), QUANT_FUNCS.ORDER()],
  //heuristic: dymoCore.HEURISTICS.COVERAGE,
  selectionHeuristic: (pattern, vectors, occurrences, allPoints) => {
    var dim = 3;//pattern[0].length;
    //var gaps = getPointsInBoundingBox(pattern, allPoints).length - pattern.length;
    //var result = pattern.length / Math.pow(1+gaps, 1/dim);

    //var result = pattern.length * Math.sqrt(math.mean(vectors.map(v => math.norm(v)))) // * Math.sqrt(occurrences.length);

    var norms = vectors.map(v => Math.sqrt(math.sum(v.map(p => Math.pow(p,2)))));//vectors.map(v => math.norm(v));
    var avgNorm = Math.sqrt(math.mean(norms))
    /*var result = 0;
    if (math.mean(norms) > 5) {//pattern.length > 10) {
      result = pattern.length * Math.sqrt(Math.log(occurrences.length) * Math.sqrt(math.mean(norms)));
    }*/

    var patternDuration = math.norm(math.subtract(pattern[pattern.length-1], pattern[0]));
    //var result = pattern.length // / Math.pow(1+gaps, 1/dim) * Math.sqrt(math.mean(norms))
    //TODO BEST var result = pattern.length > 1 ? pattern.length * Math.pow(avgNorm / patternDuration, 1/3) : 0;
    var result = pattern.length > 3 ? pattern.length * avgNorm / Math.sqrt(patternDuration) : 0;

    return result;
  },
  overlapping: true,
  optimizationMethod: OPTIMIZATION.NONE,
  optimizationHeuristic: (pattern, vectors, occurrences, allPoints) => {
    var dim = 4;
    var gaps = getPointsInBoundingBox(pattern, allPoints).length - pattern.length;
    return pattern.length // Math.pow(1+gaps, 1/dim);
  },
  optimizationDimension: 2,
  //patternIndices: patternIndices
}

function getPointsInBoundingBox(pattern, allPoints) {
  var maxes = math.max(pattern, 0);
  var mins = math.min(pattern, 0);
  return allPoints.filter(p => p.every((e,i) => maxes[i] - mins[i] == 0 || (mins[i] <= e && e <= maxes[i])));
}

export const AVAILABLE_FEATURES: FeatureConfig[] = [
  {name:'sections', plugin:'vamp:qm-vamp-plugins:qm-segmenter:segmentation', isSegmentation: true, selected:false},
  {name:'bars', plugin:'vamp:qm-vamp-plugins:qm-barbeattracker:beats', isSegmentation: true, subset:'1', selected:true},
  {name:'beats', plugin:'vamp:qm-vamp-plugins:qm-barbeattracker:beats', isSegmentation: true, selected:false},
  {name:'onsets', plugin:'vamp:qm-vamp-plugins:qm-onsetdetector:onsets', isSegmentation: true, selected:false},
  {name:'onsets2', plugin:'vamp:vamp-aubio:aubioonset:onsets', isSegmentation: true, selected:false},
  {name:'logcentroid', plugin:'vamp:vamp-example-plugins:spectralcentroid:logcentroid', isSegmentation: false, selected:false},
  {name:'melody', plugin:'vamp:mtg-melodia:melodia:melody', isSegmentation: false, selected:false},
  {name:'pitch', plugin:'vamp:vamp-aubio:aubiopitch:frequency', isSegmentation: false, selected:false},
  {name:'amplitude', plugin:'vamp:vamp-example-plugins:amplitudefollower:amplitude', isSegmentation: false, selected:false},
  {name:'energy', plugin:'vamp:bbc-vamp-plugins:bbc-energy:rmsenergy', isSegmentation: false, selected:false},
  {name:'intensity', plugin:'vamp:bbc-vamp-plugins:bbc-intensity:intensity', isSegmentation: false, selected:false},
  {name:'flux', plugin:'vamp:bbc-vamp-plugins:bbc-spectral-flux:spectral-flux', isSegmentation: false, selected:false},
  {name:'skewness', plugin:'vamp:bbc-vamp-plugins:bbc-speechmusic-segmenter:skewness', isSegmentation: false, selected:false},
  {name:'zero', plugin:'vamp:vamp-example-plugins:zerocrossing:counts', isSegmentation: false, selected:false},
  {name:'tonal', plugin:'vamp:qm-vamp-plugins:qm-tonalchange:tcfunction', isSegmentation: false, selected:false},
  {name:'onsetfreq', plugin:'vamp:bbc-vamp-plugins:bbc-rhythm:avg-onset-freq', isSegmentation: false, selected:false},
  {name:'keystrength', plugin:'vamp:qm-vamp-plugins:qm-keydetector:keystrength', isSegmentation: false, selected:false},
  {name:'tuning', plugin:'vamp:nnls-chroma:tuning:tuning', isSegmentation: false, selected:false},
  {name:'tempo', plugin:'vamp:vamp-example-plugins:fixedtempo:tempo', isSegmentation: false, selected:false},
  {name:'mfcc', plugin:'vamp:qm-vamp-plugins:qm-mfcc:coefficients', isSegmentation: false, selected:false},
  {name:'chroma', plugin:'vamp:qm-vamp-plugins:qm-chromagram:chromagram', isSegmentation: false, selected:true},
  {name:'chords', plugin:'vamp:nnls-chroma:chordino:simplechord', isSegmentation: false, selected:false}
];