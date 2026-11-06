"""Render doubleTap phrases and a continuous low arpeggio over the lossless mix.

Requires NumPy and ffmpeg with libvorbis. Only declared arrangement samples change.
The input WAV is the original axis/trill mix, not a previously rendered output.
"""

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import wave

import numpy as np


def envelope(time, duration, decay):
    return np.minimum(1, time / 0.0008) * np.exp(-time / decay) * np.clip((duration - time) / 0.005, 0, 1)


def chip(midi, duration, rate, bass=False):
    time = np.arange(round(duration * rate)) / rate
    frequency = 440 * 2 ** ((midi - 69) / 12)
    harmonics = range(1, 12, 2) if bass else range(1, 10, 2)
    sound = sum(
        np.sin(2 * np.pi * harmonic * frequency * time) / harmonic ** (2 if bass else 1.35)
        for harmonic in harmonics if harmonic * frequency < rate * 0.45
    )
    sound /= max(np.max(np.abs(sound)), 1e-9)
    return sound * envelope(time, duration, 0.19 if bass else 0.09)


def drum(kind, rate, seed):
    duration = {"kick": 0.18, "snare": 0.13, "hat": 0.06, "rim": 0.045}[kind]
    time = np.arange(round(duration * rate)) / rate
    rng = np.random.default_rng(seed)
    noise = np.repeat(rng.choice([-1.0, 1.0], size=(len(time) + 1) // 2), 2)[:len(time)]
    if kind == "kick":
        phase = 2 * np.pi * (44 * time + 100 * 0.018 * (1 - np.exp(-time / 0.018)))
        sound = np.sin(phase) * np.exp(-time / 0.045) + noise * 0.06 * np.exp(-time / 0.003)
    elif kind == "snare":
        bright = noise - np.concatenate(([0.0], noise[:-1]))
        sound = bright * np.exp(-time / 0.025) + 0.4 * np.sin(2 * np.pi * 190 * time) * np.exp(-time / 0.022)
    elif kind == "rim":
        sound = np.sin(2 * np.pi * 1650 * time) * np.exp(-time / 0.009)
        sound += 0.35 * np.sin(2 * np.pi * 2960 * time) * np.exp(-time / 0.006)
    else:
        bright = noise - np.concatenate(([0.0], noise[:-1]))
        sound = bright * np.exp(-time / 0.014)
    sound *= np.minimum(1, time / 0.0006) * np.clip((duration - time) / 0.003, 0, 1)
    return sound / max(np.max(np.abs(sound)), 1e-9)


def add(buffer, sound, start, gain, pan=0):
    end = min(start + len(sound), len(buffer))
    buffer[start:end] += (sound[:end - start] * gain)[:, None] * np.array([1 - pan, 1 + pan])


def measure(samples, rate):
    process = subprocess.run([
        "ffmpeg", "-hide_banner", "-nostats", "-f", "f32le", "-ar", str(rate), "-ac", "2", "-i", "pipe:0",
        "-af", "loudnorm=I=-18:TP=-1:LRA=11:print_format=json", "-f", "null", "-",
    ], input=np.asarray(samples, dtype="<f4").tobytes(), stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, check=True)
    output = process.stderr.decode("utf-8", errors="replace")
    result = json.loads(output[output.rfind("{"):output.rfind("}") + 1])
    return {"integratedLufs": float(result["input_i"]), "truePeakDb": float(result["input_tp"])}


def render_phrase(section, events, step_samples, rate):
    start_step = (section["startBar"] - 1) * 16
    count = section["bars"] * 16
    phrase = np.zeros((count * step_samples, 2), dtype=np.float64)
    cues = np.zeros_like(phrase)
    strikes = []
    for event in events:
        index = event["step"] - start_step
        if not 0 <= index < count:
            continue
        if len(event["keys"]) != 1 or event["sample"] != event["step"] * step_samples:
            raise ValueError("Double taps must be sample-aligned single notes")
        lane = event["keys"][0]
        midi = section["musicBars"][index // 16]["leadMidi"][lane]
        # Keep the original C5 to B4 melodic resolution into bar 39.
        if event["step"] in (606, 607):
            midi = 72
        gain = (0.32 if index % 2 == 0 else 0.285) * ([1.12, 0.9, 1, 0.9][(index % 16) // 4])
        add(cues, chip(midi, step_samples / rate * 0.78, rate), index * step_samples, gain)
        add(cues, drum("hat", rate, 128000 + event["step"]), index * step_samples, 0.075 if index % 2 == 0 else 0.055, 0.08)
        add(cues, drum("rim", rate, 256000 + event["step"]), index * step_samples, 0.055 if index % 2 == 0 else 0.07)
        strikes.append({"step": event["step"], "sample": event["sample"], "midi": midi})
    if len(strikes) != count:
        raise ValueError("Each double-tap sixteenth must have one musical onset")
    for bar, harmony in enumerate(section["musicBars"]):
        root = harmony["bassMidi"]
        for beat, interval in enumerate([0, 7, 0, 12]):
            start = (bar * 16 + beat * 4) * step_samples
            add(phrase, chip(root + interval, step_samples / rate * 3.7, rate, bass=True), start, 0.19)
            add(phrase, drum("kick", rate, 29000 + start), start, [0.22, 0.13, 0.19, 0.13][beat])
            if beat % 2 == 1:
                add(phrase, drum("snare", rate, 37000 + start), start, 0.22)
    return phrase + cues, strikes, cues


def hand_back_to_bar39(phrase, cues, original, step_samples, rate, loudness_limit):
    # Introduce the existing rhythm section over two beats, retaining the double taps.
    first = 24 * step_samples
    blend = np.zeros(len(phrase))
    blend[first:] = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, len(phrase) - first))
    blend = blend[:, None]
    base = phrase * (1 - blend) + original * blend
    retained = cues * blend

    def candidate(gain):
        return base + retained * gain

    def fits(gain):
        sound = candidate(gain)
        return np.max(np.abs(sound)) <= 0.87 and measure(sound, rate)["integratedLufs"] <= loudness_limit

    low, high = 0.0, 1.0
    if not fits(low):
        raise ValueError("Transition foundation exceeds the phrase loudness limit")
    if fits(high):
        low = high
    else:
        for _ in range(12):
            middle = (low + high) / 2
            if fits(middle):
                low = middle
            else:
                high = middle
    result = candidate(low)
    tail = round(rate * 0.01)
    return result, {
        "startStep": 600, "resolveStep": 608, "backingBlendBeats": 2,
        "retainedCueGain": low, "closingPairMidi": 72, "nextMelodyMidi": 71,
        "tailDifferenceRms": float(np.sqrt(np.mean((result[-tail:] - original[-tail:]) ** 2))),
    }


def pcm_hash(samples):
    return hashlib.sha256(np.rint(samples * 32768).astype("<i2").tobytes()).hexdigest()


def add_low_arpeggio(mixed, chart, rate):
    # Low chord voicings leave the existing lead and drums in front.
    voicings = {
        "Em": [52, 55, 59, 64],
        "B": [47, 51, 54, 59],
        "C": [48, 52, 55, 60],
        "G": [50, 55, 59, 62],
        "D": [50, 54, 57, 62],
        "Am": [48, 52, 57, 60],
    }
    progression = ["Em", "B", "Em", "C", "G", "D", "Em", "C", "G", "B"]
    if chart.get("playbackBarOrder"):
        source_harmony = dict(zip(range(37, 49), ["Am", "C"] + progression))
        progression = [source_harmony[bar] for bar in chart["playbackBarOrder"][38:]]
        progression[4:6] = ["G", "D"]
    step_samples = chart["samplesPerSixteenth"]
    first_step = 38 * 16
    last_step = chart["bars"] * 16
    if len(progression) * 16 != last_step - first_step:
        raise ValueError("Low arpeggio harmony must cover bars 39 through the loop end")
    start = first_step * step_samples
    original = mixed[start:].copy()
    overlay = np.zeros_like(original)
    onsets = []
    for index, step in enumerate(range(first_step, last_step)):
        chord = progression[index // 16]
        midi = voicings[chord][index % 4]
        strength = [1, 0.9, 0.97, 0.9][(index % 16) // 4]
        gain = (0.14 if index % 2 == 0 else 0.125) * strength
        add(overlay, chip(midi, step_samples / rate * 0.88, rate, bass=True), index * step_samples, gain)
        onsets.append({"step": step, "sample": step * step_samples, "midi": midi})
    # One fixed layer gain preserves the original mix without pumping or filtering it.
    low, high = 0.0, 1.0
    for _ in range(20):
        middle = (low + high) / 2
        if np.max(np.abs(original + overlay * middle)) <= 0.96:
            low = middle
        else:
            high = middle
    if low < 0.5:
        raise ValueError("Low arpeggio needs more headroom to remain audible")
    mixed[start:] = original + overlay * low
    return {
        "startBar": 39, "bars": len(progression), "startStep": first_step, "endStepExclusive": last_step,
        "notesPerBar": 16, "layerGain": low, "midiRange": [47, 64],
        "chords": progression, "before": measure(original, rate), "after": measure(mixed[start:], rate),
        "originalBackingPcmSha256": pcm_hash(original), "onsets": onsets,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ["input-wav", "chart", "output-wav", "output-ogg", "report"]:
        parser.add_argument("--" + name, type=Path, required=True)
    args = parser.parse_args()
    chart = json.loads(args.chart.read_text(encoding="utf-8"))
    with wave.open(str(args.input_wav), "rb") as source:
        rate, frames = source.getframerate(), source.getnframes()
        if rate != chart["sampleRateHz"] or source.getnchannels() != 2 or source.getsampwidth() != 2:
            raise ValueError("Expected a 48kHz stereo 16-bit lossless mix")
        original = np.frombuffer(source.readframes(frames), "<i2").reshape(-1, 2).astype(np.float64) / 32768
    if frames != chart["loopEndSampleExclusive"]:
        raise ValueError("Music and chart sample counts do not match")
    step_samples = chart["samplesPerSixteenth"]
    mixed = original.copy()
    reference = measure(original[480 * step_samples:512 * step_samples], rate)
    sections = []
    untouched = []
    previous = 0
    for section in sorted((item for item in chart["sections"] if item["pattern"] == "doubleTap"), key=lambda item: item["startBar"]):
        start = (section["startBar"] - 1) * 16 * step_samples
        end = start + section["bars"] * 16 * step_samples
        if start < previous:
            raise ValueError("Phrase ranges must not overlap")
        untouched.append((previous, start))
        phrase, strikes, cues = render_phrase(section, chart["events"], step_samples, rate)
        before = measure(original[start:end], rate)
        raw = measure(phrase, rate)
        target_lufs = min(before["integratedLufs"], reference["integratedLufs"])
        gain_db = min(target_lufs - raw["integratedLufs"], -1.5 - raw["truePeakDb"])
        gain = 10 ** (gain_db / 20)
        phrase *= gain
        cues *= gain
        transition = None
        if section["startBar"] == 37 and section["bars"] == 2:
            phrase, transition = hand_back_to_bar39(phrase, cues, original[start:end], step_samples, rate, target_lufs + 0.2)
        fade = np.ones(end - start)
        length = round(rate * 0.004)
        ramp = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, length))
        fade[:length], fade[-length:] = ramp, ramp[::-1]
        mixed[start:end] = original[start:end] * (1 - fade[:, None]) + phrase * fade[:, None]
        after = measure(mixed[start:end], rate)
        if after["truePeakDb"] > -1 or after["integratedLufs"] > target_lufs + 0.2:
            raise ValueError("Phrase exceeds its loudness reference")
        record = {"startBar": section["startBar"], "bars": section["bars"], "before": before, "after": after, "onsets": strikes}
        if transition:
            transition["bar39BackingPcmSha256"] = pcm_hash(original[end:end + 16 * step_samples])
            if not np.array_equal(original[end:end + 16 * step_samples], mixed[end:end + 16 * step_samples]):
                raise ValueError("Bar 39 itself must retain its original samples")
            record["transition"] = transition
        sections.append(record)
        previous = end
    order = chart.get("playbackBarOrder")
    if order:
        if sorted(order) != list(range(1, chart["bars"] + 1)):
            raise ValueError("Playback order must contain each bar exactly once")
        bar_samples = 16 * step_samples
        mixed = np.concatenate([mixed[(bar - 1) * bar_samples:bar * bar_samples] for bar in order])
        length = round(rate * 0.003)
        ramp = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, length))
        for index in range(1, len(order)):
            if order[index] != order[index - 1] + 1:
                boundary = index * bar_samples
                mixed[boundary - length:boundary] *= ramp[::-1, None]
                mixed[boundary:boundary + length] *= ramp[:, None]
                untouched = [(start, end - length if end == boundary else end) for start, end in untouched]
        for section in sections:
            source_bar = section["startBar"]
            section["sourceStartBar"] = source_bar
            section["startBar"] = order.index(source_bar) + 1
            for onset in section["onsets"]:
                source_step = onset["step"]
                onset["step"] = order.index(source_step // 16 + 1) * 16 + source_step % 16
                onset["sample"] = onset["step"] * step_samples
            if section.get("transition"):
                section["sourceTransition"] = section.pop("transition")
                section["transition"] = {
                    "startStep": (section["startBar"] + 1) * 16 - 8,
                    "resolveStep": (section["startBar"] + section["bars"] - 1) * 16,
                    "crossfadeMs": 3, "closingPairMidi": 72, "nextMelodyMidi": 76,
                }
    if order:
        # Reuse the spiral's musical phrase instead of the lane-derived double-tap melody.
        source_start, target_start = 38 * bar_samples, 42 * bar_samples
        source_phrase = mixed[source_start:source_start + 2 * bar_samples].copy()
        target = mixed[target_start:target_start + 2 * bar_samples]
        target_level, source_level = measure(target, rate), measure(source_phrase, rate)
        reprise_gain_db = min(0, target_level["integratedLufs"] - source_level["integratedLufs"])
        reprise_gain = 10 ** (reprise_gain_db / 20)
        target[:] = source_phrase * reprise_gain
        reprise = next(section for section in sections if section["startBar"] == 43)
        reprise.pop("transition", None)
        reprise.pop("sourceTransition", None)
        reprise["melodySourceBars"] = [39, 40]
        reprise["melodyGainDb"] = reprise_gain_db
        reprise["referencePhrasePcmSha256"] = pcm_hash(source_phrase)
        reprise["renderedPhrasePcmSha256"] = pcm_hash(target)
        reprise["after"] = measure(target, rate)
        reprise["onsets"] = [{"step": 672 + index, "sample": (672 + index) * step_samples, "sourceStep": 608 + index} for index in range(32)]
        if not np.allclose(target, source_phrase * reprise_gain, atol=1e-12):
            raise ValueError("The double-tap phrase must follow the spiral melody")
    arpeggio = add_low_arpeggio(mixed, chart, rate)
    arpeggio_start = arpeggio["startStep"] * step_samples
    if previous > arpeggio_start:
        raise ValueError("Arpeggio must follow the source double-tap phrase")
    if previous < arpeggio_start:
        untouched.append((previous, arpeggio_start))
    for start, end in untouched:
        if not np.array_equal(original[start:end], mixed[start:end]):
            raise ValueError("Samples outside the arrangement must not change")
    if np.max(np.abs(mixed)) >= 1:
        raise ValueError("Mix would clip")
    with wave.open(str(args.output_wav), "wb") as output:
        output.setnchannels(2)
        output.setsampwidth(2)
        output.setframerate(rate)
        output.writeframes(np.rint(mixed * 32768).astype("<i2").tobytes())
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(args.output_wav), "-c:a", "libvorbis", "-q:a", "6", str(args.output_ogg)], check=True)
    decoded = subprocess.run(["ffmpeg", "-v", "error", "-i", str(args.output_ogg), "-f", "f32le", "-acodec", "pcm_f32le", "pipe:1"], stdout=subprocess.PIPE, check=True)
    decoded = np.frombuffer(decoded.stdout, "<f4").reshape(-1, 2)
    if len(decoded) != frames or np.max(np.abs(decoded)) >= 1:
        raise ValueError("Encoded audio must preserve the loop length without clipping")
    report = {
        "arrangementVersion": chart["arrangementVersion"], "mixVersion": "spiral-melody-5", "playbackBarOrder": order, "bpm": chart["bpm"], "sampleRateHz": rate,
        "frames": frames, "durationSeconds": frames / rate,
        "sourceWavSha256": hashlib.sha256(args.input_wav.read_bytes()).hexdigest(),
        "outputOggSha256": hashlib.sha256(args.output_ogg.read_bytes()).hexdigest(),
        "decodedPeak": float(np.max(np.abs(decoded))), "referenceBars": [31, 32], "reference": reference,
        "unchangedPcmRanges": [{"startSample": start, "endSampleExclusive": end, "sha256": pcm_hash(mixed[start:end])} for start, end in untouched],
        "sections": sections, "lowArpeggio": arpeggio,
    }
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"frames": frames, "decodedPeak": report["decodedPeak"], "lowArpeggio": {key: value for key, value in arpeggio.items() if key != "onsets"}, "sections": [{key: value for key, value in section.items() if key != "onsets"} for section in sections]}))


if __name__ == "__main__":
    main()
