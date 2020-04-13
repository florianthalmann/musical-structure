import * as _ from 'lodash';
import { mapSeries } from '../files/util';
import { DataFrame } from './data';

type Config = {};
type Result = {};

export class Experiment {
  
  constructor(private configs: Config[],
    private func: (current: number, total: number) => Promise<Result>) {}
  
  async run(outfile: string) {
    const data = new DataFrame(outfile);
    await mapSeries(this.configs, async (config, index) => {
      const configKeys = Object.keys(config);
      const configValues = Object.keys(config).map(k => config[k]);
      if (!data.hasRow(configValues)) {
        const result = await this.func(index, this.configs.length);
        data.addRow(_.concat(configValues, Object.keys(result).map(k => result[k])),
          _.concat(configKeys, Object.keys(result)));
      }
    });
    data.save();
  }
  
}