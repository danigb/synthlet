import("stdfaust.lib");

process = re.greyhole(dt, damp, size, early_diff, feedback, mod_depth, mod_freq)
with {

    rev_group(x) = vgroup("[0] Greyhole",x);
    
    mix_group(x) = rev_group(hgroup("[0] Mix",x));
    dt = mix_group(hslider("[01]delayTime [style:knob]", 0.2, 0.001, 1.45, 0.0001));
    damp = mix_group(hslider("[02]damping [style:knob]", 0, 0, 0.99, 0.001));
    size = mix_group(hslider("[03]size [style:knob]", 1, 0.5, 3, 0.0001));
    early_diff = mix_group(hslider("[04]diffusion [style:knob]", 0.5, 0, 0.99, 0.0001));
    feedback = mix_group(hslider("[05]feedback [style:knob]", 0.9, 0, 1, 0.01));
    
    mod_group(x) = rev_group(hgroup("[1] Mod",x));
    mod_depth = mod_group(hslider("[06]modDepth [style:knob]", 0.1, 0, 1, 0.001));
    mod_freq = mod_group(hslider("[07]modFreq [style:knob]", 2, 0, 10, 0.01));
};