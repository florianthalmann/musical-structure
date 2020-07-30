import itertools, math, json, sys
import numpy as np
from pomegranate import HiddenMarkovModel, DiscreteDistribution, MultivariateGaussianDistribution, State#, from_json

INITIAL_EMPHASIS = 10 #emphasis of values of initializing sequence
LR_DECAY = 0.0

class ProfileHMM(object):

    def __init__(self, length=None, n_features=None, initial=None,
            match_match=0.9, delete_insert=0.1, flank_prob=0):#last is polymorphism dummy
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
    
    def fit(self, data, distribution_inertia=0.0, edge_inertia=0.0, max_iterations=1e8):
        return self.model.fit(data, max_iterations=max_iterations,
            lr_decay=LR_DECAY, edge_inertia=edge_inertia,
            distribution_inertia=distribution_inertia, return_history=True, pseudocount=0.2)[1]#, n_jobs=-1)
    
    def save_to_json(self, path):
        with open(path, 'w') as f:
            f.write(self.model.to_json())
    
    # def load_from_json(self, path):
    #     with open(path) as f:
    #         self.model = from_json(f.read())
    #     return self
    
    def get_startprob(self, n_states):
        return np.array([1/3 if i < 3 else 0 for i in range(n_states)])
        
    def get_endprob(self, n_states):
        return np.array([2/3 if i >= n_states-3 else 0 for i in range(n_states)])
    
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
            return 1/3 #0.002 if j == i else 0.499
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
        match_dists = [self.get_match_dist(i, n_features, initial_seq) for i in initial_seq]
        return [self.get_insert_dist(n_features, initial_seq) if i % 3 == 0
            else match_dists[int(math.floor(i/3))] if i % 3 == 1
            else None for i in range(n_states)]
    
    def get_insert_dist(self, n_features, initial_seq):
        if isinstance(initial_seq[0], int): #equal distribution
            return DiscreteDistribution.from_samples(range(n_features))
        else: #distribution based on initial sequence
            return MultivariateGaussianDistribution.from_samples(np.array(initial_seq))
    
    def get_match_dist(self, index, n_features, initial_seq):
        if isinstance(initial_seq[index], int):
            return DiscreteDistribution.from_samples(range(n_features))
            #return DiscreteDistribution.from_samples(np.concatenate(
            #    (np.repeat(index, INITIAL_EMPHASIS), range(n_features))))
        else:
            return MultivariateGaussianDistribution.from_samples(np.concatenate(
                (np.tile(index, (INITIAL_EMPHASIS,1)), np.array(initial_seq))))

class FlankedProfileHMM(ProfileHMM):
    
    def __init__(self, length=None, n_features=None, initial=None,
            match_match=0.9, delete_insert=0.1, flank_prob=0.9999999):
        super(ProfileHMM, self).__init__()
        if length is not None:
            n_states = 3*length+1
            transmat = self.get_transmat(n_states, match_match, delete_insert,
                length, flank_prob)
            #print(transmat.shape)
            #np.set_printoptions(edgeitems=10, linewidth=200)
            #print(transmat.round(2))
            emissions = self.get_emission_dists(n_states, n_features, initial)
            self.model = HiddenMarkovModel.from_matrix(
                transition_probabilities = transmat,
                distributions = emissions,
                starts = self.get_startprob(n_states, flank_prob),
                ends = self.get_endprob(n_states, flank_prob),
                state_names = self.get_state_names(length))
    
    def get_state_names(self, length):
        return sum([['F0','S0','M0','I0']]
            +[['M'+str(i),'D'+str(i),'I'+str(i)] for i in range(1,length-1)]
            +[['M'+str(length-1),'S1','F1']], [])
    
    def get_startprob(self, n_states, flank_prob):
        return np.array([flank_prob if i == 0 else 1-flank_prob
            if i == 1 else 0 for i in range(n_states)])
    
    def get_endprob(self, n_states, flank_prob):
        return np.array([1-flank_prob if i >= n_states-2 else 0 for i in range(n_states)])
    
    def get_transmat(self, n_states, match_match, delete_insert, length, flank_prob):
        transmat = super().get_transmat(n_states, match_match, delete_insert)
        #remove initial and final insert and delete states
        transmat = self.remove_state(len(transmat)-1, transmat)
        transmat = self.remove_state(len(transmat)-1, transmat)
        transmat = self.remove_state(2, transmat)
        transmat = self.remove_state(0, transmat)
        #preflank
        transmat = self.prepend_state(transmat, #silent distribution state
            #lambda i, l: 1/2 if i == 1 else 1/(2*(l+1)) if i % 3 == 0 and i > 0 else 0)
            lambda i, l: 1/(l+1) if i == 1 or i % 3 == 0 and i > 0 else 0)
        transmat = self.prepend_state(transmat, #emitting flank state at start
            lambda i, l: flank_prob if i == 0 else 1-flank_prob if i == 1 else 0)
        #postflank
        transmat = self.append_state(transmat, #silent aggregation state
            lambda i, l: 1/(l+1) if self.is_match_state(i) else 0)
        transmat = self.append_state(transmat, #emitting flank state at end
            lambda i, l: flank_prob if i == l-1 or i == l-2 else 0)
        return transmat
    
    def get_emission_dists(self, n_states, n_features, initial_seq):
        match_dists = [self.get_match_dist(i, n_features, initial_seq) for i in initial_seq]
        return [self.get_insert_dist(n_features, initial_seq) if i % 3 == 0
            else match_dists[int(math.floor(i/3))] if self.is_match_state(i)
            else None for i in range(n_states)]
    
    def is_match_state(self, i):
        return i == 2 or (i % 3 == 1 and i > 1)
    
    def remove_state(self, index, transmat):
        return np.delete(np.delete(transmat, index, 0), index, 1)
    
    #transfunc specifies the outgoing transitions of the state
    def prepend_state(self, transmat, transfunc):
        return self.insert_state(0, 0, transmat, transfunc)
    
    #transfunc specifies the incoming transitions of the state
    def append_state(self, transmat, transfunc):
        return self.insert_state(transmat.shape[0], 1, transmat, transfunc)
    
    def insert_state(self, index, axis, transmat, transfunc):
        n_states = transmat.shape[0]
        transmat = np.insert(transmat, index, np.zeros(n_states), 1-axis)
        trans = np.array([transfunc(i, n_states+1) for i in range(n_states+1)])
        return np.insert(transmat, index, trans if axis == 0 else trans.T, axis)