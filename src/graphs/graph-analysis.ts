import * as _ from 'lodash';
import { DirectedGraph } from './graph-theory';

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
  maxDistance?: number,
  ratingMethod?: GROUP_RATING,
  condition?: GroupingCondition<NodeType>,
  valueFunction?: (nodes: NodeType[]) => number
}

export interface NodeGroup<NodeType> {
  center: NodeType,
  members: NodeType[], //members include the center
  value: number
}

export function getBestGroup<NodeType>(graph: DirectedGraph<NodeType>,
    options: NodeGroupingOptions<NodeType>) {
  let ratingFunc: (group: NodeGroup<NodeType>) => number;
  if (options.ratingMethod === null || options.ratingMethod === GROUP_RATING.VALUE) {
    ratingFunc = g => g.value;
  } else if (options.ratingMethod === GROUP_RATING.VALUE_AVG) {
    ratingFunc = g => Math.pow(g.value, 1)/g.members.length;
  } else if (options.ratingMethod === GROUP_RATING.INTERNAL) {
    ratingFunc = g => graph.getSubgraph(g.members).getEdges().length;
  } else if (options.ratingMethod === GROUP_RATING.INTERNAL_AVG) {
    ratingFunc = g => graph.getSubgraph(g.members).getEdges().length/g.members.length;
  }
  
  const adjacents = getNodeGroups(graph, options);
  adjacents.sort((a,b) => ratingFunc(b)-ratingFunc(a));
  
  console.log(JSON.stringify(adjacents.slice(0,20).map(a => a.members.length + "/" + ratingFunc(a))));

  console.log(adjacents[0].center, adjacents[0].members.length, ratingFunc(adjacents[0]));
  return adjacents[0];
}

function getNodeGroups<NodeType>(graph: DirectedGraph<NodeType>,
    options: NodeGroupingOptions<NodeType>): NodeGroup<NodeType>[] {
  const nodes = graph.getNodes();
  const adjacents = nodes.map(n =>
    graph.getAdjacents(n, (options.maxDistance || 0), options.condition));
  const valueFunc = options.valueFunction || (n => n.length);
  return nodes.map((n,i) =>({
    center: n,
    members: _.concat([n], adjacents[i]),
    value: valueFunc(_.concat([n], adjacents[i]))
  }));
}