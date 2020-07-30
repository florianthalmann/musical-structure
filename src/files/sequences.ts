import * as fs from 'fs';
import * as _ from 'lodash';
import { saveJsonFile, saveTextFile, loadJsonFile } from './file-manager';
import { pcSetToLabel } from './theory';
import { getMedian } from '../analysis/util';

interface MultinomialSequences {
  data: number[][],
  labels: string[]
}

interface RawSequences {
  data: number[][][]
}

export function loadSequences(path: string): number[][][] {
  let loaded = loadJsonFile(path);
  if (loaded.labels) {
    const sequences = <MultinomialSequences>loaded;
    const labelPoints = sequences.labels.map(l => _.flatten(<number[]>JSON.parse(l)));
    return sequences.data.map(s => s.map(p => labelPoints[p]));
  }
  return (<RawSequences>loaded).data;
}

export async function saveMultinomialSequences(points: any[][][], path: string, force?: boolean) {
  if (force || !fs.existsSync(path+'-points.json')) {
    saveJsonFile(path+'-points.json', await toMultinomialSequences(points));
  }
}

export async function getIndividualChordSequences(points: any[][][], path: string, force?: boolean) {
  if (force || !fs.existsSync(path+'-chords.json')) {
    const chords = points.map(ps => ps.map(p => pcSetToLabel(p.slice(1)[0])));
    console.log(JSON.stringify(chords.map(cs => cs.filter(c => c === "Dm").length)))
    const lengths = chords.map(cs => cs.length);
    const median = getMedian(lengths);
    const index = _.findIndex(lengths, l => l == median);
    console.log(JSON.stringify(chords[index].filter(c => c === "Dm").length));
    saveJsonFile(path+'-chords.json', chords);
  }
}

export async function saveFastaSequences(points: any[][][], path: string, force?: boolean) {
  if (force || !fs.existsSync(path+'.fa')) {
    const data = (await toMultinomialSequences(points)).data;//[16,25])).data;
    const fasta = _.flatten(data.map((d,i) => [">version"+i,
      d.map(p => String.fromCharCode(65+p)).join('')])).join("\n");
    saveTextFile(path+'.fa', fasta);
  }
}

async function toMultinomialSequences(points: any[][][], exclude?: number[]): Promise<MultinomialSequences> {
  /*points.forEach(p => console.log(JSON.stringify(
    _.reverse(_.sortBy(
      _.map(_.groupBy(p.map(s => JSON.stringify(s.slice(1)))), (v,k) => [k,v.length])
  , a => a[1])).slice(0,3))));*/
  points = exclude ? points.filter((_v,i) => !_.includes(exclude, i)) : points;
  const values = points.map(s => s.map(p => JSON.stringify(p.slice(1))));
  const distinct = _.uniq(_.flatten(values));
  const data = values.map(vs => vs.map(v => distinct.indexOf(v)));
  return {data: data, labels: distinct};
}

export async function saveRawSequences(points: any[][][], path: string, force?: boolean) {
  if (force || !fs.existsSync(path)) {
    const sequences = {data: points.map(s => s.map(p => p[1]).filter(p=>p))};
    saveJsonFile(path, sequences);
  }
}