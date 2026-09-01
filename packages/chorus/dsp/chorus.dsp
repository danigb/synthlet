/*
 * The `chorus_mono` definition below is copied verbatim from the Faust
 * distribution, examples/SAM/chorus/chorusForBrowser.dsp.
 *
 *   FAUST compiler
 *   Copyright (C) 2003-2024 GRAME, Centre National de Creation Musicale
 *   Copyright (C) 2023-2024 INRIA
 *
 * The Faust distribution is licensed under the GNU Lesser General Public
 * License, version 2.1 or (at your option) any later version. This file is
 * therefore NOT covered by synthlet's MIT licence.
 *
 * `chorus_mono` has no equivalent in faustlibraries, so the copy cannot be
 * replaced with a library reference. The generated DSP in ../src is compiler
 * output and is not affected: GRAME state that the compiler's licence does not
 * propagate to generated code (https://faustdoc.grame.fr/manual/faq/).
 *
 * See THIRD-PARTY-LICENSES.md at the repository root.
 */
import("stdfaust.lib");

voices = 8; // MUST BE EVEN
process = chorus_mono(dmax,curdel,rate,sigma,do2,voices);

dmax = 4096; // 8192;
curdel = dmax * vslider("[0] Delay [midi:ctrl 4] [style:knob]", 0.5, 0, 1, 0.001) : si.smooth(0.999);
rateMax = 7.0; // Hz
rateMin = 0.01;
rateT60 = 0.15661;
rate = vslider("[1] Rate [midi:ctrl 2] [unit:Hz] [style:knob]", 0.5, rateMin, rateMax, 0.0001)
    : si.smooth(ba.tau2pole(rateT60/6.91));

depth = vslider("[4] Depth [midi:ctrl 3] [style:knob]", 0.5, 0, 1, 0.001) : si.smooth(ba.tau2pole(depthT60/6.91));

depthT60 = 0.15661;
delayPerVoice = 0.5*curdel/voices;
sigma = delayPerVoice * vslider("[6] Deviation [midi:ctrl 58] [style:knob]",0.5,0,1,0.001) : si.smooth(0.999);

periodic = 1;

do2 = depth;   // use when depth=1 means "multivibrato" effect (no original => all are modulated)

chorus_mono(dmax,curdel,rate,sigma,do2,voices)
	= _ <: (*(1-do2)<:_,_),(*(do2) <: par(i,voices,voice(i)) :> _,_) : ro.interleave(2,2) : +,+
    with {
        angle(i) = 2*ma.PI*(i/2)/voices + (i%2)*ma.PI/2;
        voice(i) = de.fdelay(dmax,min(dmax,del(i))) * cos(angle(i));
        del(i) = curdel*(i+1)/voices + dev(i);
        rates(i) = rate/float(i+1);
        dev(i) = sigma * os.oscp(rates(i),i*2*ma.PI/voices);
    };

