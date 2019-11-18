import * as _ from 'lodash';
import { DirectedGraph, Node } from './graph-theory';
import { SegmentNode } from './segment-analysis';
import { loadJsonFile } from '../files/file-manager';

export function inferStructureFromTimeline(filebase: string): SegmentNode[][] {
  const timeline: SegmentNode[][] = loadJsonFile(filebase+'-output.json').timeline;
  console.log(JSON.stringify(timeline.map(t=>t.length)));
  //load connection matrix and set diagonal to 0
  const matrix: number[][] = loadJsonFile(filebase+'-matrix.json');
  //_.range(0, matrix.length).forEach(i => matrix[i][i] = 0);
  const connections = matrix.map((r,i) => r[i]);
  console.log(JSON.stringify(connections));
  
  const upper = matrix.map((r,i) => r.map((c,j) => j > i ? c : 0));
  const lower = matrix.map((r,i) => r.map((c,j) => j < i ? c : 0));
  const laterSims = upper.map(r => r.indexOf(_.max(r)));
  const earlierSims = lower.map(r => r.indexOf(_.max(r)));
  //get mutually most similar
  const sims = laterSims.map((u,i) => earlierSims[u] === i ? u : null);
  console.log(JSON.stringify(sims));
  
  const timelineNodes = timeline.map((_,i) => ({id:i.toString()}));
  const structureGraph = new DirectedGraph<Node>(timelineNodes);
  sims.forEach((s,i) =>
    s ? structureGraph.addEdge(timelineNodes[i], timelineNodes[s]): null);
  let comps = structureGraph.getConnectedComponents().map(c => c.map(n => parseInt(n.id)));
  comps = _.sortBy(comps, c => _.min(c));
  console.log(JSON.stringify(comps));
  
  const isects = timeline.map((t,i) =>
    i > 0 ? _.intersectionBy(t, timeline[i-1], n => n.version).length: 0);
  
  console.log(JSON.stringify(isects));
  console.log(JSON.stringify(timeline.map((_t,i) => isects[i] * connections[i])));
  //const bestChain = isects.map(i => )
  
  const compsByTypes: number[][][] = [];
  comps.forEach(c => {
    let index: number;
    if (c.length == 1) {
      index = compsByTypes.findIndex(t => t.find(s =>
        s.length == 1 && s.indexOf(c[0]-1) >= 0) != null);
    } else {
      index = compsByTypes.findIndex(t => t.find(s =>
        s.length === c.length
        && c.slice(1).every(j => s.indexOf(j-1) >= 0)) != null);
    }
    index >= 0 ? compsByTypes[index].push(c) : compsByTypes.push([c]);
  });
  console.log(JSON.stringify(compsByTypes));
  
  const sections = compsByTypes.map(t => _.zip(...t));
  console.log(JSON.stringify(sections));
  
  //NOW SEE IF SECTIONS CAN BE UNIFIED IF ALL THEIR MEMBERS' NODES FOLLOW EACH OTHER
  
  return sections.map(type => _.flatten(_.flatten(type).map(s => timeline[s])));
}