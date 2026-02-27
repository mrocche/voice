import pyaudio
import numpy as np
import time
import threading
import queue
import matplotlib.pyplot as plt
import matplotlib.animation as animation

# Configuration
BUFFER_SIZE = 1024
HOP_SIZE = 1024
SAMPLE_RATE = 44100
WINDOW_DURATION = 60  # seconds
VOLUME_THRESHOLD = 0.0075  # RMS threshold for valid audio

# Extended vocal range (C2 to C5)
MIDI_MIN = 36  # C2
MIDI_MAX = 72  # C5

# Thread-safe queue for data exchange
data_queue = queue.Queue()

# MIDI note to note name mapping
def midi_to_name(midi_note):
    notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    octave = midi_note // 12 - 1
    note_name = notes[midi_note % 12]
    return f"{note_name}{octave}"

# Pitch detection using autocorrelation
def detect_pitch(signal, sample_rate):
    signal = signal - np.mean(signal)
    n = len(signal)
    
    # Compute autocorrelation using FFT for efficiency
    corr = np.correlate(signal, signal, mode='full')
    corr = corr[len(corr)//2:]  # Use only positive lags
    
    # Find the first peak after the zero-lag peak within plausible frequency range
    min_lag = int(sample_rate / 1000)  # 1000 Hz
    max_lag = int(sample_rate / 50)    # 50 Hz
    
    # Ensure indices are within bounds
    if max_lag > len(corr):
        max_lag = len(corr) - 1
    if min_lag < 1:
        min_lag = 1
    
    if min_lag >= max_lag:
        return 0.0
    
    # Find the highest peak in the range
    peak_index = np.argmax(corr[min_lag:max_lag]) + min_lag
    
    # Check confidence (peak must be significant)
    if corr[peak_index] < 0.1 * corr[0]:
        return 0.0
    
    # Convert lag to frequency
    freq = sample_rate / peak_index
    return freq

# Audio capture and pitch detection thread
def audio_thread():
    p = pyaudio.PyAudio()
    stream = p.open(format=pyaudio.paFloat32,
                    channels=1,
                    rate=SAMPLE_RATE,
                    input=True,
                    frames_per_buffer=HOP_SIZE)
    
    start_time = time.time()
    
    while True:
        try:
            audio_data = stream.read(HOP_SIZE, exception_on_overflow=False)
            samples = np.frombuffer(audio_data, dtype=np.float32)
            
            # Calculate RMS volume
            rms = np.sqrt(np.mean(samples**2))
            
            # Skip processing if volume is below threshold
            if rms < VOLUME_THRESHOLD:
                continue
            
            # Detect pitch
            freq = detect_pitch(samples, SAMPLE_RATE)
            
            if 50 <= freq <= 2000:  # Plausible frequency range
                # Convert frequency to fractional MIDI note
                midi_note = 69 + 12 * np.log2(freq / 440.0)
                current_time = time.time() - start_time
                data_queue.put((current_time, midi_note))
        except Exception as e:
            print(f"Audio thread error: {e}")
            break
    
    stream.stop_stream()
    stream.close()
    p.terminate()

# Create standard musical staff lines
def create_staff_lines(ax, min_note, max_note):
    # Create all horizontal lines for notes
    for note in range(min_note, max_note + 1):
        ax.axhline(y=note, color='lightgray', linestyle='-', linewidth=0.5, alpha=0.3)
    
    # Create standard staff lines (bold for key notes)
    staff_notes = {
        # C notes
        'C': {'color': 'blue', 'linewidth': 1.0, 'alpha': 0.5},
        # E and G notes (common in staff notation)
        'E': {'color': 'black', 'linewidth': 1.2, 'alpha': 0.7},
        'G': {'color': 'black', 'linewidth': 1.2, 'alpha': 0.7},
        # Other natural notes
        'D': {'color': 'gray', 'linewidth': 0.8, 'alpha': 0.5},
        'F': {'color': 'gray', 'linewidth': 0.8, 'alpha': 0.5},
        'A': {'color': 'gray', 'linewidth': 0.8, 'alpha': 0.5},
        'B': {'color': 'gray', 'linewidth': 0.8, 'alpha': 0.5}
    }
    
    for note in range(min_note, max_note + 1):
        note_name = midi_to_name(note)
        base_note = note_name[0]  # Get just the note letter (ignore # and octave)
        
        if base_note in staff_notes:
            style = staff_notes[base_note]
            ax.axhline(y=note, color=style['color'], 
                      linestyle='-', linewidth=style['linewidth'], 
                      alpha=style['alpha'])
    
    # Add note labels to the left
    for note in range(min_note, max_note + 1):
        note_name = midi_to_name(note)
        # Only label natural notes (non-sharp)
        if '#' not in note_name:
            ax.text(0.01, note, note_name, 
                    verticalalignment='center', horizontalalignment='left',
                    fontsize=8, transform=ax.get_yaxis_transform())

# Setup plot
fig, ax = plt.subplots(figsize=(12, 8))
times = []
notes = []
scatter = ax.scatter([], [], s=30, c='red', alpha=0.8)
current_time_ref = 0

# Set extended vocal range
ax.set_ylim(MIDI_MIN, MIDI_MAX)

# Create proper musical staff
create_staff_lines(ax, MIDI_MIN, MIDI_MAX)

ax.grid(False)
ax.set_xlabel('Time (seconds)')
ax.set_ylabel('Pitch')
ax.set_title('Real-time Vocal Pitch Detection')
plt.yticks([])  # Hide numeric y-ticks

# Animation update function
def update(frame):
    global current_time_ref, scatter
    current_time_ref = time.time() - start_time_global
    
    # Process new data from queue
    new_data = []
    while not data_queue.empty():
        new_data.append(data_queue.get())
    
    for t, midi_n in new_data:
        times.append(t)
        notes.append(midi_n)
    
    # Remove data older than 20 seconds
    while times and times[0] < current_time_ref - WINDOW_DURATION:
        times.pop(0)
        notes.pop(0)
    
    # Update scatter plot
    if times:
        # Clear previous scatter and create new one to update positions
        for coll in ax.collections:
            coll.remove()
        scatter = ax.scatter(times, notes, s=30, c='red', alpha=0.8)
        ax.set_xlim(max(0, current_time_ref - WINDOW_DURATION), current_time_ref)
    
    return scatter,

# Start audio thread
start_time_global = time.time()
thread = threading.Thread(target=audio_thread, daemon=True)
thread.start()

# Start animation
ani = animation.FuncAnimation(fig, update, interval=50, blit=True)
plt.tight_layout()
plt.show()