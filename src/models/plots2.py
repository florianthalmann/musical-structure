import json
import pandas as pd
from matplotlib import pyplot as plt

path = "results/msa-sweep3/stats.json"

with open(path) as f:
    j = json.load(f)
    data = pd.DataFrame(j['data'], columns=j['columns'])
    print(data.dtypes)

data = data[data['model'] == "ProfileHMM"]
#data = data[data['iterations'] == 1]


#data = data.groupby(['song']).mean().plot(kind='box', x='avg state p', y='track p')#.groupby(['iterations']).mean().plot(y='track p')
#data = data.groupby(['song','iterations']).mean()['track p'].unstack().T
#data = data.groupby(['song','iterations']).mean()['avg state p'].unstack().T
#data.groupby(['deleteInsert']).mean()['rating'].T.plot()
#data.groupby(['deleteInsert']).mean()['trackP'].T.plot()
data.boxplot(column=['rating'], by='deleteInsert')

#data = data[data['song'] == 'dark_star100j0ml']
#data = data.groupby(['model','edge inertia','dist inertia']).mean()['rating'].unstack().T
#print(data)

plt.show()