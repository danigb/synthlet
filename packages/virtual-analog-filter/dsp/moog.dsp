import("stdfaust.lib");

process = ve.moogLadder(cutoffNorm, resonanceMapped) with {
    cutoffHz = hslider("Cutoff Frequency (Hz)", 1000, 20, 20000, 1);
    // `vaeffects.lib` takes a normalised logarithmic control and maps it back
    // to Hz itself: cf = 2*(10^(3*normFreq+1)), i.e. 20 Hz..20 kHz over 0..1.
    // This is that map inverted, so `cutoffHz` arrives as the Hz it says it
    // is. Handing the library `cutoffHz / nyquist` - a linear fraction of
    // Nyquist - is what put every model about two decades low.
    cutoffNorm = max(0, min(1, (log10(cutoffHz / 2) - 1) / 3));
    
    // Q slider with a range from 0 to 1
    resonance = hslider("Q", 0.5, 0, 1, 0.01);
    
    // Map the 0 to 1 range of Q to the desired range of 0.707 to 25
    resonanceMapped = (resonance * (25 - 0.707)) + 0.707;
};
