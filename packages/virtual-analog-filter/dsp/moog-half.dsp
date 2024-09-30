import("stdfaust.lib");

process = ve.moogHalfLadder(cutoffNorm, resonanceMapped) with {
    nyquist = ma.SR / 2;
    cutoffHz = hslider("Cutoff Frequency (Hz)", 1000, 20, 20000, 1);
    cutoffNorm = cutoffHz / nyquist;
    
    // Q slider with a range from 0 to 1
    resonance = hslider("Q", 0.5, 0, 1, 0.01);
    
    // Map the 0 to 1 range of Q to the desired range of 0.707 to 25
    resonanceMapped = (resonance * (25 - 0.707)) + 0.707;
};
