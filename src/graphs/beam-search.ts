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
  
  private BEAM_WIDTH = 1;
  private beam: Solution<T>[] = [];
  
  constructor(private generator: (t: T) => GeneratorOutput<T>[],
    private validator: (t: T) => T, private evaluator: (t: T) => number,
    private extraGenerator?: (t: T) => GeneratorOutput<T>[]) { }
  
  searchFrom(initial: T): Solution<T> {
    this.beam.push({
      value: initial,
      process: [],
      rating: this.evaluator(initial)
    });
    return this.recursiveSearch();
  }
  
  private recursiveSearch(): Solution<T> {
    if (this.searchAndUpdateBeam(this.generator)
        || (this.extraGenerator && this.searchAndUpdateBeam(this.extraGenerator))) {
      return this.recursiveSearch();
    }
    return this.beam[0];
  }
  
  private searchAndUpdateBeam(generator: (t: T) => GeneratorOutput<T>[],
      onlyFirst?: boolean) {
    const input = onlyFirst ? this.beam.slice(0) : this.beam;
    const newSolutions = _.flatten(input.map(s => this.getSolutions(s, generator)));
    const newBeam = _.reverse(
        _.sortBy(_.concat(this.beam, newSolutions), s => s.rating))
      .slice(0, this.BEAM_WIDTH);
    if (_.meanBy(newBeam, b => b.rating) != _.meanBy(this.beam, b => b.rating)) {
      this.beam = newBeam;
      console.log("current best:", _.last(this.beam[0].process),
        this.beam[0].rating, this.beam[0].value.toString());
      return true;
    }
  }
  
  private getSolutions(solution: Solution<T>,
      generator: (t: T) => GeneratorOutput<T>[]): Solution<T>[] {
    //console.log("generating")
    const generated = generator(solution.value);
    //console.log(JSON.stringify(generated.map(g => g.value.toString())));
    //console.log("validating")
    const validated = generated.map(g => this.validator(g.value));
    //console.log(JSON.stringify(validated.map(g => g.toString())));
    //console.log("rating")
    const ratings = validated.map(this.evaluator);
    /*console.log(JSON.stringify(validated[validated.length-4].toString())
      + " " + ratings[ratings.length-4])*/
    return validated.map((v,i) => ({
      value: v,
      process: _.concat(solution.process, generated[i].info),
      rating: ratings[i]
    }));
  }

}