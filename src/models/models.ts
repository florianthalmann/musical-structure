import * as fs from 'fs';
import { execute } from '../files/util';

export enum MODELS {
  PROFILE = "ProfileHMM", //global alignment
  FLANKED = "FlankedProfileHMM" //local alignment
}

export async function hmmAlign(filebase: string, iterations = 10,
    model=MODELS.FLANKED, edgeInertia=0.8, distInertia=0.8, matchMatch=0.999,
    deleteInsert=0.01, flankProb=undefined) {
  const filename = "-msa-"+model+"-"+iterations+"-"+edgeInertia
    +"-"+distInertia+"-"+matchMatch+"-"+deleteInsert
    +"-"+(flankProb!=null?flankProb:"None")+".json";//backwards compatible...
  if (!fs.existsSync(filebase+filename))
    await execute('python src/models/multi_alignment.py "'+filebase+'" '
      +[filename, iterations, model, edgeInertia, distInertia, matchMatch,
        deleteInsert, flankProb].join(' '), true);
    return filebase+filename;
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