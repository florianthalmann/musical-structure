import * as _ from 'lodash';

interface Solution<T> {
  value: T,
  process: string[],
  rating: number
}

export interface GeneratorOutput<T> {
  value: T,
  info: string
}

export class BeamSearch<T> {
  
  private BEAM_WIDTH = 5;
  private beam: Solution<T>[] = [];
  
  constructor(private generator: (t: T) => GeneratorOutput<T>[],
    private validator: (t: T) => T, private evaluator: (t: T) => number) { }
  
  searchFrom(initial: T): Solution<T> {
    this.beam.push({
      value: initial,
      process: [],
      rating: this.evaluator(initial)
    });
    return this.recursiveSearch();
  }
  
  private recursiveSearch(): Solution<T> {
    const newSolutions = _.flatten(this.beam.map(s => this.getSolutions(s)));
    const newBeam = _.reverse(
        _.sortBy(_.concat(this.beam, newSolutions), s => s.rating))
      .slice(0, this.BEAM_WIDTH);
    console.log(JSON.stringify(newBeam.map(b => b.rating)))
    if (_.meanBy(newBeam, b => b.rating) != _.meanBy(this.beam, b => b.rating)) {
      this.beam = newBeam;
      console.log("current best", this.beam[0].rating, this.beam[0].value.toString());
      return this.recursiveSearch();
    }
    return this.beam[0];
  }
  
  private getSolutions(solution: Solution<T>): Solution<T>[] {
    const generated = this.generator(solution.value);
    const validated = generated.map(g => this.validator(g.value));
    const ratings = validated.map(this.evaluator);
    return validated.map((v,i) => ({
      value: v,
      process: _.concat(solution.process, generated[i].info),
      rating: ratings[i]
    }));
  }

}