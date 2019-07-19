import os, json
import numpy as np
import pandas as pd
from matplotlib import pyplot as plt

def plot(series, legend, title, file, xlabel, ylabel='p'):
    fig, ax = plt.subplots()
    ax.set_title(title)
    [ax.plot(s[0], s[1]) for s in series]
    ax.legend(legend)
    plt.xlabel(xlabel)
    plt.ylabel(ylabel)
    plt.savefig('gdplots/'+file+'.pdf')

results = json.load(open('sweeps.json'))

methods = set([r['method'] for r in results])
grouped = [[r for r in results if r['method'] == m] for m in methods]

def songsPlot(numSongs):
    pairs = [[[r['versionsPerSong'],r['result']['totalRate']]
        for r in g if r['songCount'] == numSongs] for g in grouped]
    legend = [m for i,m in enumerate(methods) if len(pairs[i]) > 1]
    series = [np.transpose(sorted(ps)) for ps in pairs if len(ps) > 1]
    plot(series, legend, str(numSongs)+' songs', 'songs'+str(numSongs), 'number of versions')

def versionsPlot(numVersions):
    pairs = [[[r['songCount'],r['result']['totalRate']] for r in g if r['versionsPerSong'] == numVersions] for g in grouped]
    legend = [m for i,m in enumerate(methods) if len(pairs[i]) > 1]
    series = [np.transpose(sorted(ps)) for ps in pairs if len(ps) > 1]
    plot(series, legend, str(numVersions)+' versions', 'versions'+str(numVersions), 'number of songs')

songsPlot(2)
songsPlot(5)
songsPlot(10)
songsPlot(19)
versionsPlot(10)
versionsPlot(20)
versionsPlot(50)
versionsPlot(100)