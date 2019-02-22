#!/usr/bin/env python
# coding: utf-8

# In[1]:


import os, json
import numpy as np
import pandas as pd

BASE = '../results/salami/'

dirs = [os.path.join(BASE, d) for d in os.listdir(BASE) if d != '.DS_Store']
files = [os.path.join(d, f) for d in dirs for f in os.listdir(d) if f.endswith('.json')]
jsons = [json.load(open(f)) for f in files]

def aggregate_vals(dict, key, func):
    vs = [v[key] for _, v in dict.iteritems() if v[key] is not None]
    return func(vs) if len(vs) > 0 else None

def json_to_series(json, field, func):
    results = [(int(t), aggregate_vals(r, field, func)) for t, r in json.iteritems()]
    results.sort(key = lambda r: r[0])
    tracks, values = zip(*results)
    return pd.Series(values, index=tracks)

def jsons_to_df(jsons, field, func):
    return pd.concat([json_to_series(j, field, func) for j in jsons], axis=1).T

def get_configs_df(files):
    fields = [f[f.index('salami/')+7 : f.index('.json')] for f in files]
    params = [f.split('/')[1].split('_') for f in fields]
    configs = [
        ['features', [f.split('/')[0] for f in fields]],
        ['optim_methods', [p[0] for p in params]],
        ['optim_dim', [int(p[1]) for p in params]],
        ['min_length', [int(p[2]) for p in params]],
        ['overlapping', [bool(p[3]) for p in params]],
        ['num_patterns', [int(p[4]) if len(p) > 4 else 0 for p in params]],
    ]
    return pd.DataFrame([c[1] for c in configs], index=[c[0] for c in configs]).T

configs = get_configs_df(files)
mean_precs = jsons_to_df(jsons, 'precision', np.mean)
mean_accs = jsons_to_df(jsons, 'accuracy', np.mean)
max_precs = jsons_to_df(jsons, 'precision', np.max)
max_accs = jsons_to_df(jsons, 'accuracy', np.max)

fe = configs['features']
om = configs['optim_methods']
od = configs['optim_dim']
ml = configs['min_length']
ov = configs['overlapping']
np = configs['num_patterns']


# # johanbars with different optimizations
# 
# best results with partitioning, and partitioning and minimizing

# In[2]:


get_ipython().magic(u'matplotlib notebook')
from matplotlib import pyplot as plt
#plt.rcParams['figure.figsize'] = [12, 9]

selection = configs.loc[(fe == 'johanbars') & (np == 0) & (ml == 1)]
fig, ax = plt.subplots()
mean_precs.iloc[selection.index.tolist()].T.boxplot()
ax.set_title('johanbars by optimization method')
ax.set_xticklabels(selection['optim_methods']);


# # partitioned johanbars with different pattern restrictions
# 
# min length has no longer an effect when num patterns is restricted (top patterns are all long)
# 
# thus maybe always do min length = 3. num patterns says how good the top patterns are

# In[3]:


selection = configs.loc[(fe == 'johanbars') & (om == '2')]
fig, ax = plt.subplots()
mean_precs.iloc[selection.index.tolist()].T.boxplot()
ax.set_title('partitioned johanbars by num patterns and min length')
ax.set_xticklabels([str(a)+' '+str(b) for (a,b) in zip(np, ml)]);


# # different subsets of best cosiatec patterns
# 
# even 5 best patterns in johanbars with partitioning much better than other or no optimizations

# In[4]:


selection = configs.loc[(fe == 'johanbars') & (ml == 3)]
fig, ax = plt.subplots()
mean_precs.iloc[selection.index.tolist()].T.boxplot()
ax.set_title('johanbars by optim method and num patterns')
ax.set_xticklabels([str(a)+' '+str(b) for (a,b) in zip(om, np)]);


# # chroma triads, tetrachords, clusters, and mfcc added
# 
# chroma triads always better than unoptimized johanchords
# 
# best:
# - partitioned johanchords
# - partitioned and minimized johanchords
# - partitioned chroma triads

# In[5]:


selection = configs.loc[(ml == 3) & (om.isin(['2'])) & (np == 0)]
fig, ax = plt.subplots()
mean_precs.iloc[selection.index.tolist()].T.boxplot()
ax.set_title('johanbars by optim method and num patterns')
ax.set_xticklabels([str(a)+' '+str(b) for (a,b) in zip(fe, om)], rotation=60);


# # see if same tracks best when optimized
# 
# partitioned vs non-optimized

# In[6]:


def add_scatter(selection, ax, label):
    two = mean_precs.iloc[selection].T
    ax.scatter(two[selection[1]], two[selection[0]])
    ax.plot(ax.get_xlim(), ax.get_xlim(), ls='--')
    ax.set_xlabel(configs.T[selection[1]][label])
    ax.set_ylabel(configs.T[selection[0]][label])

fig, ax = plt.subplots(2,2)

selection = configs.loc[(fe == 'johanbars') & (ml == 3) & (om.isin(['','2'])) & (np == 0)].index.tolist()
add_scatter(selection, ax[0,0], 'optim_methods')

selection = configs.loc[(fe == 'johanbars') & (ml == 3) & (om.isin(['','1'])) & (np == 0)].index.tolist()
add_scatter(selection, ax[0,1], 'optim_methods')

selection = configs.loc[(fe == 'johanbars') & (ml == 3) & (om.isin(['','0'])) & (np == 0)].index.tolist()
add_scatter(selection, ax[1,0], 'optim_methods')

selection = configs.loc[(fe == 'johanbars') & (ml == 3) & (om.isin(['0','1'])) & (np == 0)].index.tolist()
add_scatter(selection, ax[1,1], 'optim_methods')


# # compare best results with chroma triads and johanchords
# 
# some tracks work better with chroma, some with johanchords!!

# In[7]:


fig, ax = plt.subplots()

selection = configs.loc[(fe.isin(['johanbars', 'chroma3bars'])) & (ml == 3)
                        & (om.isin(['2'])) & (np == 0)].index.tolist()
add_scatter(selection, ax, 'features')


# In[ ]:




