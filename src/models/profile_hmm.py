import numpy as np
import itertools
from pomegranate import HiddenMarkovModel, DiscreteDistribution

class ProfileHMM(object):
    """docstring for ProfileHMM."""

    def __init__(self, length, n_features):
        super(ProfileHMM, self).__init__()
        n_states = 3*length+1
        self.model = HiddenMarkovModel.from_matrix(
            self.get_transmat(n_states),
            self.get_emission_dists(n_states, n_features),
            self.get_startprob(n_states))
        # self.model.bake()
    
    def fit(self, data):
        return self.model.fit(data)
    
    def get_startprob(self, n_states):
        return np.array([1/3 if i < 3 else 0 for i in range(n_states)])
    
    def get_transmat(self, n_states):
        transitions = np.array([[self.get_trans_prob(i,j)
            for j in range(n_states)] for i in range(n_states)])
        transitions[-3][-1] = 1
        transitions[-2][-1] = 1
        transitions[-1][-1] = 1
        return transitions
    
    def get_trans_prob(self, i, j, encouragement = 1.2):
        match_match = 1/3*encouragement
        match_other = (1-match_match)/2
        delete_insert = 1/3/encouragement
        delete_other = (1-delete_insert)/2
        if (i % 3 == 0) and (i <= j <= i+2): #insert
            return 1/3
        elif (i % 3) == 1 and i+2 <= j <= i+4: #match
            return match_match if j == i+3 else match_other
        elif (i % 3) == 2 and i+1 <= j <= i+3: #delete
            return delete_insert if j == i+1 else delete_other
        else: return 0
    # [
    #   [.33,.33,.33,  0,  0,  0,  0], //I
    #   [  0,  0,  0, .3, .4, .3,  0], //M
    #   [  0,  0,  0, .2, .4, .4,  0], //D
    #   [  0,  0,  0,.33,.33,.33,  0], //I
    #   [  0,  0,  0,  0,  0,  0,  1], //M
    #   [  0,  0,  0,  0,  0,  0,  1], //D
    #   [  0,  0,  0,  0,  0,  0,  1], //I
    # ]
    
    def get_emission_dists(self, n_states, n_features):
        return [DiscreteDistribution.from_samples(range(n_features))
            #if i % 3 != 2 else None for i in range(n_states)]
            if i % 3 != 2 else None for i in range(n_states)]
