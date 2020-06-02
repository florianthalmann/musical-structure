import * as _ from 'lodash';
import { getSmithWaterman, QUANT_FUNCS as QF } from 'siafun';
import { DirectedGraph, Node } from '../graphs/graph-theory';
import { GraphPartition } from '../graphs/graph-partition';
import { SegmentNode } from './types';
import { getMode, allIndexesOf } from './util';
import { pcSetToLabel } from '../files/theory';

export enum METHOD {
  MSA_HIERARCHY,
  MSA_SW_HIERARCHY,
  MSA_GRAPH_HIERARCHY
}

export function inferStructureFromTimeline(timeline: GraphPartition<SegmentNode>,
    method: METHOD = METHOD.MSA_GRAPH_HIERARCHY) {
  switch(method) {
    case METHOD.MSA_HIERARCHY:
      return inferStructureFromTimelineSimple(timeline);
    case METHOD.MSA_SW_HIERARCHY:
      return inferStructureFromTimelineWithSW(timeline);
    case METHOD.MSA_GRAPH_HIERARCHY:
      return inferStructureFromTimelineWithAlignmentGraph(timeline);
  }
}

export function inferStructureFromTimelineSimple(timeline: GraphPartition<SegmentNode>) {
  const types = getTypesFromTimelineModes(timeline.getPartitions());
  const hierarchy = inferHierarchyFromSectionTypes(types, false, false);
  console.log(JSON.stringify(hierarchy));
  
  //TODO: refactor return values for all methods.... use hierarchies...
  const sections = _.toPairs(_.groupBy(types.map((t,i) => [t,i]), 0)).map(p => p[1]);
  return sections.map(type => _.flatten(_.flatten(type).map(s => timeline[s])));
}

function getTypesFromTimelineModes(timeline: SegmentNode[][]) {
  const chords = timeline.map(t => pcSetToLabel(getMode(t.map(n => n.point.slice(1)))));
  console.log(JSON.stringify(chords));
  const uniq = _.uniq(chords);
  const types = chords.map(c => uniq.indexOf(c));
  console.log(JSON.stringify(types));
  return types;
}

export function inferStructureFromTimelineWithSW(timeline: GraphPartition<SegmentNode>) {
  const types = getTypesFromTimelineModes(timeline.getPartitions());
  //try self-alignment
  const sw = getSmithWaterman(types.map((t,i) => [i,t]), {
    //cacheDir: cacheDir,
    quantizerFunctions: [QF.ORDER(), QF.IDENTITY()],
    maxIterations: 1,//true,
    fillGaps: true, //turn off for similarity graphs!!
    //similarityThreshold: .95,
    minSegmentLength: 5, //only take segments longer than this
    maxThreshold: 10, //stop when max value below this
    //endThreshold: 0,
    onlyDiagonals: true,
    nLongest: 5,
    maxGapSize: 0,
    //maxGaps: 0,
    minDistance: 2
  });
  //sw.patterns.map(p => console.log(JSON.stringify(p.occurrences.map(o => o.map(p => p[1])))));
  const sections = getSectionGroupsFromTimelineMatrix(sw.segmentMatrix, 2);
  const hierarchy = inferHierarchyFromSectionGroups(sections, false);
  console.log(JSON.stringify(hierarchy));
  const repl = h => h.reduce((r,s) => Array.isArray(s) ? _.concat(r, [repl(s)])
    : _.concat(r, sections[s][0].map(_i => s)), []);
  console.log(JSON.stringify(repl(hierarchy)));
  return sections.map(type => _.flatten(_.flatten(type).map(s => timeline[s])));
}

function getAtemporalPoints(nodes: SegmentNode[]) {
  return nodes.map(n => n.point.slice(1));
}

export function inferStructureFromTimelineWithAlignmentGraph(
    timeline: GraphPartition<SegmentNode>, minSegSizeProp = 0.1) {
  //console.log(JSON.stringify(timeline.map(t => t.length)));
  const fullTimelineLabels = timeline.getPartitions().map(t =>
    pcSetToLabel(getMode(getAtemporalPoints(t))));
  console.log("fulltimeline", JSON.stringify(fullTimelineLabels));
  //remove small partitions
  timeline.removeSmallPartitions(minSegSizeProp*timeline.getMaxPartitionSize());
  const timelineLabels = timeline.getPartitions().map(t =>
    pcSetToLabel(getMode(getAtemporalPoints(t))));
  console.log("timeline", JSON.stringify(timelineLabels));
  const boundaries = getSectionBoundariesFromMSA(timeline.getPartitions());
  //sequences of section indexes grouped by types
  const sectionsByTypes = getSectionGroupsFromTimelineMatrix(
    timeline.getConnectionMatrix(), 10);
  const sectionTypeLabels = sectionsByTypes.map(s => _.zip(...s).map(is =>
    pcSetToLabel(getMode(_.flatten(is.map(i => getAtemporalPoints(timeline[i])))))));
  //console.log(JSON.stringify(sectionTypeLabels));
  
  const hierarchy = inferHierarchyFromSectionGroups(sectionsByTypes, true);
  console.log("hierarchy", JSON.stringify(hierarchy))
  
  let sections = hierarchy.map(h => Array.isArray(h) ?
    h.map(s => Array.isArray(s) ? _.flattenDeep(s) : s) : [h]);
  sections = _.flatten(sections.map(s => Array.isArray(s[0]) ? s : [s]));
  sections = sections.map(s => Array.isArray(s) ? s : [s]);
  const labeledSections = sections.map(s => 
    _.flatten(s.map(t => sectionTypeLabels[t])));
  console.log("sections", JSON.stringify(labeledSections))
  
  const repl = h => h.reduce((r,s) => Array.isArray(s) ? _.concat(r, [repl(s)])
    : _.concat(r, sectionTypeLabels[s]), []);
  //console.log(JSON.stringify(sections.length))
  const hierarchyLabels = repl(hierarchy);
  console.log("hierarchy", JSON.stringify(hierarchyLabels))
  
  
  /*const boundaries2 = _.sortBy(_.flatten(sections.map(g => g.map(s => s[0]))));
  console.log(JSON.stringify(boundaries2));*/
  const boundaries2 = labeledSections.map(s => s.length);
  //console.log(JSON.stringify(boundaries2));
  
  //see if sections can be completed if just a few missing in beginning or end....
  
  const nodesByTypes = sectionsByTypes.map(type => _.flatten(_.flatten(type).map(s => timeline[s])));
  
  const result = {
    fullTimeline: fullTimelineLabels,
    timeline: timelineLabels,
    hierarchy: hierarchyLabels,
    sections: labeledSections
  }
  
  return nodesByTypes;
}

function inferHierarchyFromSectionGroups(sections: number[][][], unequalPairsOnly: boolean) {
  //iteratively/recursively
  //find all commonly occurring combinations
  const typeSequence = _.sortBy(_.flatten((sections)), s => _.min(s)).map(s =>
    _.findIndex(sections, t => _.includes(t, s)));
  //console.log(JSON.stringify(typeSequence));
  
  return inferHierarchyFromSectionTypes(typeSequence, unequalPairsOnly, false);
}

function inferHierarchyFromSectionTypes(typeSequence: number[],
    unequalPairsOnly: boolean, log: boolean) {
  //generate new types by merging into binary tree
  const newTypes = new Map<number, number[]>();
  let currentSequence = _.clone(typeSequence);
  let currentIndex = _.max(typeSequence)+1;
  let currentPair = getMostCommonPair(currentSequence, unequalPairsOnly);
  
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
    const firstNew = newTypes.get(currentPair[0]);
    const secondNew = newTypes.get(currentPair[1]);
    const occursPreviously = (t: number) => _.includes(currentSequence, t)
      || _.includes(_.flatten(otherPreviousTypes), t);
    const firstOccursInType = firstNew && occursPreviously(currentPair[0]);
    const secondOccursInType = secondNew && occursPreviously(currentPair[1]);
    if ((firstNew || secondNew) && !firstOccursInType && !secondOccursInType) {
      let operation: 'concat' | 'push' | 'unshift';
      if (firstNew && secondNew) {
        //check if first/second type contain each other
        operation = _.intersection(firstNew, currentPair).length > 0 ? 'push'
          : _.intersection(secondNew, currentPair).length > 0 ? 'unshift'
          : 'concat';
      } else {
        operation = firstNew ? 'push' : 'unshift';
      }
      if (operation === 'concat') {
        newTypes.set(currentIndex, _.concat(firstNew, secondNew));
        newTypes.delete(currentPair[0]);
        newTypes.delete(currentPair[1]);
        if (log) console.log(currentIndex, ': concat', JSON.stringify(newTypes.get(currentIndex)));
        //currentSequence = currentSequence.map(s => s === currentIndex ? currentPair[0] : s);
      } else if (operation === 'push') {
        newTypes.set(currentIndex, _.concat(firstNew, currentPair[1]));
        newTypes.delete(currentPair[0]);
        if (log) console.log(currentIndex, ': push', JSON.stringify(newTypes.get(currentIndex)));
        //currentSequence = currentSequence.map(s => s === currentIndex ? currentPair[0] : s);
      } else {
        newTypes.set(currentIndex, _.concat([currentPair[0]], secondNew));
        newTypes.delete(currentPair[1]);
        if (log) console.log(currentIndex, ': unshift', JSON.stringify(newTypes.get(currentIndex)));
        //currentSequence = currentSequence.map(s => s === currentIndex ? currentPair[1] : s);
      }
    //else add a new type
    } else {
      newTypes.set(currentIndex, currentPair);
      if (log) console.log(currentIndex, ':', JSON.stringify(newTypes.get(currentIndex)));
    }
    if (log) console.log(JSON.stringify(currentSequence));
    currentPair = getMostCommonPair(currentSequence, unequalPairsOnly);
    currentIndex++;
  }
  
  //combine types that only occur in one context
  _.reverse(_.sortBy([...newTypes.keys()])).forEach(t => {
    const parents = [...newTypes.keys()]
      .filter(n => _.includes(_.flattenDeep(newTypes.get(n)), t));
    const occs = _.flattenDeep(_.concat([...newTypes.values()], currentSequence))
      .reduce((c: number,u)=>u==t?c+1:c, 0);
    if (parents.length == 1 && occs <= 1) {
      newTypes.set(parents[0],
        replaceInTree(newTypes.get(parents[0]), t, newTypes.get(t)));
      newTypes.delete(t);
    }
  });
  
  //now flatten all types
  [...newTypes.keys()].forEach(t =>
    newTypes.set(t, _.flattenDeep(newTypes.get(t))));
  
  //create hierarchy
  let hierarchy: any[] = _.clone(currentSequence);
  if (log) console.log(_.reverse(_.sortBy([...newTypes.keys()])))
  
  hierarchy = replaceTypesRecursively(hierarchy, newTypes);
  
  //print types and occurrences
  _.reverse(_.sortBy([...newTypes.keys()])).forEach(t => {
    const seq = JSON.stringify(replaceTypesRecursively([t], newTypes)[0]);
    const occs = JSON.stringify(hierarchy).split(seq).length-1;
    if (occs && log) console.log(t, occs, seq);
  });
  
  if (log) console.log(JSON.stringify(hierarchy));
  return hierarchy;
}

function replaceTypesRecursively(hierarchy: any[], types: Map<number,number[]>) {
  hierarchy = _.cloneDeep(hierarchy);
  _.reverse(_.sortBy([...types.keys()])).forEach(t =>
    hierarchy = replaceInTree(hierarchy, t, types.get(t)));
  return hierarchy;
}

function replaceInTree(tree: any[], pattern: any, replacement: any) {
  if (!tree.length) return tree;
  return tree.map(n => _.isEqual(n, pattern) ? replacement
    : replaceInTree(n, pattern, replacement));
}

function getMostCommonPair<T>(array: T[], unequalOnly = false): [T, T] {
  let pairs = array.map<[T, T]>((a,i) =>
    i > 0 ? [array[i-1], a] : null).filter(a => a).map(p => JSON.stringify(p));
  let uniq = _.uniq(pairs);
  if (unequalOnly) uniq = uniq.filter(p =>
    {const q: [T,T] = JSON.parse(p); return q[0] != q[1]});
  const indexes = uniq.map(u => allIndexesOf(pairs, u));
  const disjunct = indexes.map(u =>
    u.reduce<number[]>((ii,i) => i == _.last(ii)+1 ? ii : _.concat(ii, i), []));
  const freqs = disjunct.map(d => d.length);
  //console.log(JSON.stringify(_.reverse(_.sortBy(_.zip(uniq, freqs), p => p[1])).slice(0,5)))
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
  /*console.log(JSON.stringify(inserts));
  console.log(JSON.stringify(deletes));
  console.log(JSON.stringify(boundaries));
  console.log(JSON.stringify(boundaries2));*/
  return boundaries;
}

export function getSectionGroupsFromTimelineMatrix(matrix: number[][],
    numMaxes = 1, minDist = 1, maskThreshold = .3) {
  //preprocess matrix
  const max = _.max(_.flatten(matrix));
  matrix = matrix.map(r => r.map(c => c >= maskThreshold*max ? c : 0));
  const levels = getSegmentation(matrix, minDist, numMaxes);
  //console.log(JSON.stringify(levels));
  return levels;
}

function getSegmentation(matrix: number[][], minDist: number, numConns: number) {
  //const connections = getIterativeMostConnected(matrix, minDist);
  const connections = getNMostConnectedForReal(matrix, minDist, numConns);
  const newMatrix = connections.map(_c => connections.map(_c => 0));
  connections.forEach((c,i) => c.forEach(j => newMatrix[i][j] = 1));
  //if (connMatrixFile) saveJsonFile(connMatrixFile, newMatrix);
  return getSectionsViaGraph(_.zip(...connections));
}

function getIndependentSegmentationLevels(matrix: number[][], minDist: number, maxLevels: number) {
  //build levels by iteratively getting mutually most similar segment for each segment
  const connections = getIterativeMostConnected(matrix, minDist);
  const levels = connections.slice(0, maxLevels)
    .map(c => getSectionsViaGraph([c]));
  //levels.forEach(l => console.log(JSON.stringify(l)));
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
function getSectionsFromGraph(graph: DirectedGraph<Node>, log = false) {
  //get connected components (corresponding sections)
  const components = _.sortBy(graph.getConnectedComponents()
    .map(c => _.sortBy(c.map(n => parseInt(n.id)))), c => _.min(c));
  if (log) console.log(JSON.stringify(components));
  //group successive components
  const grouped = components.reduce<number[][][]>((g,c) => {
    const last = _.last(_.last(g));
    if (last && last.length == c.length && last.every(i => _.includes(c, i+1)))
      _.last(g).push(c);
    else g.push([c]);
    return g;
  }, []);
  if (log) console.log(JSON.stringify(grouped));
  //create sections
  let sections = grouped.map(t => _.sortBy(_.zip(...t), c => _.min(c)));
  if (log) console.log(JSON.stringify(sections));
  //merge adjacents within type? but only short ones????
  sections = _.flatten(sections.map(t => mergeShortSectionsAndSplitIntoTypes(t)));
  sections = _.sortBy(sections, s => _.min(_.flatten(s)));
  //group sections that always occur successively!!!
  sections = mergeAlwaysAdjacent(sections);
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

function mergeAlwaysAdjacent(sectionTypes: number[][][]) {
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

/** possibly more than N (if same values), possibly fewer (if not mutual),
    minDist: min distance from diagonal */
function getNMostConnectedForReal(matrix: number[][], minDist: number, n = 1) {
  //remove diagonal +- minDist
  matrix = matrix.map((r,i) => r.map((c,j) => j < i-minDist || j > i+minDist ? c : 0));
  const connections = matrix.map(r => indexesOfNMax(r, n));
  //only keep mutual connections
  return connections.map((c,i) => c.filter(j => _.includes(connections[j], i)));
}

/** possibly more than N (if same values), possibly fewer (if not mutual),
    minDist: min distance from diagonal */
function getNMostConnected(matrix: number[][], minDist: number, n = 1) {
  const upper = matrix.map((r,i) => r.map((c,j) => j > i+minDist ? c : 0));
  const lower = _.zip(...matrix).map((r,i) => r.map((c,j) => j+minDist < i ? c : 0));
  const laterConns = upper.map(r => _.max(r) > 0 ? indexesOfNMax(r, n) : []);
  const earlierConns = lower.map(r => _.max(r) > 0 ? indexesOfNMax(r, n) : []);
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

//returns the indexes of the n maxima > 0 in array
function indexesOfNMax(array: number[], n: number): number[] {
  const maxes = _.reverse(_.sortBy(array.map((a,i) => [a,i]), 0))
    .filter(m => m[0] > 0); //filter out <= 0
  return _.takeWhile(maxes, (m,i) => i < n || m[0] == maxes[i-1][0])
    .map(m => m[1]);
}