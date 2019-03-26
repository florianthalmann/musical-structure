export var PORT = '4199';
export var SERVER_PATH = 'http://localhost:' + PORT + '/';
import { QUANT_FUNCS } from 'siafun';
import * as math from 'mathjs';

export const FEATURES_DIR = 'features/';
export const RESULTS_DIR = 'results/';

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
  //optimizationMethod: OPTIMIZATION.NONE,
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