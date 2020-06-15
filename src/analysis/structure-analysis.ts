import * as _ from 'lodash';
import { getSmithWaterman, QUANT_FUNCS as QF, inferHierarchyFromTypeSequence,
  removeAlignmentMatrixOverlaps } from 'siafun';
import { DirectedGraph, Node } from '../graphs/graph-theory';
import { GraphPartition } from '../graphs/graph-partition';
import { SegmentNode } from './types';
import { getMode } from './util';
import { pcSetToLabel } from '../files/theory';

export enum METHOD {
  MSA_HIERARCHY,
  MSA_SW_HIERARCHY,
  MSA_GRAPH_HIERARCHY
}

export function inferStructureFromTimeline(timeline: GraphPartition<SegmentNode>,
    method: METHOD = METHOD.MSA_SW_HIERARCHY): SegmentNode[][] {
  switch(method) {
    case METHOD.MSA_HIERARCHY:
      return inferStructureFromTimelineSimple(timeline);
    case METHOD.MSA_SW_HIERARCHY:
      return inferStructureFromTimelineWithSW(timeline);
    case METHOD.MSA_GRAPH_HIERARCHY:
      return inferStructureFromTimelineWithAlignmentGraph(timeline);
  }
}

export function inferStructureFromTimelineSimple(timeline: GraphPartition<SegmentNode>): SegmentNode[][] {
  const partitions = timeline.getPartitions();
  const types = getTypesFromTimelineModes(partitions);
  const hierarchy = inferHierarchyFromTypeSequence(types, false);
  console.log("hierarchy", JSON.stringify(hierarchy));
  
  //TODO: refactor return values for all methods.... use hierarchies...
  const sections = _.toPairs(_.groupBy(types.map((t,i) => [t,i]), 0)).map(p => p[1]);
  return sections.map(type => _.flatten(_.flatten(type).map(s => partitions[s])));
}

export function inferStructureFromTimelineWithSW(timeline: GraphPartition<SegmentNode>): SegmentNode[][] {
  const partitions = timeline.getPartitions();
  const types = getTypesFromTimelineModes(partitions);
  const sectionsByTypes = getNonOverlappingSections(getSWMatrix(types, 8));
  const hierarchy = inferHierarchyFromSectionGroups(sectionsByTypes, true);
  console.log("hierarchy", JSON.stringify(hierarchy));
  const sectionTypeLabels = getLabelsForSections(sectionsByTypes, partitions);
  console.log("labels", JSON.stringify(replaceInHierarchy(hierarchy, sectionTypeLabels)));
  return sectionsByTypes.map(type => _.flatten(_.flatten(type).map(s => partitions[s])));
}

export function inferStructureFromTimelineWithAlignmentGraph(
    timeline: GraphPartition<SegmentNode>, minSegSizeProp = 0.1): SegmentNode[][] {
  const fullTimelineLabels = getTimelineLabels(timeline.getPartitions());
  console.log("fulltimeline", JSON.stringify(fullTimelineLabels));
  //remove small partitions
  timeline.removeSmallPartitions(minSegSizeProp*timeline.getMaxPartitionSize());
  const timelineLabels = getTimelineLabels(timeline.getPartitions());
  console.log("timeline", JSON.stringify(timelineLabels));
  const partitions = timeline.getPartitions();
  
  const boundaries = getSectionBoundariesFromMSA(partitions);
  //sequences of section indexes grouped by types
  
  const timelineTypes = getTypesFromTimelineModes(partitions);
  
  //const hybridMatrix = sum(maskMatrix(timeline.getConnectionMatrix()), getSWMatrix(timelineTypes));
  
  let sectionsByTypes = getNonOverlappingSections(maskMatrix(timeline.getConnectionMatrix()));
  console.log("types", JSON.stringify(sectionsByTypes));
  const sectionTypeLabels = getLabelsForSections(sectionsByTypes, partitions);
  console.log("stl", JSON.stringify(sectionTypeLabels));
  
  const types = _.uniq(_.flatten(sectionTypeLabels));
  const sectionTypeTypes = sectionTypeLabels.map(t => t.map(l => types.indexOf(l)));
  const repeats = sectionTypeTypes.slice(1,2).map(t =>
    getNonOverlappingSections(getSWMatrix(t)))[0];
  const hr = inferHierarchyFromSectionGroups(repeats, true);
  console.log("repeats", JSON.stringify(hr))
  
  const repl2 = h => h.reduce((r,s) => Array.isArray(s) ? _.concat(r, [repl2(s)])
    : _.concat(r, sectionTypeLabels.slice(1,2)[s]), []);
  //console.log(JSON.stringify(sections.length))
  console.log(JSON.stringify(repl2(hr)));
  
  /*const divideArray = (a: any[], pos: number[]) => {
    return a.reduce<number[][]>((b,v,i) => {
      _.includes(pos, i) ? b.push(v) : _.last(b).push(v);
      return b;
    }, [[]]);
  }
  
  //get internal structure of sections
  const sectionsByTypes2 = _.flatten(sectionTypeTypes.map(t => getSectionsViaSW(t)));
  //transfer to existing sections
  sectionsByTypes = _.flatten(sectionsByTypes.map((t,i) => t.map(s =>
    divideArray(s, sectionsByTypes2[i].map(j => j.length)))));*/
  
  //or try with hybrid sw-multi-sw matrix
  
  /*const hierarchies = sectionTypeTypes.map(t => inferHierarchyFromTypeSequence(t, true))
  console.log("hierarchies", JSON.stringify(hierarchies))*/
  
  const hierarchy = inferHierarchyFromSectionGroups(sectionsByTypes, true);
  console.log("hierarchy", JSON.stringify(hierarchy))
  
  let sections = hierarchy.map(h => Array.isArray(h) ?
    h.map(s => Array.isArray(s) ? _.flattenDeep(s) : s) : [h]);
  sections = _.flatten(sections.map(s => Array.isArray(s[0]) ? s : [s]));
  sections = sections.map(s => Array.isArray(s) ? s : [s]);
  const labeledSections = sections.map(s => 
    _.flatten(s.map(t => sectionTypeLabels[t])));
  console.log("sections", JSON.stringify(labeledSections))
  
  //console.log(JSON.stringify(sections.length))
  const hierarchyLabels = replaceInHierarchy(hierarchy, sectionTypeLabels);
  console.log("hierarchy", JSON.stringify(hierarchyLabels))
  
  
  //inferHierarchyFromTimelineMatrix(timeline.getConnectionMatrix());
  
  
  /*const boundaries2 = _.sortBy(_.flatten(sections.map(g => g.map(s => s[0]))));
  console.log(JSON.stringify(boundaries2));*/
  const boundaries2 = labeledSections.map(s => s.length);
  //console.log(JSON.stringify(boundaries2));
  
  //see if sections can be completed if just a few missing in beginning or end....
  
  const nodesByTypes = sectionsByTypes.map(type => _.flatten(_.flatten(type).map(s => partitions[s])));
  
  return nodesByTypes;
}

function getSWMatrix(types: number[], minSegLength = 2, nLongest?: number) {
  return getSmithWaterman(types.map((t,i) => [i,t]), {
    //cacheDir: cacheDir,
    quantizerFunctions: [QF.ORDER(), QF.IDENTITY()],
    maxIterations: 1,//true,
    fillGaps: true, //turn off for similarity graphs!!
    //similarityThreshold: .95,
    minSegmentLength: minSegLength, //only take segments longer than this
    //maxThreshold: 10, //stop when max value below this
    //endThreshold: 0,
    onlyDiagonals: true,
    nLongest: nLongest,
    //maxGapSize: 1,
    //maxGaps: 0,
    //minDistance: 0
  }).segmentMatrix;
}

function sum(m1: number[][], m2: number[][]) {
  return m1.map((r,i) => r.map((v,j) => v+m2[i][j]));
}

function getTypesFromTimelineModes(timeline: SegmentNode[][]) {
  return getTypesFromLabels(getTimelineLabels(timeline));
}

function getTimelineLabels(timeline: SegmentNode[][]): string[] {
  return timeline.map(t => pcSetToLabel(getMode(getAtemporalPoints(t))));
}

function getLabelsForSections(sectionsByTypes: number[][][], partitions: SegmentNode[][]) {
  return sectionsByTypes.map(s => _.zip(...s).map(is =>
    pcSetToLabel(getMode(_.flatten(is.map(i => getAtemporalPoints(partitions[i])))))));
}

function getTypesFromLabels(labels: string[]): number[] {
  const uniq = _.uniq(labels);
  return labels.map(c => uniq.indexOf(c));
}

function getAtemporalPoints(nodes: SegmentNode[]) {
  return nodes.map(n => n.point.slice(1));
}

function replaceInHierarchy(hierarchy: any[], elements: any[]) {
  return hierarchy.reduce((r,s) => Array.isArray(s) ?
    _.concat(r, [replaceInHierarchy(s, elements)])
    : _.concat(r, elements[s]), []);
}

//from structure graph or from matrix...
function getNonOverlappingSections(matrix: number[][]): number[][][] {
  matrix = removeAlignmentMatrixOverlaps(matrix);
  //large number of maxes equivalent to connected components
  return getSectionGroupsFromTimelineMatrix(matrix, 1000);
}

function inferHierarchyFromSectionGroups(sections: number[][][], unequalPairsOnly: boolean) {
  //iteratively/recursively
  //find all commonly occurring combinations
  const typeSequence = _.sortBy(_.flatten((sections)), s => _.min(s)).map(s =>
    _.findIndex(sections, t => _.includes(t, s)));
  //console.log(JSON.stringify(typeSequence));
  
  return inferHierarchyFromTypeSequence(typeSequence, unequalPairsOnly);
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
    numMaxes = 1, minDist = 0, maskThreshold = .3) {
  //preprocess matrix
  matrix = maskMatrix(matrix, maskThreshold);
  const levels = getSegmentation(matrix, minDist, numMaxes);
  //console.log(JSON.stringify(levels));
  return levels;
}

function maskMatrix(matrix: number[][], threshold = .3) {
  const max = _.max(_.flatten(matrix));
  return matrix.map(r => r.map(c => c >= threshold*max ? c : 0));
}

function getSegmentation(matrix: number[][], minDist: number, numConns: number) {
  //const connections = getIterativeMostConnected(matrix, minDist);
  const connections = getNMostConnectedForReal(matrix, minDist, numConns);
  //console.log(JSON.stringify(connections))
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