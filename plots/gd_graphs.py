import os, json
import numpy as np
import pandas as pd
from matplotlib import pyplot as plt

def plot(series, legend, title, file, xlabel, ylabel='p'):
    fig, ax = plt.subplots()
    ax.set_title('probabilities of correct classification for '+title)
    [ax.plot(s[0], s[1], '.-', markersize=1) for s in series]
    ax.legend(legend)
    plt.xlabel(xlabel)
    plt.ylabel(ylabel)
    plt.savefig('gdplots/'+file+'.pdf')

results = json.load(open('sweeps7.json'))

results = [r for r in results if r['versionsPerSong'] > 5]

keepers = ['ncd_cosiatec_1dcomp', 'bestgd_sbn', 'bestgd_sbn2', 'bestgd_jaccard_.6',
    'partdivmin_jaccard_.8', 'sizecomp_jaccard2_.8', 'bestgd_jaccard2_.6', 'bestgd_jaccard2_.8']
throwers = ['bestgd_jaccard2_.9', 'jamie_jaccard_.8', 'jamienopart_jaccard_.8', 'nopart_jaccard_.8',
    'nopart_jaccard2_.8', 'div_jaccard2_.8', 'min_jaccard2_.8', 'min0_jaccard2_.8',
    '1d_jaccard2_.8', 'bestgd_sbn', 'bestgd_jaccard_.8', 'jamie_jaccard2_.8',
    'bestgd_jaccard_.6', 'partdivmin_jaccard_.8', 'ncd_cosiatec_1dcompaxis']
rename = {
    'ncd_cosiatec_1dcomp': 'CC COSIATEC',
    'bestgd_jaccard2_.8': 'P CC0 J8 M2',
    'bestgd_jaccard2_.6': 'P CC0 J6 M2',
    'sizecomp_jaccard2_.8': 'P CC J8 M2',
    'partdivmin_jaccard2_.8': 'PDM CC0 J8 M2',
    'bestgd_sbn2': 'P CC0 SB1 M2',
    'bestgd_jaccard_.6': 'P CC0 J6'
}

methods = set([r['method'] for r in results])
grouped = [[r for r in results if r['method'] == m] for m in methods]

kindexes = [i for i,m in enumerate(methods) if m in keepers]
#methods = [m for i,m in enumerate(methods) if i in kindexes]
#grouped = [g for i,g in enumerate(grouped) if i in kindexes]

tindexes = [i for i,m in enumerate(methods) if m in throwers]
methods = [m for i,m in enumerate(methods) if i not in tindexes]
grouped = [g for i,g in enumerate(grouped) if i not in tindexes]

methods = [rename[m] if m in rename else m for m in methods]

def songsPlot(numSongs):
    pairs = [[[r['versionsPerSong'],r['result']['totalRate']]
        for r in g if r['songCount'] == numSongs] for g in grouped]
    legend = [m for i,m in enumerate(methods) if len(pairs[i]) > 0]
    series = [np.transpose(sorted(ps)) for ps in pairs if len(ps) > 0]
    plot(series, legend, str(numSongs)+' songs', 'songs'+str(numSongs), 'number of performances per song')

def versionsPlot(numVersions):
    pairs = [[[r['songCount'],r['result']['totalRate']] for r in g if r['versionsPerSong'] == numVersions] for g in grouped]
    legend = [m for i,m in enumerate(methods) if len(pairs[i]) > 0]
    series = [np.transpose(sorted(ps)) for ps in pairs if len(ps) > 0]
    plot(series, legend, str(numVersions)+' performances', 'versions'+str(numVersions), 'number of songs')

#songsPlot(2)
songsPlot(3)
#songsPlot(5)
#songsPlot(10)
#songsPlot(15)
songsPlot(19)
#versionsPlot(5)
versionsPlot(10)
#versionsPlot(20)
versionsPlot(50)
#versionsPlot(100)