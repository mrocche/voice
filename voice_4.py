import pyaudio
import numpy as np
import time
import threading
import queue
import matplotlib.pyplot as plt
import matplotlib.animation as animation
from scipy.io import wavfile
import wave
import subprocess
from pathlib import Path
import shutil

# Configuration
BUFFER_SIZE = 1024
HOP_SIZE = 1024
SAMPLE_RATE = 44100
PAST_DURATION = 5  # seconds to show past
FUTURE_DURATION = 10  # seconds to show future
VOLUME_THRESHOLD = 0.0075  # RMS threshold for valid audio
AUDIO_FILE = 'audio_files/la_cerrillana.wav'  # Audio file
ISOLATE_VOCALS = True  # Set to True to isolate vocals, False to use original audio for processing

# Extended vocal range (C2 to C5)
MIDI_MIN = 36  # C2
MIDI_MAX = 84  # C5

# Thread-safe queue for data exchange
data_queue = queue.Queue()

# Synchronization events
start_event = threading.Event()
play_ready = threading.Event()
input_ready = threading.Event()

# Global latencies
output_latency = 0
input_latency = 0

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

# Process audio file for reference notes
def process_audio_file(filename, hop_size, threshold):
    try:
        rate, data = wavfile.read(filename)
    except Exception as e:
        print(f"Error reading audio file: {e}")
        return [], []
    
    # Convert stereo to mono if needed
    if len(data.shape) == 2:
        data = data[:, 0]
    
    # Normalize to float32 [-1, 1]
    if data.dtype == np.int16:
        data = data.astype(np.float32) / 32768.0
    elif data.dtype == np.int32:
        data = data.astype(np.float32) / 2147483648.0
    elif data.dtype == np.float32:
        pass
    else:
        print(f"Unsupported data type: {data.dtype}")
        return [], []
    
    # Calculate hop size for this file
    hop_seconds = hop_size / SAMPLE_RATE
    file_hop_size = int(hop_seconds * rate)
    if file_hop_size == 0:
        file_hop_size = 1
    
    times = []
    notes = []
    start_time = 0.0
    
    # Process audio in chunks
    for i in range(0, len(data) - file_hop_size, file_hop_size):
        chunk = data[i:i+file_hop_size]
        rms = np.sqrt(np.mean(chunk**2))
        if rms < threshold:
            start_time += file_hop_size / rate
            continue
        freq = detect_pitch(chunk, rate)
        if 50 <= freq <= 2000:
            midi_note = 69 + 12 * np.log2(freq / 440.0)
            times.append(start_time)
            notes.append(midi_note)
        start_time += file_hop_size / rate
    
    return times, notes

# Audio capture and pitch detection thread
def audio_thread():
    global input_latency
    p = pyaudio.PyAudio()
    stream = p.open(format=pyaudio.paFloat32,
                    channels=1,
                    rate=SAMPLE_RATE,
                    input=True,
                    frames_per_buffer=HOP_SIZE)
    
    input_latency = stream.get_input_latency()
    input_ready.set()
    
    start_event.wait()
    
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
                current_time = time.time() - start_time_global - input_latency
                data_queue.put((current_time, midi_note))
        except Exception as e:
            print(f"Audio thread error: {e}")
            break
    
    stream.stop_stream()
    stream.close()
    p.terminate()

# Audio playback thread
def play_audio(filename):
    global output_latency
    chunk = 1024
    wf = wave.open(filename, 'rb')
    p = pyaudio.PyAudio()
    stream = p.open(format=p.get_format_from_width(wf.getsampwidth()),
                    channels=wf.getnchannels(),
                    rate=wf.getframerate(),
                    output=True)
    
    output_latency = stream.get_output_latency()
    play_ready.set()
    
    start_event.wait()
    
    data = wf.readframes(chunk)
    while data:
        stream.write(data)
        data = wf.readframes(chunk)
    
    stream.stop_stream()
    stream.close()
    p.terminate()
    wf.close()

# Create uniform musical staff lines
def create_staff_lines(ax, min_note, max_note):
    # Uniform lines for all notes
    for note in range(min_note, max_note + 1):
        ax.axhline(y=note, color='lightgray', linestyle='-', linewidth=0.5, alpha=0.5)
    
    # Add note labels to the left (only natural notes)
    for note in range(min_note, max_note + 1):
        note_name = midi_to_name(note)
        if '#' not in note_name:
            ax.text(-PAST_DURATION - 0.5, note, note_name, 
                    verticalalignment='center', horizontalalignment='right',
                    fontsize=8)

# Isolate vocals using demucs if configured and file doesn't exist
AUDIO_PATH = Path(AUDIO_FILE)
target_vocal = AUDIO_PATH.parent / f"{AUDIO_PATH.stem}_vocals{AUDIO_PATH.suffix}"

if ISOLATE_VOCALS:
    if target_vocal.exists():
        print(f"Vocal file {target_vocal} already exists. Skipping isolation.")
    else:
        # Run demucs to isolate vocals
        subprocess.run(['demucs', '--two-stems=vocals', str(AUDIO_PATH)])
        
        # Path to the generated vocals file
        generated_vocal = Path('separated') / 'htdemucs' / AUDIO_PATH.stem / 'vocals.wav'
        
        if generated_vocal.exists():
            # Move the vocals file to the target location
            generated_vocal.rename(target_vocal)
            
            # Clean up the separated directory
            shutil.rmtree('separated')
        else:
            print(f"Generated vocal file not found: {generated_vocal}. Using original audio.")
            target_vocal = AUDIO_PATH  # Fallback to original if isolation fails
    
    VOCAL_PATH = target_vocal
else:
    VOCAL_PATH = AUDIO_PATH

# Precompute reference notes from vocal path (isolated or original)
audio_times, audio_notes = process_audio_file(str(VOCAL_PATH), HOP_SIZE, VOLUME_THRESHOLD)

# Setup plot
fig, ax = plt.subplots(figsize=(12, 8))
times = []
notes = []
background_scatter = ax.scatter([], [], s=30, c='blue', alpha=0.5, label='Reference')
live_scatter = ax.scatter([], [], s=30, alpha=0.8, label='Sung', cmap='RdYlGn_r', vmin=0, vmax=2)
fig.colorbar(live_scatter, ax=ax, orientation='vertical', label='Pitch Error (semitones)', shrink=0.5)

# Set extended vocal range
ax.set_ylim(MIDI_MIN, MIDI_MAX)

# Create uniform staff lines
create_staff_lines(ax, MIDI_MIN, MIDI_MAX)

# Fixed x-limits for scrolling effect
ax.set_xlim(-PAST_DURATION, FUTURE_DURATION)

# Add vertical "now" line
ax.axvline(0, color='black', linestyle='--', linewidth=1.5, label='Now')

ax.grid(False)
ax.set_xlabel('Time relative to now (seconds)')
ax.set_ylabel('Pitch')
ax.set_title('Real-time Vocal Pitch Detection')
ax.legend(loc='upper right')
plt.yticks([])  # Hide numeric y-ticks

# Animation update function
def update(frame):
    global times, notes
    
    current_time = time.time() - start_time_global
    
    # Process new data from queue
    new_data = []
    while not data_queue.empty():
        new_data.append(data_queue.get())
    
    for t, midi_n in new_data:
        times.append(t)
        notes.append(midi_n)
    
    # Remove data older than visible past
    while times and times[0] < current_time - PAST_DURATION - 1:  # small margin
        times.pop(0)
        notes.pop(0)
    
    # Update background scatter (reference notes, including future)
    if audio_times:
        audio_times_np = np.array(audio_times)
        audio_notes_np = np.array(audio_notes)
        rel_x = audio_times_np - current_time + output_latency
        mask = (rel_x >= -PAST_DURATION) & (rel_x <= FUTURE_DURATION)
        bg_x = rel_x[mask]
        bg_y = audio_notes_np[mask]
        background_scatter.set_offsets(np.column_stack((bg_x, bg_y)))
    else:
        background_scatter.set_offsets(np.column_stack(([], [])))
    
    # Update live scatter (only past and present)
    if times:
        times_np = np.array(times)
        notes_np = np.array(notes)
        rel_live_x = times_np - current_time
        live_mask = (rel_live_x >= -PAST_DURATION) & (rel_live_x <= 0)
        live_x = rel_live_x[live_mask]
        live_y = notes_np[live_mask]

        # Compute errors for coloring
        errors = np.full(len(live_x), 3.0)  # default bad (red)
        if len(bg_x) > 0:
            past_mask = bg_x <= 0
            if np.any(past_mask):
                bg_x_past = bg_x[past_mask]
                bg_y_past = bg_y[past_mask]
                for i, lx in enumerate(live_x):
                    idx = np.argmin(np.abs(bg_x_past - lx))
                    dt = np.abs(bg_x_past[idx] - lx)
                    if dt < 0.2:
                        errors[i] = np.abs(live_y[i] - bg_y_past[idx])

        live_scatter.set_offsets(np.column_stack((live_x, live_y)))
        live_scatter.set_array(errors)
    else:
        live_scatter.set_offsets(np.column_stack(([], [])))
        live_scatter.set_array(np.array([]))
    
    return background_scatter, live_scatter

# Start audio playback and input threads
play_thread = threading.Thread(target=play_audio, args=(AUDIO_FILE,), daemon=True)
play_thread.start()
input_thread = threading.Thread(target=audio_thread, daemon=True)
input_thread.start()

play_ready.wait()
input_ready.wait()

start_time_global = time.time()
start_event.set()

# Start animation
ani = animation.FuncAnimation(fig, update, interval=50, blit=False)
plt.tight_layout()
plt.show()