import json
import pandas as pd
from matplotlib import pyplot as plt

path = "results/msa-sweep-beats-full/"
file = "_stats-beats.json"

with open(path+file) as f:
    j = json.load(f)
    data = pd.DataFrame(j['data'], columns=j['columns'])
    print(data.dtypes)

data['ultimate'] = data['rating'] * data['prodP']

#best for china_doll
#data = data[data['song'] == "estimated_prophet100g0mb"]
#data = data[data['song'] == "casey_jones100g0mb"]
#data = data[data['song'] == "cosmic_charlie100g0mb"]
#data = data[data['song'] == "china_doll100g0mb"]
#data = data[data['model'] == "ProfileHMM"]
#data = data[data['modelLength'] == "median"]
data = data[data['iterations'] == 1]
#data = data[data['edgeInertia'] == 0.8]
#data = data[data['distInertia'] == 0.8]
data = data[data['matchMatch'] == 0.999]
data = data[data['deleteInsert'] == 0.01]


#data = data.groupby(['song']).mean().plot(kind='box', x='avg state p', y='track p')#.groupby(['iterations']).mean().plot(y='track p')
#data = data.groupby(['song','iterations']).mean()['track p'].unstack().T
#data = data.groupby(['song','iterations']).mean()['avg state p'].unstack().T
#data.groupby(['deleteInsert']).mean()['rating'].T.plot()
#data.groupby(['matchMatch']).mean()['trackP'].T.plot(legend=True)
#data.groupby(['distInertia']).max()['rating'].T.plot(legend=True)
#data.groupby(['distInertia']).max()['prodP'].T.plot(legend=True)
#data.groupby(['distInertia']).max()['ultimate'].T.plot(legend=True)
#data.boxplot(column=['rating'], by='edgeInertia')
#data.boxplot(column=['prodP'], by='iterations')
data.boxplot(column=['prodP'], by='modelLength')

#data = data[data['song'] == 'dark_star100j0ml']
#data = data.groupby(['model','edge inertia','dist inertia']).mean()['rating'].unstack().T
#print(data)

#plt.savefig(path+'stats-3songs-distInertia.pdf', facecolor='white', edgecolor='none')
plt.show()