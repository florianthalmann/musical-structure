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