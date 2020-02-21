import numpy as np
from pydub import AudioSegment
from matplotlib import pyplot as plt
base = "/Users/flo/Projects/Code/FAST/musical-structure/data/me_and_my_uncle/"
path = base+"gd1966-12-01.sbd.32800.shnf/gd1966-12-01d3t07_vbr.mp3"
#path = base+"gd1966-11-29.sbd.thecore.4940.shnf/gd66-11-29d1t01.mp3"
audio = AudioSegment.from_mp3(path)
mono_samples = np.array(audio.set_channels(1).get_array_of_samples())
rate = audio.frame_rate
num_samples = mono_samples.shape[0]
duration = num_samples / rate
print(rate, duration)

# f, ax = plt.subplots()
# ax.plot(np.arange(num_samples) / rate, mono_samples)
# ax.set_xlabel('Time [s]')
# ax.set_ylabel('Amplitude [unknown]')
# plt.show()

# Number of sample points
N = num_samples
# sample spacing
T = 1.0 / rate
x = np.linspace(0.0, N*T, N)
yf = np.fft.fft(mono_samples)
xf = np.linspace(0.0, 1.0/(2.0*T), N//2)
plt.plot(xf, 2.0/N * np.abs(yf[0:N//2]))
plt.grid()
plt.show()