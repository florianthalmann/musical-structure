import * as fs from 'fs';
import { execute } from '../files/util';

export enum MODELS {
  PROFILE = "ProfileHMM", //global alignment
  FLANKED = "FlankedProfileHMM" //local alignment
}

export interface MSAOptions {
  modelLength: MSA_LENGTH,
  iterations: number,
  edgeInertia: number,
  distInertia: number, 
  matchMatch: number,
  deleteInsert: number,
  flankProb?: number
}

export enum MSA_LENGTH {
  MEDIAN = "median",
  MEAN = "mean",
  MAX = "max",
  MIN = "min",
  THIRD_QUARTILE = "quantile0.75"
}

export const STD_MSA_OPTIONS: MSAOptions = {
  modelLength: MSA_LENGTH.MEDIAN,
  iterations: 1,
  edgeInertia: 0.8,
  distInertia: 0.8,
  matchMatch: 0.999,
  deleteInsert: 0.01,
  flankProb: undefined
}

export async function hmmAlign(pointsFile: string, outpath: string,
    options = STD_MSA_OPTIONS) {//undefined->non-flanked
  const outfile = outpath+getOutfilename(options);
  console.log(outfile)
  if (!fs.existsSync(outfile))
    await execute('python src/models/multi_alignment.py '+
      ['"'+pointsFile+'"', '"'+outfile+'"', options.iterations, getModel(options),
      options.modelLength, options.edgeInertia, options.distInertia, options.matchMatch,
      options.deleteInsert, options.flankProb].join(' '), true);
    return outfile;
}

function getOutfilename(options: MSAOptions) {
  return 'msa-'+getModel(options)+'-'+options.iterations
    +'-'+options.edgeInertia+'-'+options.distInertia+'-'+options.matchMatch
    +'-'+options.deleteInsert+'-'
    +(options.flankProb!=null?options.flankProb:'None')
    +(options.modelLength===MSA_LENGTH.MEDIAN?'':'-'+options.modelLength)+'.json';//backwards compatible...
}

export function getModel(options: MSAOptions) {
  return options.flankProb != null ? MODELS.FLANKED : MODELS.PROFILE;
}

export async function clustaloAlign(filebase: string) {
  if (!fs.existsSync(filebase+"-msa.json"))
    return execute('clustalo -i "'+filebase+'.fa" -o "'+filebase+'-msa.fa"', true);
}

export async function savePhylogeneticTree(filebase: string) {
  if (!fs.existsSync(filebase+"-msa.dnd"))
    return execute('clustalo -i "'+filebase+'.fa" --guidetree-out="'
      +filebase+'"-msa.dnd --full', true);
}

export async function saveDistanceMatrix(filebase: string) {
  if (!fs.existsSync(filebase+"-msa.mat"))
    return execute('clustalo -i "'+filebase+'.fa" --distmat-out="'
      +filebase+'"-msa.mat --full', true);
}