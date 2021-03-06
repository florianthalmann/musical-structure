import * as fs from 'fs';
import * as _ from 'lodash';
import { getCosiatecOptionsString, getCosiatecIndexOccurrences, HEURISTICS,
  OpsiatecOptions } from 'siafun';
import { FeatureExtractor } from './files/feature-extractor';
import { FeatureLoader } from './files/feature-loader';
import { Annotation, getAnnotations } from './files/salami-parser';
import { mapSeries, printPatterns, cartesianProduct, updateStatus } from './files/util';
import { mapToTimegrid, normalize } from './analysis/pattern-analysis';
import { getOptionsWithCaching, getJohanBarsOptions, FeatureOptions,
  getChromaBeatsOptions, getVariations } from './files/options';
import { evaluate } from './eval';

const SALAMI = '/Users/flo/Projects/Code/FAST/grateful-dead/structure/SALAMI/';
const SALAMI_AUDIO = SALAMI+'lma-audio/';
const SALAMI_ANNOTATIONS = SALAMI+'salami-data-public/annotations/';
const SALAMI_RESULTS = 'results/salami/'//'/Volumes/FastSSD/salami/';
const SALAMI_FEATURES = 'data/salami_features';


/*//NEXT: chroma3bars and chroma4bars with new heuristics!!!!
export async function dayJob() {
  const options = getJohanBarsOptions(SALAMI_RESULTS, HEURISTICS.COVERAGE);
  options.cacheDir = SALAMI_RESULTS+'johanbars/'
  const variations = getVariations([3]);
  const startTime = Date.now()
  await runBatchSalami(options, variations, [], 0);
  console.log("DURATION", (Date.now()-startTime)/1000, "secs")
}

export function nightJob() {
  const options = getChromaBeatsOptions(4, SALAMI_RESULTS);
  const variations = getVariations([7, 15]);
  runBatchSalami(options, variations, [], 700);
}

export async function runBatchSalami(basis: OpsiatecOptions, variations: [string, any[]][], exclude: number[], maxLength?: number) {
  await mapSeries(cartesianProduct(variations.map(v => v[1])), async combo => {
    const currentOptions = Object.assign({}, basis);
    combo.forEach((c: any, i: number) => currentOptions[variations[i][0]] = c);
    const evalFile = basis.cacheDir + getCosiatecOptionsString(currentOptions)
      + (currentOptions.numPatterns != null ? '_'+currentOptions.numPatterns : '')
      + '.json';
    console.log('working on config', evalFile);
    if (!fs.existsSync(evalFile)) {
      await runSalami(currentOptions, evalFile, exclude, maxLength);
    }
  });

}

async function runSalami(options: FeatureOptions, evalFile: string, exclude: number[], maxLength?: number) {
  console.log('gathering files and parsing annotations');
  //gather available files and annotations
  let files = fs.readdirSync(SALAMI_AUDIO).filter(f => f.indexOf(".mp3") > 0)
    .map(f => parseInt(f.slice(0, f.indexOf(".mp3"))));
  files = files.filter(f => exclude.indexOf(f) < 0);
  
  const groundtruth = new Map<number, Annotation[]>();
  files.forEach(f => groundtruth.set(f, getAnnotations(SALAMI_ANNOTATIONS+f+'/')));
  //forget files with empty annotations and sort
  files = files.filter(f => groundtruth.get(f));
  files.sort((a,b) => a-b);
  
  const result = {};
  await mapSeries(files, async f =>
    result[f] = await evaluateSalamiFile(f, groundtruth.get(f), options, maxLength));
  console.log(); //TODO deal with status update properly
  fs.writeFileSync(evalFile, JSON.stringify(result));
}

async function evaluateSalamiFile(filename: number, groundtruth: Annotation[], options: FeatureOptions, maxLength = 0) {
  updateStatus('  working on SALAMI file ' + filename);
  
  //if (options.loggingLevel >= 0) console.log('    extracting and parsing features', filename);
  const audio = SALAMI_AUDIO+filename+'.mp3';
  const features = await new FeatureExtractor(SALAMI_FEATURES)
    .getFeatureFiles(audio, options.selectedFeatures);
  const featureLoader = new FeatureLoader(SALAMI_FEATURES);
  
  /*const timegrid = featureLoader
    .getVampValues(features.segmentations[0], features.segConditions[0])
    .map(v => v.time);
  
  //if (options.loggingLevel >= 0) console.log('    mapping annotations to timegrid', filename);
  //map ground patterns to timegrid
  groundtruth.forEach(ps =>
    ps.patterns = normalize(mapToTimegrid(ps.times, ps.patterns, timegrid, true)));
  
  //if (options.loggingLevel >= 0) console.log('    inferring structure', filename);
  const points = featureLoader.getPointsFromAudio(audio, options);
  
  if (!maxLength || points.length < maxLength) {
    const result = getCosiatecIndexOccurrences(points, getOptionsWithCaching(audio, options));
    const occurrences = result.occurrences;
    
    //if (options.loggingLevel >= 0) console.log('    evaluating', filename);
    const evals = {};
    evals["numpoints"] = points.length;
    evals["numcosiatec"] = occurrences.length;
    evals["numoptimized"] = result.numOptimizedPatterns;
    evals["numsiatec"] = result.numSiatecPatterns;
    groundtruth.forEach((g,i) => {
      evals[i] = {};
      evals[i]["precision"] = evaluate(occurrences, g.patterns);
      evals[i]["accuracy"] = evaluate(g.patterns, occurrences);
    });
    
    /*if (options.loggingLevel > 1) {
      groundtruth.map(p => p.patterns).concat([occurrences]).forEach(p => {
        console.log('\n')
        printPatterns(_.cloneDeep(p));
        //printPatternSegments(_.cloneDeep(p));
      });
      console.log(evals);
    }*
    
    return evals;
  }*
}*/