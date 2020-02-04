import itertools, math, json
import numpy as np
from pomegranate import HiddenMarkovModel, DiscreteDistribution, MultivariateGaussianDistribution, from_json

INITIAL_EMPHASIS = 10 #emphasis of values of initializing sequence
LR_DECAY = 0.0

class ProfileHMM(object):
    """docstring for ProfileHMM."""

    def __init__(self, length=None, n_features=None, initial=None,
            match_match=0.9, delete_insert=0.1):
        super(ProfileHMM, self).__init__()
        if length is not None:
            n_states = 3*length+1
            #print(self.get_emission_dists(n_states, n_features, initial)[:3])
            self.model = HiddenMarkovModel.from_matrix(
                transition_probabilities = self.get_transmat(n_states, match_match, delete_insert),
                distributions = self.get_emission_dists(n_states, n_features, initial),
                starts = self.get_startprob(n_states),
                ends = self.get_endprob(n_states),
                state_names = self.get_state_names(length))
        #else:
        #    self.model = HiddenMarkovModel()
    
    def fit(self, data, inertia=0.0, max_iterations=1e8):
        return self.model.fit(data, max_iterations=max_iterations,
            lr_decay=LR_DECAY, inertia=inertia, return_history=True)[1]#, n_jobs=-1)
    
    def save_to_json(self, path):
        with open(path, 'w') as f:
            f.write(self.model.to_json())
    
    def load_from_json(self, path):
        with open(path) as f:
            self.model = from_json(f.read())
        return self
    
    def get_startprob(self, n_states):
        return np.array([1/3 if i < 3 else 0 for i in range(n_states)])
        
    def get_endprob(self, n_states):
        return np.array([2/3 if i > n_states-3 else 0 for i in range(n_states)])
    
    def get_transmat(self, n_states, match_match, delete_insert):
        return np.array([[self.get_transprob(i,j, match_match, delete_insert)
            for j in range(n_states)] for i in range(n_states)])
    
    def get_state_names(self, length):
        return sum([['In']]
            +[['M'+str(i),'D'+str(i),'I'+str(i)] for i in range(length)], [])
    
    def get_transprob(self, i, j, match_match, delete_insert):
        match_other = (1-match_match)/2
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
    #   [  0,  0,  0,  0,  0,  0, .3], //M
    #   [  0,  0,  0,  0,  0,  0, .2], //D
    #   [  0,  0,  0,  0,  0,  0,.33], //I
    # ]
    
    def get_emission_dists(self, n_states, n_features, initial_seq):
        if isinstance(initial_seq[0], int):
            return self.get_discrete_dists(n_states, n_features, initial_seq, INITIAL_EMPHASIS)
        else:
            return self.get_multigauss_dists(n_states, n_features, initial_seq, INITIAL_EMPHASIS)
    
    def get_discrete_dists(self, n_states, n_features, initial_seq, emphasis):
        initial_dists = [DiscreteDistribution.from_samples(
            np.concatenate((np.repeat(i, emphasis), range(n_features)))
        ) for i in initial_seq]
        return [DiscreteDistribution.from_samples(range(n_features)) if i % 3 == 0
            else initial_dists[int(math.floor(i/3))] if i % 3 == 1
            else None for i in range(n_states)]
    
    def get_multigauss_dists(self, n_states, n_features, initial_seq, emphasis):
        initial_dists = [MultivariateGaussianDistribution.from_samples(
            np.concatenate((np.tile(i, (emphasis,1)), np.array(initial_seq)))
        ) for i in initial_seq]
        return [MultivariateGaussianDistribution.from_samples(np.array(initial_seq)) if i % 3 == 0
            else initial_dists[int(math.floor(i/3))] if i % 3 == 1
            else None for i in range(n_states)]
