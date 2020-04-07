import json
import pandas as pd
from matplotlib import pyplot as plt

path = "results/msa-sweep/_msa-stats.json"

with open(path) as f:
    j = json.load(f)
    data = pd.DataFrame(j['data'], columns=j['columns'])

#data = data.groupby(['song']).mean().plot(kind='box', x='avg state p', y='track p')#.groupby(['iterations']).mean().plot(y='track p')
#data = data.groupby(['song','iterations']).mean()['track p'].unstack().T
#data = data.groupby(['song','iterations']).mean()['avg state p'].unstack().T
data = data.groupby(['model','iterations']).mean()['rating'].unstack().T

#data = data[data['song'] == 'dark_star100j0ml']
#data = data.groupby(['model','edge inertia','dist inertia']).mean()['rating'].unstack().T
data.plot()
#print(data)

plt.show()