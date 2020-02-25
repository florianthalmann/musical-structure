import * as fs from 'fs';
import { execute } from '../files/util';

export async function hmmAlign(filebase: string, iterations = 50) {
  if (!fs.existsSync(filebase+"-msa.json"))
    return execute('python src/models/multi_alignment.py "'+filebase+'" '+iterations,
    true);
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