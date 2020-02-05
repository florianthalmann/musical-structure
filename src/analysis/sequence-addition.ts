import * as _ from 'lodash';
import { DirectedGraph } from '../graphs/graph-theory';
import { GroupingCondition, GROUP_RATING, getBestGroups,
  removeGroupAndNodes } from '../graphs/graph-analysis';
import { GraphPartition } from '../graphs/graph-partition';
import { GeneratorOutput } from '../graphs/beam-search';
import { SegmentNode, AddSegmentsOptions } from './types';

//adds new segments at the appropriate position in time
export function addNewSegments(sequence: GraphPartition<SegmentNode>,
    options: AddSegmentsOptions): GeneratorOutput<GraphPartition<SegmentNode>> {
  
  sequence = sequence.clone();
  const partitions = sequence.getPartitions();
  const maxSegSize = _.max(partitions.map(t => t.length));
  const missing = _.differenceBy(sequence.getGraph().getNodes(), _.flatten(partitions), n => n.id);
  const graphOfMissing = sequence.getGraph().getSubgraph(missing);
  //console.log("graph", graphOfMissing.getSize(), graphOfMissing.getEdges().length);
  
  let additions: SegmentNode[][];
  let info: string;
  
  if (options.indexNeighborSearch) {
    info = "quickly got neighboring segments "
    additions = getNeighboringGraphSegmentsForSequence(partitions, graphOfMissing,
      options.minSizeFactor, options.maxNumSegments);
  }
  
  if (options.graphAdjacentsSearch) {
    info = "searched graph for adjacents "
    additions = getBestIndexBasedPartition(graphOfMissing,
        options.groupingCondition, options.maxNumSegments)
      .filter(s => maxSegSize ? s.length > maxSegSize/options.minSizeFactor : s);
  }
  
  if (options.graphBestRatedSearch) {
    info = "searched graph for best rated "
    additions = getBestDisjunctPartition(graphOfMissing, options.groupingCondition,
      maxSegSize/options.minSizeFactor, options.maxNumSegments);
  }
  
  info += JSON.stringify(additions.map(a => a.length));
  
  //maybe simple recalculation of matrix is quicker.... check!
  const sorted = sortPartitionsTemporally(_.concat(partitions, additions));
  const indexes = additions.map(a => sorted.indexOf(a));
  const zipped = _.sortBy(_.zip(additions, indexes), ([_a,i]) => i);
  zipped.forEach(([a,i]) => sequence.insertPartition(a, i));
  //console.log(JSON.stringify(sequence.getPartitions().map(a => a.length)));
  
  return {value: sequence, info: info};
}

//quick and dirty successive groups, not disjunct
/*function getSuccessiveGroups(graph: DirectedGraph<SegmentNode>,
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
  console.log(JSON.stringify(numSucc));*
  
  let sequence = sortPartitionsTemporally(_.concat(existingSeq, groups.map(g => g.members)));
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
}*/

function getBestDisjunctPartition(graph: DirectedGraph<SegmentNode>,
    groupingCondition: GroupingCondition<SegmentNode>, minSize: number,
    count = Infinity) {
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
  while (lastAdded && remainingGroups.length > 0 && sequence.length < count) {
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

function getBestIndexBasedPartition(graph: DirectedGraph<SegmentNode>,
    groupingCondition: GroupingCondition<SegmentNode>, count?: number) {
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
  while (lastAdded && (!count || sequence.length < count)) {
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

//successors in time! (not graph)
function getDirectSuccessors(before: SegmentNode[], after: SegmentNode[]) {
  return after.filter(a => before.filter(b => b.version === a.version)
    .some(b => b.time+1 === a.time));
}

function getNeighboringGraphSegmentsForSequence(sequence: SegmentNode[][],
    graph: DirectedGraph<SegmentNode>, minSizeFactor: number, count?: number) {
  let addition: SegmentNode[][] = [];
  let lastAdded = sequence;
  let numLastAdded = Infinity;
  while (numLastAdded && (!count || addition.length < count)) {
    const succ = lastAdded.map(t => t.map(n => graph.getNodes()
      .find(m => m.version === n.version && m.time === n.time+1)).filter(m=>m));
    const pred = lastAdded.map(t => t.map(n => graph.getNodes()
      .find(m => m.version === n.version && m.time === n.time-1)).filter(m=>m));
    const succGs = succ.map(s => graph.getSubgraph(s).pruneIsolatedNodes().getNodes())
      .filter(s => s.length > 1);
    const predGs = pred.map(p => graph.getSubgraph(p).pruneIsolatedNodes().getNodes())
      .filter(p => p.length > 1);
    let max = _.max(sequence.map(t => t.length));
    lastAdded = _.concat(predGs, succGs).filter(s => s.length > max/minSizeFactor);
    numLastAdded = lastAdded.length;
    if (numLastAdded) {
      addition.push(...lastAdded);
      //numLastAdded = 0; //(REVERT TO JUST ADDING SOME PER ITERATION)
      graph = graph.getSubgraph(_.difference(graph.getNodes(), _.flatten(addition)));
    }
  }
  return addition;
}

//modifies the given array
function sortPartitionsTemporally(components: SegmentNode[][]) {
  //new sorting method based on common versions!!
  components.sort((a,b) => {
    const versions = _.intersection(a.map(n => n.version), b.map(n => n.version));
    const aversions = versions.map(v => a.find(n => n.version == v));
    const bversions = versions.map(v => b.find(n => n.version == v));
    return Math.sign(_.sum(aversions.map((a,i) => a < bversions[i] ? -1 : 1)));
    //return _.mean(aversions.map(n => n.time)) < _.mean(bversions.map(n => n.time)) ? -1 : 1
  });
  return components;
}

//this method is slow....
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

function getFirstPositions(nodes: SegmentNode[], count = 1) {
  const result: SegmentNode[] = [];
  let remaining = nodes;
  _.range(0,count).forEach(i_ => {
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