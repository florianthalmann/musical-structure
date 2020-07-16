import * as _ from 'lodash';
import { mapSeries, updateStatus } from '../files/util';
import { DataFrame } from './data';

type Config = {};
type Result = {};

export class Experiment {
  
  constructor(private name: string, private configs: Config[],
    private func: (currentIndex: number) => Promise<Result>) {}
  
  async run(outfile: string) {
    const data = new DataFrame(outfile);
    await mapSeries(this.configs, async (config, index) => {
      updateStatus(this.name+" "+(index+1)+" of "+this.configs.length);
      const configKeys = Object.keys(config);
      const configValues = Object.keys(config).map(k => config[k])
        .map(o => this.toStringIfNeeded(o));
      if (!data.hasRow(configValues)) {
        const result = await this.func(index);
        data.addRow(_.concat(configValues, Object.keys(result).map(k => result[k])),
          _.concat(configKeys, Object.keys(result)));
        data.save();
      }
    });
  }
  
  private toStringIfNeeded(value: any) {
    if (value != null) {
      if (!isNaN(value) || value.toString() === value) return value;
      if (value.name) return value.name;
      const string = JSON.stringify(value);
      if (string.indexOf('null') >= 0) return value.toString();
      return string;
    }
  }
  
}