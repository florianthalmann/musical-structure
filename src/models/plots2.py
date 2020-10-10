import json
import numpy as np
import pandas as pd
from matplotlib import pyplot as plt

path = "results/msa-sweep-beats-paper/"
file = "_stats-beats.json"

with open(path+file) as f:
    j = json.load(f)
    data = pd.DataFrame(j['data'], columns=j['columns'])
    data['song'] = data['song'].astype('str')
    print(data.dtypes)
    data['flankProb'].fillna(0, inplace=True)

data['originalProd'] = data['originalSeq'] * data['originalGround']
data['tlGraphProd'] = data['tlGraphSeq'] * data['tlGraphGround']
#ata['originalUltimate'] = data['rating'] * data['originalGround']
#data['graphUltimate'] = data['rating'] * data['originalGround']

#data['features'] = data['song'].str[data['song'].str.index('0'):]

data['features'] = data['song'].str.slice(-7)
data['song'] = data['song'].str.slice(0,-7)


data = data[data['song'] != "brokedown_palace"]
data = data[data['song'] != "friend_of_the_devil"]
data = data[data['song'] != "mountains_of_the_moon"]
data = data[data['song'] != "west_l.a._fadeaway"]
#data = data[data['song'] == "brokedown_palace100g0mb"]
#data = data[data['song'] == "casey_jones100g0mb"]
#data = data[data['song'] == "cosmic_charlie100g0mb"]
#data = data[data['song'] == "china_cat_sunflower100g0mb"]
#data = data[data['song'] == "china_doll100g0mb"]
#data = data[data['song'] == "cumberland_blues100g0mb"]
#data = data[data['song'] == "dancin'_in_the_street100g0mb"]
#data = data[data['song'] == "estimated_prophet100g0mb"]
#data = data[data['nLongest'] == 10]
#data = data[data['model'] == "ProfileHMM"]
data = data[data['modelLength'] == "median"]
data = data[data['flankProb'] == 0]
data = data[data['iterations'] == 1]
#data = data[data['edgeInertia'] == 0.95]
data = data[data['distInertia'] == 0.8]
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
#data.boxplot(column=['graphGround'], by='iterations')
def songComp():
    global data
    data = data[data['maskThreshold'] == 0.3]
    data.boxplot(column=['originalGround'], by=['song'])
    plt.xticks(rotation='vertical')
    plt.tight_layout()

def paramComp():
    global data
    data.boxplot(column=['tlGraphGround'], by=['numConns','maskThreshold','nLongest','features'])
    plt.xticks(rotation='vertical')
    plt.tight_layout()

def groundComp():
    global data
    data = data[data['numConns'] == 1]
    data = data[data['maskThreshold'] == 0.2]
    data = data[data['nLongest'] == 10]
    data.boxplot(column=['originalGround','tlModesGround','tlGraphGround','msaGround','graphGround'])

def paperPlot1():
    global data
    data = data[data['numConns'] == 1]
    data = data[data['maskThreshold'] == 0.2]
    data = data[data['nLongest'] == 10]
    data.boxplot(column=['originalGround','tlGraphGround','originalSeq','tlGraphSeq','originalProd','tlGraphProd'])

def paperPlot2():
    global data
    data = data[data['numConns'] == 1]
    data = data[data['maskThreshold'] == 0.2]
    data = data[data['nLongest'] == 10]
    fig = plt.figure(figsize=(2, 1.5), dpi=100)
    data.boxplot(column=['originalGround','tlGraphGround','graphGround'])#,'originalSeq','tlGraphSeq','graphSeq'])
    ax = plt.gca()
    ax.set_xticklabels(['(a)','(b)','(c)','(d)','(e)','(f)'])
    plt.tight_layout()

def paperValues():
    global data
    data = data[data['numConns'] == 1]
    data = data[data['maskThreshold'] == 0.2]
    data = data[data['nLongest'] == 10]
    print(data['originalGround'].mean())
    print(data['tlModesGround'].mean())
    print(data['tlGraphGround'].mean())
    print(data['originalSeq'].mean())
    print(data['tlModesSeq'].mean())
    print(data['tlGraphSeq'].mean())
    print('---')
    print(data['msaGround'].mean())
    print(data['graphGround'].mean())
    print(data['graphSeq'].mean())

#last try: 10/20, .1

#paramComp()
paperValues()
#groundComp()


paperPlot2()

plt.tight_layout()
plt.savefig('/Users/flo/Downloads/result4.pdf', facecolor='white', edgecolor='none')
#plt.show()