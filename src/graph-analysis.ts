import * as _ from 'lodash';
import { DirectedGraph } from './graph-theory';

export enum GROUP_RATING {
  CONNECTIONS, //most connections to anywhere (largest hubs)
  CONNECTIONS_AVG, //most connections to anywhere per node
  INTERNAL, //most internal connections within group
  VALUE, //highest value
  VALUE_AVG, //highest value per member
}

type GroupingCondition<NodeType> = (n: NodeType, c?: NodeType) => boolean

export interface NodeGroupingOptions<NodeType> {
  maxDistance?: number,
  ratingMethod?: GROUP_RATING,
  condition?: GroupingCondition<NodeType>,
  valueFunction?: (nodes: NodeType[]) => number
}

export interface NodeGroup<NodeType> {
  center: NodeType,
  members: NodeType[], //members don't include center
  value: number
}

export function getBestGroup<NodeType>(graph: DirectedGraph<NodeType>,
    options: NodeGroupingOptions<NodeType>) {
  let ratingFunc: (group: NodeGroup<NodeType>) => number;
  if (!options.ratingMethod || options.ratingMethod === GROUP_RATING.VALUE) {
    ratingFunc = g => g.value;
  } else if (options.ratingMethod === GROUP_RATING.VALUE_AVG) {
    ratingFunc = g => Math.pow(g.value, 1)/g.members.length;
  }
  
  const adjacents = getNodeGroups(graph, options);
  adjacents.sort((a,b) => ratingFunc(b)-ratingFunc(a));

  return _.concat([adjacents[0].center], adjacents[0].members);
}

function getNodeGroups<NodeType>(graph: DirectedGraph<NodeType>,
    options: NodeGroupingOptions<NodeType>): NodeGroup<NodeType>[] {
  const nodes = graph.getNodes();
  let adjacents = nodes.map(n =>
    options.maxDistance ? graph.getAdjacents(n, options.maxDistance) : []);
  if (options.condition) adjacents =
    adjacents.map((a,i) => a.filter(n => options.condition(n, nodes[i])));
  const valueFunc = options.valueFunction || (n => n.length);
  return nodes.map((n,i) =>({
    center: n,
    members: adjacents[i],
    value: valueFunc(_.concat([n], adjacents[i]))
  }));
}