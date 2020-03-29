import os, json, sys
import numpy as np
from matplotlib import pyplot as plt
import seaborn as sns
from glob import glob
#sns.set()

def plot_matrix(matrix, path):
    if not os.path.exists(path):
        #matrix = np.sqrt(matrix)
        # mask = np.copy(matrix)
        # for i in range(len(mask)):
        #     mask[i][i] = i*3
        #     for j in range(i+1, len(mask[0])):
        #         mask[i][j] = max(i*3-(j-i), 0)
        #         mask[j][i] = max(i*3-(j-i), 0)
        # matrix = np.subtract(matrix, mask)

        #mask2 = np.vectorize(lambda x: x if x > 17 else 0)
        #masked = mask2(matrix)
        if (len(matrix) > 0):
            g = sns.heatmap(matrix, xticklabels=False, yticklabels=False, cmap=sns.cm.rocket_r)
            fig = g.get_figure()
            fig.savefig(path)
            fig.clf()

def plot(paths, sw_segment=False, sw_score=False, multi=False, format='.png'):
    for path in paths:
        target_path = path.replace('.json', str(sw_segment)[:1]+format);
        with open(path) as ofile:
            loaded = json.load(ofile)
            if sw_segment: loaded = loaded['segmentMatrix']
            if sw_score: loaded = loaded['matrices'][0]['scoreMatrix']
            matrix = np.array(loaded) if not multi else [np.array(l) for l in loaded]
        if multi:
            [plot_matrix(np.array(m), target_path.replace(format,str(i)+format))
                for i,m in enumerate(loaded)]
        else:
            plot_matrix(np.array(loaded), target_path)

# print mask2(np.amax(matrix,0))
# g = sns.tsplot(np.amax(matrix,0), color=sns.cubehelix_palette())
# g.patch.set_facecolor('white')
# plt.savefig('sw_nodia_77-05-08.pdf')

basedir = sys.argv[1] #'server/lib/output/jack57-nonit/'
paths = [y for x in os.walk(basedir) for y in glob(os.path.join(x[0], '*.json'))]
plot([p for p in paths if 'matrix' in p])
plot([p for p in paths if 'sw_' in p], sw_segment=True)
plot([p for p in paths if 'sw_' in p], sw_score=True)
plot([p for p in paths if '-ssm' in p], multi=True)
plot([p for p in paths if '-sssm' in p])
