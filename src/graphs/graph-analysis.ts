import * as _ from 'lodash';
import { DirectedGraph, Node } from './graph-theory';

export enum GROUP_RATING {
  CONNECTIONS, //most connections to anywhere (largest hubs)
  CONNECTIONS_AVG, //most connections to anywhere per node
  INTERNAL, //most internal connections within group
  INTERNAL_AVG, //most internal connections within group
  VALUE, //highest value
  VALUE_AVG, //highest value per member
}

type GroupingCondition<NodeType> =
  (node: NodeType, others: NodeType[]) => boolean;

export interface NodeGroupingOptions<NodeType> {
  graph?: DirectedGraph<NodeType>,
  maxDistance?: number,
  ratingMethod?: GROUP_RATING,
  condition?: GroupingCondition<NodeType>,
  valueFunction?: (nodes: NodeType[]) => number
}

export interface NodeGroup<NodeType> {
  center: NodeType,
  members: NodeType[], //members include the center
  value: number,
  rating? : number
}

/**
 * approaches tried:
 * - take all best non-overlapping groups -> not all nodes covered
 * - iteratively take best groups (greedy), remove nodes from remaining groups
 *   and recalculate rating -> result has too many groups (due to the candidates
 *   no longer reflecting their composition in the original graph and less
 *   important regions being selected)
 * - iteratively taking best groups with smallest overlaps and deciding for
 *   overlaps where nodes go -> few groups of high equality
 * - best would probably be to iteratively search the graph for new groups,
 *   but much more expensive
 */
export function getPartition<T extends Node>(options: NodeGroupingOptions<T>, greedy = false) {
  let groups = getBestGroups(options);
  
  const best: NodeGroup<T>[] = [];
  let remainingNodes = options.graph.getNodes();
  let remainingGroups = _.clone(groups);
  while (remainingNodes.length > 0) {
    const alreadyThere = getUniqueMembers(best);
    let bestCandidate: NodeGroup<T>;
    if (greedy) {
      //remove nodes in groups selected so far from remaining groups
      //rating used for selection is more accurate
      remainingGroups =
        remainingGroups.map(g => removeNodes(g, alreadyThere, options));
      bestCandidate = _.reverse(_.sortBy(remainingGroups, g => g.rating))[0];
    } else {
      //decide for each node in intersection which group it belongs to
      //nodes may end up belonging to more appropriate groups
      bestCandidate = _.reverse(_.sortBy(remainingGroups, g =>
        _.difference(g.members, alreadyThere).length * g.rating))[0];
      //each node in overlap goes to place with more connections
      const overlap = _.intersection(bestCandidate.members, alreadyThere);
      overlap.forEach(n => {
        const previousBest = best.filter(b => b.members.indexOf(n) >= 0)[0];
        const previousGraph = options.graph.getSubgraph(previousBest.members);
        const candidateGraph = options.graph.getSubgraph(bestCandidate.members);
        if (candidateGraph.getIncidentEdges(n).length
            > previousGraph.getIncidentEdges(n).length) {
          best[best.indexOf(previousBest)] = removeNodes(previousBest, [n], options);
        } else {
          bestCandidate = removeNodes(bestCandidate, [n], options);
        }
      })
    }
    best.push(bestCandidate);
    _.remove(remainingGroups, g => g === bestCandidate);
    remainingNodes = _.difference(remainingNodes, bestCandidate.members);
    //console.log(remainingGroups.length, remainingNodes.length)
  }
  /*console.log("best", best.length);
  console.log("does it cover?", _.flatten(best.map(g => g.members)).length,
    getUniqueMembers(best).length, options.graph.getSize(), _.sum(best.map(g => g.rating)));
  console.log(JSON.stringify(best.map(g => g.rating)));*/
  
  return best;
}

function getUniqueMembers<T extends Node>(groups: NodeGroup<T>[]): T[] {
  return _.uniq(_.flatten(groups.map(g => g.members)));
}

function removeNodes<T extends Node>(group: NodeGroup<T>, nodes: T[],
    options: NodeGroupingOptions<T>): NodeGroup<T> {
  return getNodeGroup(group.center, _.difference(group.members, nodes), options);
}

export function getBestGroups<T extends Node>(options: NodeGroupingOptions<T>) {
  let groups = getNodeGroups(options);
  //console.log("total groups", groups.length)
  
  //merge groups where ratings and members identical
  let byRating = _.groupBy(groups, g => g.rating);
  byRating = _.mapValues(byRating, gs =>
    _.uniqBy(gs, g => _.sortBy(g.members.map(n => n.id)).toString()));
  groups = _.flatten(_.values(byRating));
  //console.log("unique groups", groups.length, "ratings", _.values(byRating).length);
  //console.log("nodes in groups", getUniqueMembers(groups).length, _.uniqBy(graph.getNodes(), n => n.id).length)
  
  groups.sort((a,b) => b.rating-a.rating);
  /*groups.slice(0, 10).forEach(g =>
    console.log(g.center, g.members.length, ratingFunc(g)));*/
  return groups;
}

//returns true if the two given sets have the same members
function equalSets<T>(s1: T[], s2: T[]) {
  return _.union(s1, s2).length === s1.length;
}

function getNodeGroups<T>(options: NodeGroupingOptions<T>): NodeGroup<T>[] {
  const nodes = options.graph.getNodes();
  const adjacents = nodes.map(n =>
    options.graph.getAdjacents(n, (options.maxDistance || 0), options.condition));
  return nodes.map((n,i) =>
    getNodeGroup(n, _.concat([n], adjacents[i]), options));
}

function getNodeGroup<T>(center: T, members: T[], options: NodeGroupingOptions<T>): NodeGroup<T> {
  const valueFunc = options.valueFunction || (n => n.length);
  const ratingFunc = getRatingFunction(options);
  const group: NodeGroup<T> = {
    center: center, members: members, value: valueFunc(members) };
  group.rating = ratingFunc(group);
  return group;
}

function getRatingFunction<T extends Node>(options: NodeGroupingOptions<T>): (group: NodeGroup<T>) => number {
  let ratingFunc: (group: NodeGroup<T>) => number;
  if (options.ratingMethod === null || options.ratingMethod === GROUP_RATING.VALUE) {
    ratingFunc = g => g.value;
  } else if (options.ratingMethod === GROUP_RATING.VALUE_AVG) {
    ratingFunc = g => Math.pow(g.value, 1)/g.members.length;
  } else if (options.ratingMethod === GROUP_RATING.INTERNAL) {
    ratingFunc = g => options.graph.getSubgraph(g.members).getEdges().length || 0;
  } else if (options.ratingMethod === GROUP_RATING.INTERNAL_AVG) {
    ratingFunc = g => options.graph.getSubgraph(g.members).getEdges().length/g.members.length;
  }
  return ratingFunc;
}