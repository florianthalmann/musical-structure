import json
#import numpy as np
from matplotlib import pyplot as plt
from sklearn.manifold import MDS
import seaborn as sns

def getMDS(dists):
    mds = MDS(n_components=2, dissimilarity="precomputed", random_state=6)
    results = mds.fit(dists)
    return results.embedding_

def plotMDSScatter(dists, title, saveFile):
    coords = getMDS(dists)
    fig = plt.figure()
    plt.title(title)
    plt.scatter(coords[:, 0], coords[:, 1], marker = 'o')
    fig.patch.set_facecolor('white')
    for label, x, y in zip(range(len(dists)), coords[:, 0], coords[:, 1]):
        plt.annotate(label, (x, y))
    plt.savefig(saveFile, facecolor='white', edgecolor='none')
    #plt.show()

dists = json.load(open('d3/graphs_jo4_min3/bestgd_jaccard_.8_1_555-dists.json'))
plotMDSScatter(dists, 'MDS scatter of Performances of Cosmic Charlie', 'gdplots/mds-cosmiccharlie2.pdf')

# class ClusterPlotter():
# 
#     def plotDendrogram(self, featureMatrix, title, saveFile):
#         Z = linkage(featureMatrix, 'ward')
#         fig = plt.figure()
#         plt.title(title)
#         plt.xlabel('version')
#         plt.ylabel('distance')
#         fig.patch.set_facecolor('white')
#         dendrogram(Z)
#         plt.savefig(saveFile, facecolor='white', edgecolor='none')
#         #plt.show()
# 
#     def plotMDSScatter(self, featureMatrix, title, saveFile):
#         coords = self.getMDS(featureMatrix)
#         fig = plt.figure()
#         plt.title(title)
#         plt.scatter(coords[:, 0], coords[:, 1], marker = 'o')
#         fig.patch.set_facecolor('white')
#         for label, x, y in zip(range(len(featureMatrix)), coords[:, 0], coords[:, 1]):
#             plt.annotate(label, (x, y))
#         plt.savefig(saveFile, facecolor='white', edgecolor='none')
#         #plt.show()
# 
#     def plotMDSLines(self, featureMatrices, title, saveFile):
#         lines = np.empty([featureMatrices.shape[1], featureMatrices.shape[0], 2])
#         for i in range(len(featureMatrices)):
#             coords = self.getMDS(featureMatrices[i])
#             for j in range(len(coords)):
#                 lines[j][i] = coords[j]
#         fig = plt.figure()
#         plt.title(title)
#         for line in lines:
#             plt.plot(line[:, 0], line[:, 1])
#         fig.patch.set_facecolor('white')
#         #for label, x, y in zip(range(len(features)), coords[:, 0], coords[:, 1]):
#             #plt.annotate(label, (x, y))
#         plt.savefig(saveFile, facecolor='white', edgecolor='none')
#         #plt.show()
# 
#     def getFeatures(self, feature, featuresfolder, starts, ends):
#         if not hasattr(self,'reader') or self.reader.folder != featuresfolder:
#             self.reader = JamsFeatureReader(featuresfolder)
#         features = []
#         for i in range(len(starts)):
#             #print starts[i], ends[i]
#             matrix = self.reader.getFeatureMatrixSegmentAvgAndVar(feature, starts[i], ends[i])
#             if matrix is not None and len(matrix) > 0:
#                 features.append(matrix)
#         return np.array(features)
# 
#     def getMDS(self, featureMatrix, dist=None):
#         if dist is None:
#             dist = 1-cosine_similarity(featureMatrix)
#         mds = MDS(n_components=2, dissimilarity="precomputed", random_state=6)
#         results = mds.fit(dist)
#         return results.embedding_
# 
#     def normalize(self, features):
#         for i in range(len(features)):
#             for j in range(len(features[i])):
#                 features[i][j] = features[i][j] / features[i][j].max()
#         return features
# 
#     def plotMatrixHeat(self, matrix, path):
#         f, ax = plt.subplots(figsize=(11, 9))
# 
#         # Generate a custom diverging colormap
#         cmap = sns.diverging_palette(220, 10, as_cmap=True)
# 
#         # Draw the heatmap with the mask and correct aspect ratio
#         g = sns.heatmap(matrix, cmap=cmap, vmax=matrix.max(),
#                     square=True, xticklabels=5, yticklabels=5,#xticklabels=[-5,-4,-3,-2,-1,0,1,2,3,4,5,6,7], yticklabels=[0,1,2,3,4,5,6,7,8,9],
#                     linewidths=.5, cbar_kws={"shrink": .5}, ax=ax)
#         #g.set(xlabel="segment duration "+r"$2^\sigma$", ylabel="number of segments "+r"$2^\rho$")
#         plt.savefig(path)
# 
#     def getAvgDistances(self, feature, featuresfolder, starts, ends, outfile=None):
#         features = self.getFeatures(feature, featuresfolder, starts, ends)
#         if outfile:
#             current_palette = sns.color_palette()
#             sns.palplot(sns.color_palette("Blues"))
#             self.plotMatrixHeat(features[0], outfile+"_ex_features.pdf")
#             sns.palplot(current_palette)
#         dist = np.zeros([features.shape[1], features.shape[1]])
#         for matrix in features:
#             dist += 1 - cosine_similarity(matrix)
#         dist /= features.shape[0]
#         if outfile:
#             self.plotMatrixHeat(dist, outfile+"_distances.pdf")
#         return dist
# 
#     def createLinesWithScatters(self, feature, featuresfolder, outfolder, starts, ends):
#         features = self.getFeatures(feature, featuresfolder, starts, ends)
#         title = feature+" of Looks Like Rain on 1982-10-10"
#         self.plotMDSLines(features, title, outfolder+feature+"_mds_mul.png")
#         self.plotMDSScatter(reader.getFeatureMatrixSegment(feature, starts[0], ends[0]), title, outfolder+feature+"_mds_early.png")
#         self.plotMDSScatter(reader.getFeatureMatrixSegment(feature, starts[int(features.shape[0]/2)], ends[int(features.shape[0]/2)]), title, outfolder+feature+"_mds_medium.png")
#         self.plotMDSScatter(reader.getFeatureMatrixSegment(feature, starts[features.shape[0]-1], ends[features.shape[0]-1]), title, outfolder+feature+"_mds_late.png")
# 
#     def plotAverageMDS(self, feature, featuresfolder, outfile, starts, ends):
#         #title = feature+" of Looks Like Rain on 1982-10-10"
#         labels = JamsFeatureReader(featuresfolder).getLabels()
# 
#         dists = self.getAvgDistances(feature, featuresfolder, starts, ends, outfile)
#         with open(outfile+"_dists.json", 'w') as distfile:
#             json.dump(dists.tolist(), distfile)
# 
#         coords = self.getMDS(feature, dists)
#         with open(outfile+"_mds.json", 'w') as distfile:
#             json.dump(coords.tolist(), distfile)
# 
#         fig = plt.figure(figsize=(8.0, 6.0))
#         #plt.title(title)
#         plt.plot(coords[:, 0], coords[:, 1], marker = 'o', lw=0)
#         fig.patch.set_facecolor('white')
#         for label, x, y in zip(labels, coords[:, 0], coords[:, 1]):
#             plt.annotate(label, (x, y))
#         plt.savefig(outfile+".pdf", facecolor='white', edgecolor='none')
# 
#         return dists
# 
#     def createStridePlot(self, pointcount, feature, outfolder):
#         starts = np.linspace(50, 100, num=pointcount, endpoint=False)
#         ends = starts+400
#         self.createLinesWithScatters(feature, outfolder, starts, ends)
# 
#     def createZoomPlot(self, pointcount, feature, outfolder):
#         starts = np.linspace(50, 250, num=pointcount, endpoint=False)
#         ends = np.full((pointcount), 250)
#         self.createLinesWithScatters(feature, outfolder, starts, ends)
# 
#     def createSingleLevelPlot(self, numsegments, segmentlength, feature, featurefolder, outfile):
#         starts = []
#         ends = []
#         starts = np.linspace(50, 450, num=numsegments, endpoint=True)
#         ends = starts+segmentlength
#         self.plotAverageMDS(feature, featurefolder, outfile, starts, ends)
# 
#     def createMultilevelAveragePlot(self, pointsperlevel, numlevels, feature, featurefolder, outfile):
#         starts = []
#         ends = []
#         levels = np.logspace(-1, 8, num=numlevels, base=2, endpoint=True)
#         for level in levels:
#             s = np.linspace(50, 450, num=pointsperlevel, endpoint=True)
#             starts.append(s)
#             ends.append(s+level)
#         starts = np.resize(starts, (pointsperlevel*numlevels))
#         ends = np.resize(ends, (pointsperlevel*numlevels))
#         self.plotAverageMDS(feature, featurefolder, outfile, starts, ends)
# 
#     def writeJson(self, list, path):
#         with open(path, 'w') as file:
#             json.dump(list, file)
# 
#     def saveSegmentAnalysis(self, feature, featuresfolder, outfolder):
#         numsegments = np.logspace(0, 9, base=2, num=10, endpoint=True)
#         segmentlengths = np.logspace(-5, 7, base=2, num=13, endpoint=True)
#         dist = {"numsegments":numsegments.tolist(),"segmentlengths":segmentlengths.tolist(),"distances":[]}
#         for i in range(len(numsegments)):
#             current_dist = []
#             for j in range(len(segmentlengths)):
#                 starts = np.linspace(50, 450, num=numsegments[i], endpoint=True)
#                 ends = starts+segmentlengths[j]
#                 distances = self.getAvgDistances(feature, featuresfolder, starts, ends)
#                 current_dist.append(distances.tolist())
#                 print "segments:", numsegments[i], "lengths (sec):", segmentlengths[j]
#             dist["distances"].append(current_dist)
#         self.writeJson(dist, outfolder+"dist.json")
# 
#     def saveSegmentAnalysisAndPlots(self, feature, featuresfolder, outfolder):
#         refduration = int(JamsFeatureReader(featuresfolder).getFeatureMatrix("match")[0][-1][0])
#         print refduration
#         #numsegments = np.logspace(0, 7, base=2, num=8, endpoint=True)
#         #segmentlengths = np.logspace(-4, 5, base=2, num=10, endpoint=True)
#         numsegments = np.array([128])
#         segmentlengths = np.array([0.5])
#         dist = {"numsegments":numsegments.tolist(),"segmentlengths":segmentlengths.tolist(),"distances":[]}
#         for i in range(len(numsegments)):
#             current_dist = []
#             for j in range(len(segmentlengths)):
#                 print "segments:", numsegments[i], "lengths (sec):", segmentlengths[j]
#                 starts = np.linspace(20, refduration-20, num=numsegments[i], endpoint=True)
#                 ends = starts+segmentlengths[j]
#                 outfile = outfolder+feature+"_mds_"+str(numsegments[i])+"*"+str(segmentlengths[j])+"sec"
#                 distances = self.plotAverageMDS(feature, featuresfolder, outfile, starts, ends)
#                 if len(distances) > 0:
#                     current_dist.append(distances.tolist())
#                 #plt.close('all')
#             dist["distances"].append(current_dist)
#         self.writeJson(dist, outfolder+feature+"_dist.json")
# 
#     def getMutualDistances(self, distanceMatrix):
#         distances = []
#         for i in range(len(distanceMatrix)):
#             for j in range(len(distanceMatrix[0])):
#                 if i < j:
#                     distances.append(distanceMatrix[i][j])
#         return np.array(distances)
# 
#     def saveParameterAnalysis(self, distfile, outfolder):
#         with open(distfile) as file:
#             distjson = json.load(file)
#         numsegments = distjson["numsegments"]
#         segmentlengths = distjson["segmentlengths"]
#         totalchannels = len(distjson["distances"][0][0])
#         param_names = ["means","stds","skew","kurtosis","entropy","extremeness","closeness","fitness"]
#         parameters = {}
#         shape = [len(numsegments), len(segmentlengths)]
#         for name in param_names:
#             parameters[name] = np.empty(shape)
#         for i in range(len(numsegments)):
#             current_dist = []
#             for j in range(len(segmentlengths)):
#                 distances = self.getMutualDistances(distjson["distances"][i][j])
#                 parameters["means"][i][j] = distances.mean()
#                 parameters["stds"][i][j] = distances.std()
#                 parameters["skew"][i][j] = skew(distances)
#                 parameters["kurtosis"][i][j] = kurtosis(distances)
#                 h=np.histogram(distances, bins=100)
#                 p=h[0].astype(float)/h[0].sum() #probability of bins
#                 parameters["entropy"][i][j] = entropy(p)
#                 parameters["extremeness"][i][j] = np.minimum(distances.max()-distances, distances).mean()
#                 #parameters["closeness"][i][j] = np.sort(distances.flatten())[:distances.size/3].mean()
#                 parameters["closeness"][i][j] = np.percentile(distances,5)
#                 #print np.sort(distances.flatten())[:distances.size/10]
#                 #(distances < parameters["means"][i][j]/10).sum()#parameters["means"][i][j]-parameters["stds"][i][j]#(distances < means[i][j]/10).sum()
#         parameters["skew"] = self.normalize(parameters["skew"])
#         parameters["kurtosis"] = self.normalize(parameters["kurtosis"])
#         #parameters["closeness"] = self.normalize(parameters["closeness"])+0.001
#         for i in range(len(numsegments)):
#             for j in range(len(segmentlengths)):
#                 parameters["fitness"][i][j] = (1-parameters["skew"][i][j])*parameters["kurtosis"][i][j]/parameters["closeness"][i][j]
#         #(1-parameters["skew"][i][j])/(parameters["kurtosis"][i][j]+3)/parameters["closeness"][i][j]*parameters["extremeness"][i][j] #*entropy(p) #1-skew(distances.flatten())*close[i][j]#pow(means[i][j],3)/pow(stds[i][j],3)#(distances < means[i][j]/10)*distances()#stds[i][j]/means[i][j]
#                 #print "segments:", numsegments[i], "lengths (sec):", segmentlengths[j], "avg dist:", means[i][j], "var dist:", varis[i][j], "closest:", close[i][j], "fit:", fit[i][j]
#         for name in param_names:
#             self.plotMatrixHeat(np.array(parameters[name]), outfolder+name+".pdf")
#             self.writeJson(parameters[name].tolist(), outfolder+name+".json")
#             self.plotAllMeasures([name], outfolder)
# 
#     def normalize(self, matrix):
#         min = matrix.min()
#         matrix -= min
#         max = matrix.max()
#         if max != 0:
#             matrix /= max
#         return matrix
# 
#     def plotMeasures(self, path, title, xaxis, xlabel, limits, names, dim, outfile):
#         fig = plt.figure()
#         for name in names:
#             with open(path+name+'.json') as file:
#                 matrix = json.load(file)
#                 plt.plot(xaxis, np.array(matrix).mean(dim), label=name)
#                 plt.axis(limits)
#                 ax = plt.gca()
#                 ax.set_autoscale_on(False)
#                 plt.title(title)
#                 plt.xlabel(xlabel)
#                 plt.ylabel('eval(D)')
# 
#         fig.patch.set_facecolor('white')
#         plt.savefig(path+outfile, facecolor='white', edgecolor='none')
# 
#     def plotAllMeasures(self, measures, outfolder):
#         for measure in measures:
#             self.plotMeasures(outfolder, '', [-5,-4,-3,-2,-1,0,1,2,3,4,5,6,7], "number of segments "+r"$2^\rho$", [-5,7,0,12], [measure], 0, measure+'0.pdf')
#             self.plotMeasures(outfolder, '', [0,1,2,3,4,5,6,7,8,9], "segment duration "+r"$2^\sigma$", [0,9,1,9], [measure], 1, measure+'1.pdf')
# 
#     def plotDistanceDistributions(self, distfile, outfolder):
#         with open(distfile) as file:
#             distjson = json.load(file)
#         numsegments = distjson["numsegments"]
#         segmentlengths = distjson["segmentlengths"]
#         for i in range(len(numsegments)):
#             fig = plt.figure(figsize=(16.0, 12.0))
#             plt.title("Distances for "+str(numsegments[i])+" segments")
#             for j in range(len(segmentlengths)):
#                 distances = self.getMutualDistances(distjson["distances"][i][j])
#                 sns.distplot(distances, hist=False, label=str(segmentlengths[j]));
#             plt.savefig(outfolder+"distdist_num_"+str(numsegments[i])+".png")
#         for j in range(len(segmentlengths)):
#             fig = plt.figure(figsize=(16.0, 12.0))
#             plt.title("Distances for segment length: "+str(segmentlengths[j])+")")
#             for i in range(len(numsegments)):
#                 distances = self.getMutualDistances(distjson["distances"][i][j])
#                 sns.distplot(distances, hist=False, label=str(numsegments[i]));
#             plt.savefig(outfolder+"distdist_len_"+str(segmentlengths[j])+".png")
# 
#     def plotDistanceDistributions2(self, distfile, outfolder):
#         with open(distfile) as file:
#             distjson = json.load(file)
#         numsegments = distjson["numsegments"]
#         segmentlengths = distjson["segmentlengths"]
#         for i in range(len(numsegments)):
#             for j in range(len(segmentlengths)):
#                 if numsegments[i] in [1, 16, 256] and segmentlengths[j] in [0.03125, 1, 32]:
#                     fig = plt.figure(figsize=(16.0, 12.0))
#                     plt.title("Distances for "+str(numsegments[i])+" segments of "+ str(segmentlengths[j])+"sec length")
#                     distances = self.getMutualDistances(distjson["distances"][i][j])
#                     sns.distplot(distances, hist=False, label=str(segmentlengths[j]));
#                     plt.savefig(outfolder+"distdist_"+str(numsegments[i])+"_"+str(segmentlengths[j])+".png")
# 
#     def testLinearity(self):
#         start = 50
#         length = 400
#         points = 256
#         starts = np.linspace(start, start+length, num=points, endpoint=False)
#         ends = starts+(float(length)/points)
#         self.plotAverageMDS("chroma", "features/channels/", "plots/test/chroma_mds_"+str(points)+"_1", starts, ends)
