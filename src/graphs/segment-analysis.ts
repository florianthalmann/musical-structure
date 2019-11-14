import * as _ from 'lodash';
import * as fs from 'fs';
import { Pattern, MultiStructureResult } from 'siafun';
const SimpleLinearRegression = require('ml-regression-simple-linear');
import { DirectedGraph, Node, saveGraph, loadGraph } from './graph-theory';
import { getPartition, GROUP_RATING, GroupingCondition, getBestGroups,
  removeGroupAndNodes, NodeGroup } from './graph-analysis';
import { saveJsonFile } from '../files/file-manager';

export interface SegmentNode extends Node {
  point: number[],
  version: number,
  time: number
}

const DIFF_VERSIONS: GroupingCondition<SegmentNode>
  = (n, os) => os.every(o => o.version !== n.version);

const MIN_DISTANCE = 8;
const DIFF_VERSIONS_MIN_DIST: GroupingCondition<SegmentNode>
  = (n, os) => !os.some(o => o.version == n.version
    && Math.abs(o.time-n.time) < MIN_DISTANCE);

const DIFF_VERSIONS_MAX_EDGES: GroupingCondition<SegmentNode>
  = (n, os, g) => {
    if (os[0].version === n.version) return false; //do not replace first node (center)
    if (os.every(o => o.version !== n.version)) return true;
    const existing = os.find(o => o.version === n.version);
    const edges1 = g.getAllEdges(os);
    const edges2 = g.getAllEdges(os.map(o => o === existing ? n : o));
    if (edges1.length < edges2.length) {
      os.splice(os.indexOf(existing), 1, n);
      return true;
    }
    return false;
  }


export function inferStructureFromAlignments(versionPairs: [number,number][],
    results: MultiStructureResult[], filebase?: string) {

  const timeline = constructTimelineFromAlignments(versionPairs, results,
    DIFF_VERSIONS, false, filebase);
  const fullGraph = createSegmentGraphFromAlignments(versionPairs, results, [0,1], false);
  const nodes = _.zipObject(fullGraph.getNodes().map(n => n.id), fullGraph.getNodes());
  const edges = fullGraph.getEdges();

  const connectionMatrix = timeline.map(t => timeline.map(s => {
    const tn = t.map(n => nodes[n.id]);
    const sn = s.map(n => nodes[n.id]);
    return edges.filter(e => (tn.indexOf(e.source) >= 0 && sn.indexOf(e.target) >= 0)
      || (tn.indexOf(e.target) >= 0 && sn.indexOf(e.source) >= 0)).length;
  }));

  if (filebase) {
    saveJsonFile(filebase+'-matrix.json', connectionMatrix);
    saveGraph(filebase+'-graph.json', fullGraph);
    //saveGraph(filebase+'-graph-seg.json', fullGraph.getSubgraph(_.flatten(timeline.slice(75, 79))));
  }
  //console.log(timeline.slice(75, 79).map(t => t.map(n => n.id)));

  return timeline;
}

export function constructTimelineFromAlignments(versionPairs: [number,number][],
    results: MultiStructureResult[], groupingCondition: GroupingCondition<SegmentNode>,
    postprocess = true, filebase?: string) {
  const MIN_COMPONENT_SIZE = _.uniq(_.flatten(versionPairs)).length/8;
  console.log("graph")

  let graph: DirectedGraph<SegmentNode>;
  if (filebase && fs.existsSync(filebase+'-tlgraph.json')) {
    graph = loadGraph(filebase+'-tlgraph.json');
    console.log("loaded", graph.getSize(), graph.getEdges().length)
  } else {
    graph = createSegmentGraphFromAlignments(versionPairs, results, [0,1], postprocess);
    saveGraph(filebase+'-tlgraph.json', graph);
  }

  //divide graph into connected components
  //let components = getSegmentGraphPartitions(graph, MIN_COMPONENT_SIZE, groupingCondition);
  let partition = iterativeGetIndexBasedPartition(graph, groupingCondition);

  //saveGraph('plots/d3/latest/slice2.json', graph.getSubgraph(components[0]));

  return constructTimeline(partition, MIN_COMPONENT_SIZE);
}

function getSegmentGraphPartitions(graph: DirectedGraph<SegmentNode>,
    minComponentSize = 0, groupingCondition: GroupingCondition<SegmentNode>) {
  //divide graph into connected components, filter out small ones
  let components = graph.getConnectedComponents();
  console.log("components", components.length);
  components = components.filter(c => c.length > minComponentSize)
    //.map(c => graph.getSubgraph(c).pruneEdgesNotInCycles());
  console.log("large", components.length, JSON.stringify(components.slice(0,20).map(c => c.length)), "...");
  console.log("non-unique", components.filter(c => !uniqueVersions(c)).length);

  //(previous technique based on cycles)
  //let grouped = components.map(c => groupByPositionAndCycles(graph.getSubgraph(c)));

  //partition connected components with more than one node per version
  components = _.flatten(components.map(c => !uniqueVersions(c) ? getPartition({
    graph: graph.getSubgraph(c),
    condition: groupingCondition,
    ratingMethod: GROUP_RATING.INTERNAL,
    maxDistance: 0
  }).map(g => g.members)
  : [c]));
  console.log("split", components.filter(c => !uniqueVersions(c)).length);
  console.log(components.slice(0,20).map(c => c.length));
  saveGraph('plots/d3/latest/best.json', graph.getSubgraph(components[1]));

  return components;
}

function iterativeGetIndexBasedPartition(graph: DirectedGraph<SegmentNode>,
    groupingCondition: GroupingCondition<SegmentNode>) {
  
  const MIN_SIZE_FACTOR = 3;
  let currentSequence: SegmentNode[][] = [];
  let bestSequence: SegmentNode[][] = [];
  let missing: SegmentNode[] = graph.getNodes();
  let previousNodeCounts = [0];
  let currentNodeCount = 0;

  while (previousNodeCounts.filter(m => m >= currentNodeCount).length <= 10) {
    //add new partitions
    let currentGraph = graph.getSubgraph(missing);
    console.log("GRAPH", currentGraph.getSize(), currentGraph.getEdges().length)
    
    let addition: SegmentNode[][] = [];
    let lastAdded = currentSequence;
    let numLastAdded = Infinity;
    while (numLastAdded && previousNodeCounts[previousNodeCounts.length-2] !== currentNodeCount) {
      const succ = lastAdded.map(t => t.map(n => currentGraph.getNodes()
        .find(m => m.version === n.version && m.time === n.time+1)).filter(m=>m));
      const pred = lastAdded.map(t => t.map(n => currentGraph.getNodes()
        .find(m => m.version === n.version && m.time === n.time-1)).filter(m=>m));
      const succGs = succ.map(s => currentGraph.getSubgraph(s).pruneIsolatedNodes().getNodes())
        .filter(s => s.length > 1);
      const predGs = pred.map(p => currentGraph.getSubgraph(p).pruneIsolatedNodes().getNodes())
        .filter(p => p.length > 1);
      let max = _.max(currentSequence.map(t => t.length));
      lastAdded = _.concat(predGs, succGs).filter(s => s.length > max/(MIN_SIZE_FACTOR+1));
      numLastAdded = lastAdded.length;
      if (numLastAdded) {
        addition.push(...lastAdded);
        numLastAdded = 0; //(REVERT TO JUST ADDING SOME PER ITERATION)
        currentGraph = graph.getSubgraph(_.difference(missing, _.flatten(addition)));
      }
    }
    //else search graph
    if (!addition.length) {
      let max = _.max(currentSequence.map(t => t.length));
      addition = getIndexBasedPartition(currentGraph, groupingCondition);
      //addition = getBestGroup(currentGraph, groupingCondition, max/(MIN_SIZE_FACTOR+1));
      //addition = getSuccessiveGroups(currentGraph, groupingCondition, currentSequence);
    }
    console.log("added slices", JSON.stringify(addition.map(a => a.length)));
    currentSequence.push(...addition);
    sortComponentsTemporally(currentSequence);

    //then remove all nodes involved in contradictions (ensure strict order)
    const removed = getContradictions(currentSequence, true);
    console.log("contradictions removed", removed.length);
    currentSequence = currentSequence.map(t => t.filter(n => removed.indexOf(n) < 0));
    
    //then keep only largest connected components per slice
    /*const minorComponents = _.flatten(currentSequence.map(t =>
      _.flatten(graph.getSubgraph(t).getConnectedComponents().slice(1))));
    console.log("minor components removed", minorComponents.length);
    currentSequence = currentSequence.map(t => t.filter(n => minorComponents.indexOf(n) < 0));*/
    
    //then remove all nodes without connections to their own slice
    let nodeCount = _.flatten(currentSequence).length;
    currentSequence = currentSequence.map(t => graph.getSubgraph(t).pruneIsolatedNodes().getNodes());
    console.log("disconnected removed", nodeCount-_.flatten(currentSequence).length);
    
    //then remove all nodes not in slices to which they have the most connections
    const misplaced = getInconsistencies(currentSequence, graph);
    console.log("inconsistencies removed", misplaced.length);
    currentSequence = currentSequence.map(t => t.filter(n => misplaced.indexOf(n) < 0));
    
    //then remove all nodes in slices with more than one per version
    const unique = currentSequence.map(t => _.uniqBy(t, n => n.version));
    const multi = _.difference(_.flatten(currentSequence), _.flatten(unique));
    console.log("multiples removed", multi.length);
    currentSequence = unique;
    
    //add any other missing nodes wherever most appropriate
    missing = _.difference(graph.getNodes(), _.flatten(currentSequence));
    console.log("missing", missing.length);
    while (missing.length > 0) {
      const added = addSegmentsAtBestSpots(missing, currentSequence, graph);
      if (added.length > 0) {
        missing = _.difference(missing, added);
        console.log("m", missing.length)
      } else break;
    }
    console.log("still missing", missing.length);
    
    //remove all with connections to neighboring slices
    const blurs = _.flatten(currentSequence.map((t,i) => i < currentSequence.length-1 ?
      getInterGroupEdges(t, currentSequence[i+1], graph).map(e => e.source) : []));
    console.log("blurs removed", blurs.length);
    currentSequence = currentSequence.map(t => t.filter(n => blurs.indexOf(n) < 0));
    
    //remove all nodes not in cycles
    /*let tempNodeCount = _.flatten(currentSequence).length;
    currentSequence = currentSequence.map(t =>
      graph.getSubgraph(t).pruneEdgesNotInCycles().pruneIsolatedNodes().getNodes())
    currentNodeCount = _.flatten(currentSequence).length;
    console.log("non-cycles removed", tempNodeCount-currentNodeCount);*/

    //remove all time points with too few nodes
    let tempNodeCount = _.flatten(currentSequence).length;
    let max = _.max(currentSequence.map(t => t.length));
    currentSequence = _.clone(currentSequence.filter(t => t.length > max/MIN_SIZE_FACTOR));
    /*const smallest = _.sortBy(currentSequence, t => t.length).slice(0,currentSequence.length/4);
    currentSequence = currentSequence.filter(t => smallest.indexOf(t) < 0);*/
    currentNodeCount = _.flatten(currentSequence).length;
    console.log("small removed", tempNodeCount-currentNodeCount);
    console.log("current count", currentNodeCount);

    if (previousNodeCounts.every(m => currentNodeCount > m)) {
      bestSequence = _.clone(currentSequence);
      console.log(JSON.stringify(currentSequence.map(t => t.length)));
      console.log(JSON.stringify(currentSequence.map(t => graph.getSubgraph(t).getEdges().length)))
    }
    previousNodeCounts.push(currentNodeCount);
    
    console.log(JSON.stringify(_.sample(bestSequence).map(n => n.point)))
  }

  console.log(JSON.stringify(bestSequence.map(t =>
    graph.getSubgraph(t).getConnectedComponents().length)));

  /*//move nodes between neighboring bins if appropriate
  let neighboring = bestSequence.reduce<number>((n,s,i) =>
    i > 0 ? n+getInterGroupEdges(s, bestSequence[i-1], graph).length : 0, 0);
  let previousN = Infinity;
  while (neighboring < previousN) {
    bestSequence.forEach((t,i) => {
      if (i > 0) {
        const edges = getInterGroupEdges(t, bestSequence[i-1], graph);
        const sourceGraph = graph.getSubgraph(t);
        const targetGraph = graph.getSubgraph(bestSequence[i-1]);
        edges.forEach(e => {
          console.log(sourceGraph.getDirectAdjacents(e.source).length,
            targetGraph.getDirectAdjacents(e.source).length,
            sourceGraph.getDirectAdjacents(e.target).length,
            targetGraph.getDirectAdjacents(e.target).length);
        });
        neighboring = bestSequence.reduce<number>((n,s,i) =>
          i > 0 ? n+graph.getSubgraph(_.concat(s, bestSequence[i-1])).getEdges().length : 0, 0);
      }
    });
  }*/

  return bestSequence;
}

//returns all edges between the two given groups
function getInterGroupEdges(group1: SegmentNode[], group2: SegmentNode[],
    graph: DirectedGraph<SegmentNode>) {
  return _.differenceBy(graph.getSubgraph(_.concat(group1, group2)).getEdges(),
    _.concat(graph.getSubgraph(group1).getEdges(), graph.getSubgraph(group2).getEdges()),
    e => e.source.id+e.target.id);
}

function getSuccessiveGroups(graph: DirectedGraph<SegmentNode>,
    groupingCondition: GroupingCondition<SegmentNode>, existingSeq: SegmentNode[][] = []) {
  const options = {
    graph: graph,
    condition: groupingCondition,
    ratingMethod: GROUP_RATING.INTERNAL,
    maxDistance: 0
  };
  const groups = getBestGroups(options).slice(0,500);
  
  /*let sequence = sortComponentsTemporally(groups.map(g => g.members));
  let numSucc = sequence.map((t,i) => i > 0 ?
    getDirectSuccessors(sequence[i-1], t).length : 0);
  sequence = sequence.filter((_,i) => numSucc[i] > 1 || numSucc[i+1] > 1);
  numSucc = sequence.map((t,i) => i > 0 ?
    getDirectSuccessors(sequence[i-1], t).length : 0);
  console.log(JSON.stringify(numSucc));*/
  
  let sequence = sortComponentsTemporally(_.concat(existingSeq, groups.map(g => g.members)));
  let numSucc = sequence.map((t,i) => i > 0 ?
    getDirectSuccessors(sequence[i-1], t).length : 0);
  sequence = sequence.filter((_,i) => numSucc[i] > 1 || numSucc[i+1] > 1);
  numSucc = sequence.map((t,i) => i > 0
    && (existingSeq.indexOf(t) < 0 || existingSeq.indexOf(sequence[i-1]) < 0) ?
    getDirectSuccessors(sequence[i-1], t).length : 0); //ignore succ between pairs of existing
  console.log(JSON.stringify(numSucc));
  
  const max = _.max(numSucc);
  let best = sequence.filter((_,i) => numSucc[i] === max || numSucc[i+1] === max);
  let bbest = best;
  best = best.filter(b => existingSeq.indexOf(b) < 0);
  console.log("best", bbest.length, best.length)
  
  return best;
}

function getBestGroup(graph: DirectedGraph<SegmentNode>,
    groupingCondition: GroupingCondition<SegmentNode>, minSize: number) {
  const options = {
    graph: graph,
    condition: groupingCondition,
    ratingMethod: GROUP_RATING.INTERNAL,
    maxDistance: 0
  };
  const groups = getBestGroups(options).slice(0,100);
  let sequence: SegmentNode[][] = [];
  let remainingGroups = _.clone(groups);
  let lastAdded = groups[0];
  sequence.push(lastAdded.members);
  while (lastAdded && remainingGroups.length > 0) {
    remainingGroups = removeGroupAndNodes(remainingGroups, lastAdded, options)
      .filter(g => g.members.length > 1);
    if (remainingGroups.length > 0) {
      //does have to be calculated every time since the remaining groups change
      lastAdded = _.maxBy(remainingGroups, g => g.members.length);
      if (lastAdded.members.length > minSize) {//more than a third are direct succ
        sequence.push(lastAdded.members);
      } else {
        lastAdded = null;
      }
    }
  }
  return sequence;
}

function getIndexBasedPartition(graph: DirectedGraph<SegmentNode>,
    groupingCondition: GroupingCondition<SegmentNode>) {
  const options = {
    graph: graph,
    condition: groupingCondition,
    ratingMethod: GROUP_RATING.INTERNAL,
    maxDistance: 0
  };
  const groups = getBestGroups(options).slice(0, 300);
  //groups.slice(0,10).forEach(g => console.log(JSON.stringify(g.members.map(m => m.id))));

  //start with best group (most interconnected)
  let currentStart = 0;
  //find group with most successors/predecessors, add to sequence, and so on
  let sequence: SegmentNode[][] = [];
  let remainingGroups = _.clone(groups);
  let lastAdded = groups[currentStart];
  sequence.push(lastAdded.members);
  while (lastAdded) {
    remainingGroups = removeGroupAndNodes(remainingGroups, lastAdded, options)
      .filter(g => g.members.length > 1);
    if (remainingGroups.length > 0) {
      //does have to be calculated every time since the remaining groups change
      const succRatings = remainingGroups.map(g =>
        getDirectSuccessors(_.last(sequence), g.members).length);
        //g.rating * getDirectSuccessors(currentComp.members, g.members).length);
      const predRatings = remainingGroups.map(g =>
        getDirectSuccessors(g.members, _.first(sequence)).length);
        //g.rating * getDirectSuccessors(g.members, currentComp.members).length))[0];
      //console.log(_.max(predRatings), _.max(succRatings));
      if (_.max(succRatings) >= _.max(predRatings)) {
        const candidate = remainingGroups[succRatings.indexOf(_.max(succRatings))];
        const succ = getDirectSuccessors(_.last(sequence), candidate.members);
        if (succ.length > candidate.members.length/3) {//more than a third are direct succ
          lastAdded = candidate;
          sequence.push(lastAdded.members);
        } else {
          if (sequence.length == 1) {//try harder if no pair found
            currentStart++;
            remainingGroups = _.clone(groups).slice(currentStart);
            lastAdded = remainingGroups[0];
            sequence = [lastAdded.members];
          } else {
            lastAdded = null;
          }
        }
      } else {
        lastAdded = remainingGroups[predRatings.indexOf(_.max(predRatings))];
        const pred = getDirectSuccessors(lastAdded.members, _.first(sequence));
        if (pred.length > lastAdded.members.length/3) {//more than a third are direct pred
          sequence.unshift(lastAdded.members);
        } else {
          if (sequence.length == 1) {//try harder if no pair found
            currentStart++;
            remainingGroups = _.clone(groups).slice(currentStart);
            lastAdded = remainingGroups[0];
            sequence = [lastAdded.members];
          } else {
            lastAdded = null;
          }
        }
      }
    } else {
      lastAdded = null;
    }
  }

  return sequence;
}

function addSegmentsAtBestSpots(segments: SegmentNode[],
    sequence: SegmentNode[][], graph: DirectedGraph<SegmentNode>) {
  const added: SegmentNode[] = [];
  segments.forEach(n => {
    //console.log(n.id)
    //all current times for version
    const times = sequence.map(t =>
      _.min(t.filter(m => m.version === n.version).map(m => m.time)));
    //console.log("times", JSON.stringify(times))
    //gaps filled
    const filled = getCompletedNumberArray(times);
    //console.log("filled", JSON.stringify(filled))
    const places = times.map((_,i) =>
      !times.slice(0,i+1).some(t => t > n.time)
      && !times.slice(i).some(t => t < n.time));
    //console.log("places", JSON.stringify(places))
    const matches = sequence.map((t,i) => places[i] ?
      graph.getDirectAdjacents(n).filter(a => t.indexOf(a) >= 0).length
      //graph.getSubgraph(_.concat(t, n)).getDirectAdjacents(n).length
        / (Math.abs(filled[i]-n.time)+1) : 0);
    //console.log("matches", JSON.stringify(matches))
    const max = _.max(matches);
    if (max > 0) {
      const index = matches.indexOf(max);
      //if (sequence[index].map(n => n.version).indexOf(n.version) < 0) {
        sequence[index].push(n);
        added.push(n);
      //}
    } else {
      //INSERT IF APPROPRIATE!!!
      /*const next = sequence.find(t =>
        t.find(m => m.version === n.version && m.time > n.time) != null);
      if (next) {
        sequence.splice(sequence.indexOf(next), 0, [n]);
      } else {
        sequence.push([n]);
      }*/
    }
  });
  return added;
}

function getCompletedNumberArray(nums: number[]) {
  nums = _.clone(nums);
  //fill gaps and end
  nums.forEach((n,i) => {
    if (n == null && nums[i-1] != null) {
      const next = nums.slice(i).find(t => t != null);
      nums[i] = next ? Math.min(nums[i-1]+1, next) : nums[i-1]+1;
    }
  });
  //fill beginning
  nums = _.reverse(nums);
  nums.forEach((n,i) => nums[i] = n != null ? n : Math.max(nums[i-1]-1, 0));
  return _.reverse(nums);
}

//successors in time! (not graph)
function getDirectSuccessors(before: SegmentNode[], after: SegmentNode[]) {
  return after.filter(a => before.filter(b => b.version === a.version)
    .some(b => b.time+1 === a.time));
}

function constructTimeline(components: SegmentNode[][], minTimepointSize = 0) {
  console.log("components", components.length)

  sortComponentsTemporally(components);

  //now gradually add to timeline (disjunct at same time!)
  let timeline: SegmentNode[][] = [];
  components.forEach((c,i) =>
    i > 0 && differentVersions(c, _.last(timeline)) ?
      _.last(timeline).push(...c)
      : timeline.push(c));
  console.log("timeline", timeline.length);

  timeline = timeline.filter(c => c.length > minTimepointSize);
  console.log("simple", timeline.length);
  console.log("points", _.flatten(_.flatten((timeline))).length);

  console.log("irregularities", getNumberOfIrregularties(timeline));

  /*printVersion(mostCommonVersion(components[0]), timeline);
  printVersion(0, timeline);
  printVersion(5, timeline);
  printVersion(10, timeline);*/
  /*printVersion(50, timeline);
  printVersion(76, timeline);
  printVersion(84, timeline);
  printVersion(69, timeline);*/

  /*const print = _.zip(...timeline.map(t => _.range(0, MAX_VERSION).map(i =>
    t.filter(s => s.version === i).length > 0 ? '.' : ' ')));*/
  //print.forEach(p => console.log(p.join('')))

  return timeline;
}

function sortComponentsTemporally(components: SegmentNode[][]) {
  /*components.sort((a,b) => _.range(0, NUM_VERSIONS).some(v =>
    getIndex(a, v) < getIndex(b, v)) ? -1 : 1);*/
  //components.sort((a,b) => _.mean(a.map(n => n.time)) < _.mean(b.map(n => n.time)) ? -1 : 1);
  //new sorting method based on common versions!!
  components.sort((a,b) => {
    const versions = _.intersection(a.map(n => n.version), b.map(n => n.version));
    const aversions = a.filter(n => versions.indexOf(n.version) >= 0);
    const bversions = b.filter(n => versions.indexOf(n.version) >= 0);
    return _.mean(aversions.map(n => n.time)) < _.mean(bversions.map(n => n.time)) ? -1 : 1
  });
  return components;
}

function printVersion(v: number, g: SegmentNode[][]) {
  console.log(JSON.stringify(g.map(g =>
    g.filter(n => n.version === v)).map(s =>
      _.pad(s.length > 0 ?
        _.sortBy(s.map(n => n.id.split(".")[1])).join("/") : "-", 6)).join(" ")));
}

function printComponent(c: SegmentNode[]) {
  console.log(JSON.stringify(_.sortBy(c.map(n => n.version+"."+n.time))));
}

function getNumberOfIrregularties(timeline: SegmentNode[][]) {
  return getContradictions(timeline, false).length;
}

//includeAll false => only later points that contradict earlier are returned
//true => earlier points part of contradiction are also included
function getContradictions(timeline: SegmentNode[][], includeAll: boolean): SegmentNode[] {
  const versions = _.uniq(_.flatten(timeline.map(t => t.map(n => n.version))));
  return _.uniq(_.flatten(versions.map(v => {
    //get only earliest time point per version in each slice
    const ts = timeline.map(t =>
      _.sortBy(t.filter(n => n.version === v), n => n.time)[0]).filter(n => n);
    //keep all nodes with contradictory times
    return ts.reduce<SegmentNode[]>((contras, n, i) => {
      if (i > 0) {
        const earlyLater = ts.slice(0,i).find(t => t.time > n.time);
        if (earlyLater) {
          return _.concat(contras, includeAll ? [earlyLater, n] : [n]);
        }
      }
      return contras;
    }, []);
  })));
}

function getInconsistencies(timeline: SegmentNode[][], graph: DirectedGraph<SegmentNode>): SegmentNode[] {
  return _.flatten(timeline.map((t,i) => t.filter(n => {
    const adjacents = graph.getDirectAdjacents(n);
    const connections =
      timeline.map(t => t.filter(n => _.includes(adjacents, n)).length);
    return connections[i] < _.max(connections);
  })));
}

export function createSegmentGraphFromAlignments(versionPairs: [number,number][],
    results: MultiStructureResult[], patternIndexes: number[],
    postprocessPatterns: boolean, path?: string) {
  //recover points for all versions from results
  const vIndexes: [number,number][] = [];
  versionPairs.forEach((vs,i) => vs.forEach((v,j) => vIndexes[v] = [i,j]));
  let versionsPoints = vIndexes.map(ij =>
    ij[1] == 0 ? results[ij[0]].points : results[ij[0]].points2)
  
  //create nodes and a map to find them quickly
  const nodes: SegmentNode[][] = versionsPoints.map((ps,i) =>
    ps.map((p,j) => ({id: i+"."+j, point: p, version: i, time: j})));
  console.log("made nodes")
  const nodesByVersionByPoint = nodes.map(v =>
    _.zipObject(v.map(n => JSON.stringify(n.point)), v));
  //initialize graph
  let graph = new DirectedGraph(_.flatten(nodes), []);

  let patterns = results.map(r => r.patterns);
  
  //plot all matrices
  /*const versionStringPoints = versionsPoints.map(v => v.map(p => JSON.stringify(p)));
  patterns.forEach((ps,i) =>
    saveJsonFile('results/sw-post2/sw_'+i+'.json',
      {'segmentMatrix': toMatrix(ps, versionPairs[i], versionStringPoints)}));*/

  console.log("processing patterns")

  if (postprocessPatterns) {
    console.log("reduce")
    //reduce patterns using linear regression
    const versionStringPoints = versionsPoints.map(v => v.map(p => JSON.stringify(p)));
    patterns = patterns.map((ps,i) =>
      findMostCoherentAlignments(ps, versionPairs[i], versionStringPoints));

    console.log("overlaps")
    //remove overlaps
    patterns = patterns.map((ps,i) =>
      removePatternOverlaps(ps, versionPairs[i], versionStringPoints));
    //plot processed matrices
    patterns.forEach((ps,i) =>
      saveJsonFile('results/sw-post/sw_'+i+'o.json',
        {'segmentMatrix': toMatrix(ps, versionPairs[i], versionStringPoints)}));
    /*console.log(results.slice(0,10).map(r => r.patterns.length), " => ",
      bestPatterns.slice(0,10).map(p => p.length))*/
  }

  console.log("done")

  //add alignment connections
  _.zip(versionPairs, patterns).forEach(([vs,ps]) =>
    ps.filter((_,i) => patternIndexes.indexOf(i) >= 0).forEach(pn => pn.points.map((_,i) => {
      const nodes = vs.map((v,j) =>
        nodesByVersionByPoint[v] ?
        nodesByVersionByPoint[v][JSON.stringify(pn.occurrences[j][i])] : null);
      //console.log(JSON.stringify(nodes), JSON.stringify(vs))
      //if (i < 20)
      if (nodes[0] && nodes[1])
        graph.addEdge(nodes[0], nodes[1]);
    })));

  console.log("\nfull", graph.getSize(), graph.getEdges().length)

  graph = graph.pruneIsolatedNodes();
  console.log("pruned", graph.getSize(), graph.getEdges().length)

  //REMOVE ALL NODES WITH SMALL DEGREES (ALL DEGREES ARE RELATIVELY SMALL THOUGH...)
  /*graph = graph.getSubgraph(graph.getNodes().filter(n => graph.getDegree(n) > 2));
  console.log("degrees", graph.getSize(), graph.getEdges().length)*/

  //KEEP ONLY BIDIRECTIONAL EDGES (BAD IDEA IF NOT ALL POSSIBLE PAIRS ALIGNED...)
  /*graph = graph.getBidirectionalSubgraph();
  console.log("bidirectional", graph.getSize(), graph.getEdges().length)*/

  //REMOVE ALL EDGES NOT IN CYCLES (TOO STRICT)
  /*graph = graph.pruneEdgesNotInCycles();
  console.log("pruned2", graph.getSize(), graph.getEdges().length)*/

  //print number of nodes connected to each slice of version 0
  /*const v0nodes = versionsPoints[0].map(p => nodesByVersionByPoint[0][JSON.stringify(p)]);
  const v0conn = v0nodes.map(n =>
    graph.getConnectedComponent(n).filter((m:SegmentNode) => m.version != n.version).length);
  console.log(graph.getSize(), JSON.stringify(v0conn))*/

  /*const components = graph.getConnectedComponents().slice(0,10);

  console.log(components.map(c => c.length));

  console.log(_.reverse(_.sortBy(graph.getConnectedComponents()[0].map(n =>
    graph.getDirectAdjacents(n).length))).slice(0,10))

  graph = graph.getSubgraph(components[0])
  console.log(graph.getSize(), graph.getEdges().length);

  const edges = graph.getEdges();
  const dists = edges.map(e => graph.getShortestDistance(e.source, e.target, [e]));
  console.log("prune")
  const pruned = new DirectedGraph(graph.getNodes(), edges.filter((_,i) => dists[i] < 3)).pruneIsolatedNodes();
  console.log(pruned.getSize());
  //const randomEdges = _.sampleSize(graph.getEdges(), 5);
  //console.log(randomEdges)
  //console.log(randomEdges.map(e => graph.getShortestDistance(e.source, e.target, [e])));*/

  if (path) saveGraph(path, graph);

  return graph;
}

function getIndex(nodes: SegmentNode[], version: number) {
  const node = nodes.filter(n => n.version === version)[0];
  if (node) return node.time;
}

function differentVersions(nodes1: SegmentNode[], nodes2: SegmentNode[]) {
  return _.intersection(nodes1.map(n => n.version), nodes2.map(n => n.version))
    .length === 0;
}

function uniqueVersions(nodes: SegmentNode[]) {
  return _.uniq(nodes.map(n => n.version)).length === nodes.length;
}

function mostCommonVersion(nodes: SegmentNode[]) {
  return _.reverse(_.sortBy(_.values(
    _.groupBy(nodes, n => n.version)), v => v.length))[0][0].version;
}

function getFirstPositions(nodes: SegmentNode[], count = 1) {
  const result: SegmentNode[] = [];
  let remaining = nodes;
  _.range(0,count).forEach(i => {
    result.push(..._.uniqBy(_.sortBy(remaining, n => n.time), c => c.version));
    remaining = _.difference(remaining, result);
  });
  return result;
}

function getLastPositions(nodes: SegmentNode[]) {
  return _.uniqBy(_.reverse(_.sortBy(nodes, n => n.time)), c => c.version);
}

function groupByPositions(graph: DirectedGraph<SegmentNode>, posPerGroup = 1) {
  const grouped: SegmentNode[][] = [];
  let remainingNodes = graph.getNodes();
  while (remainingNodes.length > 0) {
    const currentFirsts = getFirstPositions(remainingNodes, posPerGroup);
    grouped.push(currentFirsts);
    remainingNodes = _.difference(remainingNodes, currentFirsts);
  }
  return grouped;
}

function groupByPositionAndCycles(graph: DirectedGraph<SegmentNode>) {
  let byPosition = groupByPositions(graph);
  console.log("positions", JSON.stringify(byPosition.map(c => c.length)), byPosition.length);
  const byCycle: SegmentNode[][] = [];
  let remaining: SegmentNode[] = [];
  byPosition.forEach(nodes => {
    remaining.push(...nodes);
    const currentCycles = graph.getSubgraph(getFirstPositions(remaining))
      .pruneEdgesNotInCycles().pruneIsolatedNodes().getNodes();
    byCycle.push(currentCycles);
    remaining = _.difference(remaining, currentCycles);
  });
  console.log("cycles", JSON.stringify(byCycle.map(c => c.length)), remaining.length)
  /*console.log("more last", JSON.stringify(_.range(0,20).map(i => {
    const last = getLastPositions(remaining);
    const size = graph.getSubgraph(last).pruneEdgesNotInCycles().pruneIsolatedNodes().getSize()
    remaining = _.difference(remaining, last);
    return size;
  })))
  console.log("more first", JSON.stringify(_.range(0,10).map(i => {
    const first = getFirstPositions(remaining);
    const size = graph.getSubgraph(first).pruneEdgesNotInCycles().pruneIsolatedNodes().getSize()
    remaining = _.difference(remaining, first);
    return size;
  })))*/
  /*remaining.slice(0,5).map(r => console.log(JSON.stringify(byCycle.map(nodes =>
    graph.getSubgraph(_.concat(nodes, [r])).getIncidentEdges(r).length))));*/

  //POSTPROCESS
  /*const last = getLastPositions(remaining);
  byCycle.map((c,i) => {
    const concat = _.concat(c,last);
    const first = getFirstPositions(concat);
    const order = first.filter(f =>
      _.concat(_.flatten(byCycle.slice(0, i)).filter(c => c.time > f.time),
      _.flatten(byCycle.slice(i+1)).filter(c => f.time > c.time)).length === 0);
    const addition = graph.getSubgraph(order).pruneEdgesNotInCycles().pruneIsolatedNodes().getSize()-c.length
    console.log(concat.length, first.length, order.length, addition);
  })*/
  /*const first = getFirstPositions(remaining);
  byCycle.map((c,i) => {
    const concat = _.concat(c,first);
    const first2 = getFirstPositions(concat);
    const order = first2.filter(f =>
      _.concat(_.flatten(byCycle.slice(0, i)).filter(c => c.time > f.time),
      _.flatten(byCycle.slice(i+1)).filter(c => f.time > c.time)).length === 0);
    const addition = graph.getSubgraph(order).pruneEdgesNotInCycles().pruneIsolatedNodes().getSize()-c.length
    console.log(c.length, concat.length, first2.length, order.length, addition);
  })*/
  /*const first = getFirstPositions(remaining);
  additions = byCycle.map(c => graph.getSubgraph(_.concat(first,c)).pruneEdgesNotInCycles().pruneIsolatedNodes().getSize()-c.length)
  console.log("first additions", JSON.stringify(additions))*/
  return byCycle;
}

function findMostCoherentAlignments(patterns: Pattern[],
    versions: [number, number], versionsPoints: string[][]) {
  const occurrenceIndexes = toOccurrenceIndexes(patterns, versions, versionsPoints);
  const toIndexes = (ps: Pattern[]) =>
    ps.map(p => occurrenceIndexes[patterns.indexOf(p)]);
  //return longest most coherent set of aligment segments
  let currentSet = _.clone(patterns);
  let currentRating = getCoherenceRating(toIndexes(currentSet));
  while (currentSet.length > 1) {
    const ratings = currentSet.map(p =>
      getCoherenceRating(toIndexes(_.without(currentSet, p))));
    const max = _.max(ratings);
    if (max > currentRating) {
      currentRating = max;
      currentSet = _.without(currentSet, currentSet[ratings.indexOf(max)]);
    } else return currentSet;
  }
  return currentSet;
}

function getCoherenceRating(occurrenceIndexes: number[][][]) {
  if (occurrenceIndexes.length == 0) return 0;
  const xy = _.zip(...occurrenceIndexes).map(_.flatten);
  const r = new SimpleLinearRegression(xy[0], xy[1]).score(xy[0], xy[1]).r;
  //all unique indexes on both x and y axes
  const minUniqs = Math.min(_.uniq(xy[0]).length, _.uniq(xy[1]).length);
  return Math.pow(minUniqs, 1) * r //heuristic based on indexes and r
}

function removePatternOverlaps(patterns: Pattern[],
    versions: [number, number], versionsPoints: string[][]) {
  let occurrenceIndexes = toOccurrenceIndexes(patterns, versions, versionsPoints);
  occurrenceIndexes = _.reverse(_.sortBy(occurrenceIndexes, o => o[0].length));
  patterns = _.reverse(_.sortBy(patterns, p => p.points.length));
  const xy = [[],[]];
  const toRemove = occurrenceIndexes.map(occs => {
    const existing = _.range(0, occs[0].length).filter(i =>
      occs.some((o,oi) => xy[oi].indexOf(o[i]) >= 0));
    occs.forEach((o,oi) => xy[oi].push(..._.flatten(o)));
    return existing;
  });
  return patterns.map((p,i) => removePointsAt(p, toRemove[i]));
}

function removePointsAt(pattern: Pattern, indexes: number[]) {
  pattern.points = pattern.points.filter((_,i) => indexes.indexOf(i) < 0);
  pattern.occurrences = pattern.occurrences.map(o =>
    o.filter((_,i) => indexes.indexOf(i) < 0));
  return pattern;
}

function toOccurrenceIndexes(patterns: Pattern[], versions: [number, number],
    versionsPoints: string[][]) {
  return patterns.map(p => p.occurrences.map((os,i) => os.map(o =>
    versionsPoints[versions[i]].indexOf(JSON.stringify(o)))));
}

function toMatrix(patterns: Pattern[], versions: [number, number],
    versionsPoints: string[][]) {
  const row = _.fill(new Array(versionsPoints[versions[0]].length), 0);
  const matrix = row.map(m => _.fill(new Array(versionsPoints[versions[1]].length), 0));
  const occIndexes = toOccurrenceIndexes(patterns, versions, versionsPoints);
  occIndexes.forEach(os =>
    _.range(0, os[0].length).forEach(i => matrix[os[0][i]][os[1][i]] = 1));
  return matrix;
}
