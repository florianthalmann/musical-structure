import * as fs from 'fs';
import { exec } from 'child_process';
import * as _ from 'lodash';
import { Fetcher, SuperDymoStore, uris } from 'dymo-core';

export function audioPathToDirName(audioPath: string) {
  return audioPath.slice(audioPath.lastIndexOf('/')+1).replace('.', '_');
}

export function execute(command: string, callback: Function) {
  let options = {}//{stdio: ['pipe', 'pipe', 'ignore']};
  exec(command, options, function(error, _stdout, stderr) {
    if (error) {
      console.log(stderr);
      if (callback) { callback(false); }
    } else {
      if (callback) { callback(true); }
    }
  });
}

export async function mapSeries<T,S>(array: T[], func: (arg: T, i: number) => Promise<S>): Promise<S[]> {
    let result = [];
    for (let i = 0; i < array.length; i++) {
      result.push(await func(array[i], i));
    }
    return result;
  }

export class NodeFetcher implements Fetcher {
  async fetchText(url: string) {
    //return fetch(url).then(r => r.text());
    return fs.readFileSync(url, "utf8");
  }
  async fetchJson(url: string) {
    //return fetch(url).then(r => r.json());
    return JSON.parse(fs.readFileSync(url, "utf8"));
  }
  async fetchArrayBuffer(url: string) {
    return fetch(url).then(r => r.arrayBuffer());
  }
}

export async function printDymo(store: SuperDymoStore, uri?: string) {
  uri = uri || (await store.findTopDymos())[0];
  return recursivePrintDymo(store, uri);
}

async function recursivePrintDymo(store: SuperDymoStore, uri: string, level = 0) {
  console.log(_.repeat('   ', level) + uri.replace(uris.CONTEXT_URI, ''));
  const parts = await store.findParts(uri);
  return mapSeries(parts, p => recursivePrintDymo(store, p, level+1));
}

export async function printDymoStructure(store: SuperDymoStore, uri?: string) {
  uri = uri || (await store.findTopDymos())[0];
  const structure = await recursiveGetDymoStructure(store, uri);
  structure.forEach(l => console.log(l));
}

async function recursiveGetDymoStructure(store: SuperDymoStore, uri?: string): Promise<string[]> {
  uri = uri || (await store.findTopDymos())[0];
  const parts = await store.findParts(uri);
  if (!parts || parts.length == 0) return ['|'];
  const partStruct = concatStringMatrices(...await Promise.all(parts.map(p =>
      recursiveGetDymoStructure(store, p))));
  return ['|' + _.repeat(' ', partStruct[0].length-1)].concat(partStruct);
}

function concatStringMatrices(...ms: string[][]) {
  const maxDepth = _.max(ms.map(m => m.length));
  //pad up to max depth
  ms.forEach(m => {
    const width = m[0].length;
    while (m.length < maxDepth) m.push(_.repeat(' ', width));
  });
  //concat row by row
  return ms[0].map((_,i) => ms.map(m => m[i]).join(''));
}

export function printPatterns(patterns: number[][][]) {
  patterns.forEach(p => {
    const patternString = _.times((_.max(_.flatten(p)))+1, _.constant(' '));
    const code = 97;
    p.forEach((o,i) =>
      o.forEach(k => patternString[k] = String.fromCharCode(code+i)));
    console.log(patternString.join(''));
  });
}

export function printPatternSegments(patterns: number[][][]) {
  patterns = trim(patterns);
  patterns.forEach(p => {
    const pstring = _.times((_.max(_.flatten(p)))+1, _.constant(' '));
    p.forEach(o => pstring[o[0]] = '|');
    p.forEach(o => _.range(o[0]+1, _.last(o)+1).forEach(k => pstring[k] = '-'));
    console.log(pstring.join(''));
  });
}

function trim(patterns: number[][][]) {
  return patterns.map(p => {
    p[0] = p[0].filter(i => i < p[1][0]);
    return p.map(o => o.slice(0, p[0].length));
  });
}

/*export function printSegments(segs: Segmentation[]) {
  segs.forEach(s => {
    const pstring = _.times((_.max(_.flatten(p)))+1, _.constant(' '));
    p.forEach(o => pstring[o[0]] = '|');
    p.forEach(o => _.range(o[0]+1, _.last(o)+1).forEach(k => pstring[k] = '-'));
    console.log(pstring.join(''));
  });
}*/