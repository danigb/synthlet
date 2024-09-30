import("stdfaust.lib");

process = ve.korg35HPF(cutoffNorm, resonanceMapped) with {
    nyquist = ma.SR / 2;
    cutoffHz = hslider("Cutoff Frequency (Hz)", 1000, 20, 20000, 1);
    cutoffNorm = cutoffHz / nyquist;
    resonance = hslider("Q", 0.5, 0, 1, 0.01);
    resonanceMapped = (resonance * (10 - 0.707)) + 0.707;
};
