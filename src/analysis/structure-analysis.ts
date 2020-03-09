import * as _ from 'lodash';
import { DirectedGraph, Node } from '../graphs/graph-theory';
import { SegmentNode } from './types';
import { loadJsonFile } from '../files/file-manager';
import { getMode } from './util';
import { pcSetToLabel } from '../files/theory';

export function inferStructureFromTimeline(filebase: string) {
  const timeline: SegmentNode[][] = loadJsonFile(filebase+'-output.json').timeline;
  const matrix: number[][] = loadJsonFile(filebase+'-matrix.json');
  const boundaries = getSectionBoundariesFromMSA(timeline);
  const sections = getSectionGroupsFromTimelineMatrix(matrix);
  console.log(JSON.stringify(sections));
  const boundaries2 = _.sortBy(_.flatten(sections.map(g => g.map(s => s[0]))));
  console.log(JSON.stringify(boundaries2));
  
  //TRY HIERARCHICAL GROUPING..... get most sim and remove all corresponding from matrix....
  
  //see if sections can be completed if just a few missing in beginning or end....
  
  console.log(JSON.stringify(sections.map(t => t[0].map(c =>
    //timeline[c]))));
    pcSetToLabel(getMode(timeline[c].map(n => n.point.slice(1))))))));
  return sections.map(type => _.flatten(_.flatten(type).map(s => timeline[s])));
}

function getSectionBoundariesFromMSA(timeline: SegmentNode[][]) {
  const inserts = timeline.map((t,i) => i > 0 ? _.sum(t.map(s => {
    const prev = timeline[i-1].filter(r => r.version == s.version)[0];
    return prev ? s.time - prev.time - 1 : 1;
  })) : 0);
  //}).filter(s => s > 0) : 0);
  const boundaries = inserts.map((g,i) => g > 7 ? i : null).filter(g => g != null);
  console.log(JSON.stringify(inserts));
  console.log(JSON.stringify(boundaries));
  return boundaries;
}

function getSectionGroupsFromTimelineMatrix(matrix: number[][],
    threshold = .1, minDist = 0, maxIterations = 10) {
  //preprocess matrix
  const max = _.max(_.flatten(matrix));
  matrix = matrix.map(r => r.map(c => c >= threshold*max ? c : 0));
  //make a graph with timepoint nodes connected by similarity
  const timelineNodes = matrix[0].map((_,i) => ({id:i.toString()}));
  const structureGraph = new DirectedGraph<Node>(timelineNodes);
  //get mutually most similar segment for each segment
  let currentConns = getMostConnected(matrix, minDist);
  while (currentConns.filter(c => c != null).length > 0 && maxIterations > 0) {
    currentConns.forEach((c,i) => { if (c) {
      structureGraph.addEdge(timelineNodes[i], timelineNodes[c]);
      matrix[i][c] = 0; matrix[c][i] = 0;
    }});
    currentConns = getMostConnected(matrix, minDist);
    maxIterations--;
  }
  
  //get connected components (corresponding sections)
  let comps = structureGraph.getConnectedComponents()
    .map(c => c.map(n => parseInt(n.id)));
  comps = _.sortBy(comps, c => _.min(c));
  //console.log(JSON.stringify(comps));
  
  const groupedComps = comps.reduce<number[][][]>((g,c) => {
    const last = _.last(_.last(g));
    if (last && last.length == c.length && last.every(i => _.includes(c, i+1)))
      _.last(g).push(c);
    else g.push([c]);
    return g;
  }, []);
  console.log(JSON.stringify(groupedComps));
  
  return groupedComps.map(t => _.zip(...t));
  //console.log(JSON.stringify(sections));
}

function getMostConnected(matrix: number[][], minDist: number) {
  const upper = matrix.map((r,i) => r.map((c,j) => j > i+minDist ? c : 0));
  const lower = matrix.map((r,i) => r.map((c,j) => j+minDist < i ? c : 0));
  const laterConns = upper.map(r => r.indexOf(_.max(r)));
  const earlierConns = lower.map(r => r.indexOf(_.max(r)));
  return laterConns.map((u,i) => earlierConns[u] === i ? u : null);
}