import * as fs from 'fs';
import { DymoGenerator, DymoTemplates, DymoManager } from 'dymo-core';
import { IterativeSmithWatermanResult, QUANT_FUNCS } from 'siafun';
import { DymoStructureInducer } from './dymo-structure';
import { FileManager } from './file-manager';
import { FeatureExtractor } from './feature-extractor';
import { AVAILABLE_FEATURES, OPTIONS, FeatureConfig } from './config';
import { NodeFetcher, printDymo } from './util';

const SALAMI = '/Users/flo/Projects/Code/FAST/grateful-dead/structure/SALAMI/';
const FILE = '955';

const FILE_NAME = SALAMI+'lma-audio/'+FILE+'.mp3';
const ANNOTATION = SALAMI+'salami-data-public/annotations/'+FILE+'/textfile1.txt';

const fileManager = new FileManager();
const featureExtractor = new FeatureExtractor();
run();

async function run() {
  await featureExtractor.extractFeatures([FILE_NAME],
      AVAILABLE_FEATURES.filter(f => f.selected));
  await induceStructure(FILE_NAME);
  //await plot();
}

/*function plot(): Promise<any> {
  return new Promise(resolve => {
    execute('python '+ROOT+'../plot.py '+ROOT+DIRS.out, success => resolve());
  })
}*/

async function induceStructure(audioFile: string): Promise<any> {
  const generator = new DymoGenerator(false, null, new NodeFetcher());
  const featureFiles = await fileManager.getFeatureFiles(audioFile);
  const filtered = filterSelectedFeatures(featureFiles);
  const dymo = await DymoTemplates.createSingleSourceDymoFromFeatures(
    generator, audioFile, filtered.segs, filtered.segConditions, filtered.feats);
  //await printDymo(generator.getStore(), dymo)
  const QF = QUANT_FUNCS;
  OPTIONS["quantizerFunctions"] = [QF.CONSTANT(0), QF.CONSTANT(0), QF.ORDER(), QF.CONSTANT(0), QF.SORTED_SUMMARIZE(3)]//[QF.SORTED_SUMMARIZE(4), QF.CONSTANT(0), QF.ORDER()];
  //options.optimizationDimension: 5,
  //DymoStructureInducer.flattenStructure(generator.getCurrentTopDymo(), generator.getStore());
  await new DymoStructureInducer(generator.getStore()).addStructureToDymo(generator.getCurrentTopDymo(), OPTIONS);
  //await printDymo(generator.getStore(), dymo);
}

function postJson(path, json) {
  fileManager.saveOutFile(path, JSON.stringify(json, null, 2));
}

function filterSelectedFeatures(featureFiles: string[]) {
  const selected = AVAILABLE_FEATURES.filter(f => f.selected);
  const segs = selected.filter(f => f.isSegmentation);
  const segFiles = getFiles(segs, featureFiles);
  const segConditions = segFiles.map((_,i) => segs[i].subset);
  const others = getFiles(selected.filter(f => !f.isSegmentation), featureFiles);
  return {
    segs:segFiles.filter(s=>s),
    segConditions:segConditions.filter((_,i)=>segFiles[i]),
    feats:others.filter(f=>f),
  };
}

function getFiles(features: FeatureConfig[], files: string[]) {
  return features.map(f => files.filter(u => u.indexOf(f.name) >= 0)[0]);
}
