import * as _ from 'lodash';
import { DirectedGraph, Node } from '../graphs/graph-theory';
import { SegmentNode } from './types';
import { loadJsonFile } from '../files/file-manager';
import { getMode, allIndexesOf } from './util';
import { pcSetToLabel } from '../files/theory';
import { indicesOfNMax } from 'arrayutils';

export function inferStructureFromTimeline(filebase: string) {
  const timeline: SegmentNode[][] = loadJsonFile(filebase+'-output.json').timeline;
  const matrix: number[][] = loadJsonFile(filebase+'-matrix.json');
  const boundaries = getSectionBoundariesFromMSA(timeline);
  const sections = getSectionGroupsFromTimelineMatrix(matrix);
  const hierarchy = inferHierarchyFromSectionGroups(sections);
  const boundaries2 = _.sortBy(_.flatten(sections.map(g => g.map(s => s[0]))));
  console.log(JSON.stringify(boundaries2));
  
  //TRY HIERARCHICAL GROUPING..... get most sim and remove all corresponding from matrix....
  
  //see if sections can be completed if just a few missing in beginning or end....
  
  console.log(JSON.stringify(sections.map(t => t[0].map(c =>
    //timeline[c]))));
    pcSetToLabel(getMode(timeline[c].map(n => n.point.slice(1))))))));
  return sections.map(type => _.flatten(_.flatten(type).map(s => timeline[s])));
}

function inferHierarchyFromSectionGroups(sections: number[][][]) {
  //iteratively/recursively
  //find all commonly occurring combinations
  const typeSequence = _.sortBy(_.flatten((sections)), s => _.min(s)).map(s =>
    _.findIndex(sections, t => _.includes(t, s)));
  
  console.log(JSON.stringify(typeSequence));
  
  //generate new types by merging into binary tree
  const newTypes = new Map<number, number[]>();
  let currentSequence = _.clone(typeSequence);
  let currentIndex = _.max(typeSequence)+1;
  let currentPair = getMostCommonPair(currentSequence);
  
  while (currentPair != null) {
    currentSequence = currentSequence.reduce<number[]>((s,t) =>
      s.length > 0 && _.isEqual([_.last(s), t], currentPair) ?
      _.concat(_.initial(s), currentIndex)
      : _.concat(s, t), []);
    const otherPreviousTypes = _.difference([...newTypes.values()],
      [newTypes.get(currentPair[0]), newTypes.get(currentPair[1])]);
    //console.log(JSON.stringify(currentSequence));
    /*console.log(newTypes.get(currentPair[0]), newTypes.get(currentPair[1]),
      currentPair.every(u => !_.includes(currentSequence, u)),
        currentPair.every(u => !_.includes(_.flatten(otherPreviousTypes), u)))*/
    //amend type if possible
    if ((newTypes.get(currentPair[0]) || newTypes.get(currentPair[1]))
        && currentPair.every(u => !_.includes(currentSequence, u)
          && !_.includes(_.flatten(otherPreviousTypes), u))) {
      if (newTypes.get(currentPair[0]) && newTypes.get(currentPair[1])) {
        newTypes.set(currentIndex,
          _.concat(newTypes.get(currentPair[0]), newTypes.get(currentPair[1])));
        newTypes.delete(currentPair[0]);
        newTypes.delete(currentPair[1]);
        console.log(currentIndex, ': concat', JSON.stringify(newTypes.get(currentIndex)));
        //currentSequence = currentSequence.map(s => s === currentIndex ? currentPair[0] : s);
      } else if (newTypes.get(currentPair[0])) {
        newTypes.set(currentIndex, _.concat(newTypes.get(currentPair[0]), currentPair[1]));
        newTypes.delete(currentPair[0]);
        console.log(currentIndex, ': push', JSON.stringify(newTypes.get(currentIndex)));
        //currentSequence = currentSequence.map(s => s === currentIndex ? currentPair[0] : s);
      } else {
        newTypes.set(currentIndex, _.concat([currentPair[1]], newTypes.get(currentPair[0])));
        newTypes.delete(currentPair[1]);
        console.log(currentIndex, ': unshift', JSON.stringify(newTypes.get(currentIndex)));
        //currentSequence = currentSequence.map(s => s === currentIndex ? currentPair[1] : s);
      }
    //else add a new type
    } else {
      newTypes.set(currentIndex, currentPair);
      console.log(currentIndex, ':', JSON.stringify(newTypes.get(currentIndex)));
    }
    console.log(JSON.stringify(currentSequence));
    currentPair = getMostCommonPair(currentSequence);
    currentIndex++;
  }
  
  const hierarchy: any[] = _.clone(currentSequence);
  console.log(_.reverse(_.sortBy([...newTypes.keys()])))
  _.reverse(_.sortBy([...newTypes.keys()])).forEach(t =>
    currentSequence = replaceInTree(currentSequence, t, newTypes.get(t)));
  
  console.log(JSON.stringify(currentSequence));
  return hierarchy;
}

function replaceInTree(tree: any[], pattern: any, replacement: any) {
  if (!tree.length) return tree;
  return tree.map(n => _.isEqual(n, pattern) ? replacement
    : replaceInTree(n, pattern, replacement));
}

function getMostCommonPair<T>(array: T[]): [T, T] {
  let pairs = array.map<[T, T]>((a,i) =>
    i > 0 ? [array[i-1], a] : null).filter(a => a).map(p => JSON.stringify(p));
  const uniq = _.uniq(pairs);
  const indexes = uniq.map(u => allIndexesOf(pairs, u));
  const disjunct = indexes.map(u =>
    u.reduce<number[]>((ii,i) => i == _.last(ii)+1 ? ii : _.concat(ii, i), []));
  const freqs = disjunct.map(d => d.length);
  console.log(JSON.stringify(_.reverse(_.sortBy(_.zip(uniq, freqs), p => p[1])).slice(0,5)))
  const maxFreq = _.max(freqs);
  if (maxFreq > 1)
    return JSON.parse(uniq[freqs.indexOf(maxFreq)]);
}

function getSectionBoundariesFromMSA(timeline: SegmentNode[][]) {
  const maxVersion = _.max(_.flatten(timeline).map(n => n.version));
  const diffs = _.zip(..._.range(0, maxVersion+1).map(v => {
    const nodes = timeline.map(t => t.find(n => n.version == v));
    return nodes.map((n,i) => {
      const nextIndex = nodes.slice(i+1).findIndex(m => m != null) + i+1;
      return nextIndex && n ? (nodes[nextIndex].time - n.time) - (nextIndex - i) : 0;
    });
  }));
  const inserts = diffs.map(d => _.sum(d.map(d => d > 0 ? 1 : 0)));
  const deletes = diffs.map(d => _.sum(d.map(d => d < 0 ? 1 : 0)));
  
  const boundaries = inserts.map((g,i) => g > 5 ? i+1 : null).filter(g => g != null);
  const boundaries2 = deletes.map((g,i) => g > 5 ? i+1 : null).filter(g => g != null);
  console.log(JSON.stringify(inserts));
  console.log(JSON.stringify(deletes));
  console.log(JSON.stringify(boundaries));
  console.log(JSON.stringify(boundaries2));
  return boundaries;
}

function getSectionGroupsFromTimelineMatrix(matrix: number[][],
    threshold = .1, minDist = 0, maxLevels = 2) {
  //preprocess matrix
  const max = _.max(_.flatten(matrix));
  matrix = matrix.map(r => r.map(c => c >= threshold*max ? c : 0));
  const levels = getSegmentation(matrix, minDist, maxLevels);
  console.log(JSON.stringify(levels));
  return levels;
}

function getSegmentation(matrix: number[][], minDist: number, numLevels: number) {
  //const connections = getIterativeMostConnected(matrix, minDist);
  const connections = _.zip(...getNMostConnected(matrix, minDist, numLevels));
  return getSectionsViaGraph(connections.slice(0, numLevels));
}

function getIndependentSegmentationLevels(matrix: number[][], minDist: number, maxLevels: number) {
  //build levels by iteratively getting mutually most similar segment for each segment
  const connections = getIterativeMostConnected(matrix, minDist);
  const levels = connections.slice(0, maxLevels)
    .map(c => getSectionsViaGraph([c]));
  levels.forEach(l => console.log(JSON.stringify(l)));
  return levels;
}

function getSectionsViaGraph(connectionLevels: number[][]) {
  //make a graph with timepoint nodes connected by similarity
  const timelineNodes = connectionLevels[0].map((_,i) => ({id:i.toString()}));
  //create graph with egdes for all given connection levels
  const currentGraph = new DirectedGraph<Node>(timelineNodes);
  connectionLevels.forEach(l => l.forEach((c,i) => {
    if (c) currentGraph.addEdge(timelineNodes[i], timelineNodes[c]);
  }));
  //get connected components (corresponding sections)
  return getSectionsFromGraph(currentGraph);
}

//returns corresponding sections grouped by type
function getSectionsFromGraph(graph: DirectedGraph<Node>) {
  //get connected components (corresponding sections)
  const components = _.sortBy(graph.getConnectedComponents()
    .map(c => c.map(n => parseInt(n.id))), c => _.min(c));
  console.log(JSON.stringify(components));
  //group successive components
  const grouped = components.reduce<number[][][]>((g,c) => {
    const last = _.last(_.last(g));
    if (last && last.length == c.length && last.every(i => _.includes(c, i+1)))
      _.last(g).push(c);
    else g.push([c]);
    return g;
  }, []);
  console.log(JSON.stringify(grouped));
  //create sections
  let sections = grouped.map(t => _.sortBy(_.zip(...t), c => _.min(c)));
  console.log(JSON.stringify(sections));
  //merge adjacents within type? but only short ones????
  sections = _.flatten(sections.map(t => mergeShortSectionsAndSplitIntoTypes(t)));
  sections = _.sortBy(sections, s => _.min(_.flatten(s)));
  //group sections that always occur successively!!!
  sections = groupAlwaysAdjacent(sections);
  return sections;
}

//need to be sorted already...
function mergeShortSectionsAndSplitIntoTypes(sections: number[][]) {
  if (sections.every(s => s.length == 1)) {
    sections = sections.reduce<number[][]>((r,s,i) => {
      i > 0 && s[0] == sections[i-1][0]+1 ? _.last(r).push(s[0]) : r.push(s);
      return r;
    }, []);
  }
  //group by length
  return _.values(_.groupBy(sections, s => s.length));
}

function groupAlwaysAdjacent(sectionTypes: number[][][]) {
  return sectionTypes.reduce<number[][][]>((nt,t,i) => {
    if (i > 0) {
      const concat = concatIfPossible(_.last(nt), t);
      if (concat) nt[nt.length-1] = concat;
      else nt.push(t);
    } else nt.push(t);
    return nt;
  }, []);
}

function concatIfPossible(sections1: number[][], sections2: number[][]) {
  if (sections1.length == sections2.length) {
    const matches = sections2.map(s => sections1.find(r => s[0] == _.last(r)+1));
    if (matches.every(m => m != null)) {
      return sections1.map(r => _.concat(r, sections2[matches.indexOf(r)]));
    }
  }
}

function getIterativeMostConnected(matrix: number[][], minDist = 0) {
  const connectionLevels: number[][] = [];
  let currentConns = getMostConnected(matrix, minDist);
  while (currentConns.filter(c => c != null).length > 0) {
    connectionLevels.push(currentConns);
    currentConns.forEach((c,i) => { if (c) matrix[i][c] = matrix[c][i] = 0 });
    currentConns = getMostConnected(matrix, minDist);
  }
  return connectionLevels;
}

function intersectSections(s1: number[][][], s2: number[][][]) {
  const types2 = toTypes(s2);
  return _.flatten(s1.map(s => {
    const types =  _.zip(...s).map(i => JSON.stringify(i.map(j => types2[j])));
    const divs = s[0].reduce<number[]>((ds,_c,i) =>
      i == 0 || types[i] === types[i-1] ? ds : _.concat(ds, i), []);
    return _.zip(...s.map(t => splitAt(t, divs)));
  }));
}

function splitAt<T>(array: T[], indexes: number[]) {
  return array.reduce<T[][]>((s,a,i) => {
    i == 0 || _.includes(indexes, i) ? s.push([a]) : _.last(s).push(a);
    return s;
  }, []);
}

function toTypes(sections: number[][][]) {
  const flat = sections.map(s => _.flatten(s));
  return _.range(_.max(_.flatten(flat)))
    .map(i => _.findIndex(flat.map(f => _.includes(f, i))));
}

/** minDist: min distance from diagonal */
function getNMostConnected(matrix: number[][], minDist: number, n = 1) {
  const upper = matrix.map((r,i) => r.map((c,j) => j > i+minDist ? c : 0));
  const lower = matrix.map((r,i) => r.map((c,j) => j+minDist < i ? c : 0));
  const laterConns = upper.map(r => _.max(r) > 0 ? indicesOfNMax(r, n) : []);
  const earlierConns = lower.map(r => _.max(r) > 0 ? indicesOfNMax(r, n) : []);
  return laterConns.map((c,i) => c.filter(j => _.includes(earlierConns[j], i)));
}

/** minDist: min distance from diagonal */
function getMostConnected(matrix: number[][], minDist: number) {
  const upper = matrix.map((r,i) => r.map((c,j) => j > i+minDist ? c : 0));
  const lower = matrix.map((r,i) => r.map((c,j) => j+minDist < i ? c : 0));
  const laterConns = upper.map(r => _.max(r) > 0 ? r.indexOf(_.max(r)) : -1);
  const earlierConns = lower.map(r => _.max(r) > 0 ? r.indexOf(_.max(r)) : -1);
  return laterConns.map((u,i) => earlierConns[u] === i ? u : null);
}