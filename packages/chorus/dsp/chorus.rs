/* ------------------------------------------------------------
name: "chorus"
Code generated with Faust 2.72.14 (https://faust.grame.fr)
Compilation options: -lang rust -ct 1 -cn Chorus -es 1 -mcd 16 -mdd 1024 -mdy 33 -single -ftz 0
------------------------------------------------------------ */

pub struct ChorusSIG0 {
    iVec2: [i32; 2],
    iRec3: [i32; 2],
}

impl ChorusSIG0 {
    fn get_num_inputsChorusSIG0(&self) -> i32 {
        return 0;
    }
    fn get_num_outputsChorusSIG0(&self) -> i32 {
        return 1;
    }

    fn instance_initChorusSIG0(&mut self, sample_rate: i32) {
        for l5 in 0..2 {
            self.iVec2[l5 as usize] = 0;
        }
        for l6 in 0..2 {
            self.iRec3[l6 as usize] = 0;
        }
    }

    fn fillChorusSIG0(&mut self, count: i32, table: &mut [F32]) {
        for i1 in 0..count {
            self.iVec2[0] = 1;
            self.iRec3[0] = (i32::wrapping_add(self.iVec2[1], self.iRec3[1])) % 65536;
            table[i1 as usize] = F32::cos(9.58738e-05 * (self.iRec3[0]) as F32);
            self.iVec2[1] = self.iVec2[0];
            self.iRec3[1] = self.iRec3[0];
        }
    }
}

pub fn newChorusSIG0() -> ChorusSIG0 {
    ChorusSIG0 {
        iVec2: [0; 2],
        iRec3: [0; 2],
    }
}

pub struct ChorusSIG1 {
    iVec3: [i32; 2],
    iRec6: [i32; 2],
}

impl ChorusSIG1 {
    fn get_num_inputsChorusSIG1(&self) -> i32 {
        return 0;
    }
    fn get_num_outputsChorusSIG1(&self) -> i32 {
        return 1;
    }

    fn instance_initChorusSIG1(&mut self, sample_rate: i32) {
        for l9 in 0..2 {
            self.iVec3[l9 as usize] = 0;
        }
        for l10 in 0..2 {
            self.iRec6[l10 as usize] = 0;
        }
    }

    fn fillChorusSIG1(&mut self, count: i32, table: &mut [F32]) {
        for i2 in 0..count {
            self.iVec3[0] = 1;
            self.iRec6[0] = (i32::wrapping_add(self.iVec3[1], self.iRec6[1])) % 65536;
            table[i2 as usize] = F32::sin(9.58738e-05 * (self.iRec6[0]) as F32);
            self.iVec3[1] = self.iVec3[0];
            self.iRec6[1] = self.iRec6[0];
        }
    }
}

pub fn newChorusSIG1() -> ChorusSIG1 {
    ChorusSIG1 {
        iVec3: [0; 2],
        iRec6: [0; 2],
    }
}
static mut ftbl0ChorusSIG0: [F32; 65536] = [0.0; 65536];
static mut ftbl1ChorusSIG1: [F32; 65536] = [0.0; 65536];
mod ffi {
    use std::os::raw::c_float;
    #[link(name = "m")]
    extern "C" {
        pub fn remainderf(from: c_float, to: c_float) -> c_float;
        pub fn rintf(val: c_float) -> c_float;
    }
}
fn remainder_f32(from: f32, to: f32) -> f32 {
    unsafe { ffi::remainderf(from, to) }
}
fn rint_f32(val: f32) -> f32 {
    unsafe { ffi::rintf(val) }
}

#[cfg_attr(feature = "default-boxed", derive(default_boxed::DefaultBoxed))]
#[repr(C)]
pub struct Chorus {
    iVec0: [i32; 2],
    fVslider0: F32,
    fSampleRate: i32,
    fConst0: F32,
    fConst1: F32,
    fConst2: F32,
    fVslider1: F32,
    fRec0: [F32; 2],
    IOTA0: i32,
    fVec1: [F32; 8192],
    fVslider2: F32,
    fRec1: [F32; 2],
    fVslider3: F32,
    fRec2: [F32; 2],
    fConst3: F32,
    fVslider4: F32,
    fRec5: [F32; 2],
    fRec4: [F32; 2],
    fConst4: F32,
    fRec7: [F32; 2],
    fConst5: F32,
    fRec8: [F32; 2],
    fConst6: F32,
    fRec9: [F32; 2],
    fConst7: F32,
    fRec10: [F32; 2],
    fConst8: F32,
    fRec11: [F32; 2],
    fConst9: F32,
    fRec12: [F32; 2],
}

impl FaustDsp for Chorus {
    type T = F32;

    fn new() -> Chorus {
        Chorus {
            iVec0: [0; 2],
            fVslider0: 0.0,
            fSampleRate: 0,
            fConst0: 0.0,
            fConst1: 0.0,
            fConst2: 0.0,
            fVslider1: 0.0,
            fRec0: [0.0; 2],
            IOTA0: 0,
            fVec1: [0.0; 8192],
            fVslider2: 0.0,
            fRec1: [0.0; 2],
            fVslider3: 0.0,
            fRec2: [0.0; 2],
            fConst3: 0.0,
            fVslider4: 0.0,
            fRec5: [0.0; 2],
            fRec4: [0.0; 2],
            fConst4: 0.0,
            fRec7: [0.0; 2],
            fConst5: 0.0,
            fRec8: [0.0; 2],
            fConst6: 0.0,
            fRec9: [0.0; 2],
            fConst7: 0.0,
            fRec10: [0.0; 2],
            fConst8: 0.0,
            fRec11: [0.0; 2],
            fConst9: 0.0,
            fRec12: [0.0; 2],
        }
    }
    fn metadata(&self, m: &mut dyn Meta) {
        m.declare("basics.lib/bypass1to2:author", r"Julius Smith");
        m.declare("basics.lib/name", r"Faust Basic Element Library");
        m.declare(
            "basics.lib/tabulateNd",
            r"Copyright (C) 2023 Bart Brouns <bart@magnetophon.nl>",
        );
        m.declare("basics.lib/version", r"1.15.0");
        m.declare(
            "compile_options",
            r"-lang rust -ct 1 -cn Chorus -es 1 -mcd 16 -mdd 1024 -mdy 33 -single -ftz 0",
        );
        m.declare("delays.lib/name", r"Faust Delay Library");
        m.declare("delays.lib/version", r"1.1.0");
        m.declare("filename", r"chorus.dsp");
        m.declare("maths.lib/author", r"GRAME");
        m.declare("maths.lib/copyright", r"GRAME");
        m.declare("maths.lib/license", r"LGPL with exception");
        m.declare("maths.lib/name", r"Faust Math Library");
        m.declare("maths.lib/version", r"2.8.0");
        m.declare("name", r"chorus");
        m.declare("oscillators.lib/name", r"Faust Oscillator Library");
        m.declare("oscillators.lib/version", r"1.5.1");
        m.declare("platform.lib/name", r"Generic Platform Library");
        m.declare("platform.lib/version", r"1.3.0");
        m.declare("routes.lib/name", r"Faust Signal Routing Library");
        m.declare("routes.lib/version", r"1.2.0");
        m.declare("signals.lib/name", r"Faust Signal Routing Library");
        m.declare("signals.lib/version", r"1.5.0");
    }

    fn get_sample_rate(&self) -> i32 {
        return self.fSampleRate;
    }
    fn get_num_inputs(&self) -> i32 {
        return 1;
    }
    fn get_num_outputs(&self) -> i32 {
        return 2;
    }

    fn class_init(sample_rate: i32) {
        let mut sig0: ChorusSIG0 = newChorusSIG0();
        sig0.instance_initChorusSIG0(sample_rate);
        sig0.fillChorusSIG0(65536, unsafe { &mut ftbl0ChorusSIG0 });
        let mut sig1: ChorusSIG1 = newChorusSIG1();
        sig1.instance_initChorusSIG1(sample_rate);
        sig1.fillChorusSIG1(65536, unsafe { &mut ftbl1ChorusSIG1 });
    }
    fn instance_reset_params(&mut self) {
        self.fVslider0 = 0.0;
        self.fVslider1 = 0.5;
        self.fVslider2 = 0.5;
        self.fVslider3 = 0.5;
        self.fVslider4 = 0.5;
    }
    fn instance_clear(&mut self) {
        for l0 in 0..2 {
            self.iVec0[l0 as usize] = 0;
        }
        for l1 in 0..2 {
            self.fRec0[l1 as usize] = 0.0;
        }
        self.IOTA0 = 0;
        for l2 in 0..8192 {
            self.fVec1[l2 as usize] = 0.0;
        }
        for l3 in 0..2 {
            self.fRec1[l3 as usize] = 0.0;
        }
        for l4 in 0..2 {
            self.fRec2[l4 as usize] = 0.0;
        }
        for l7 in 0..2 {
            self.fRec5[l7 as usize] = 0.0;
        }
        for l8 in 0..2 {
            self.fRec4[l8 as usize] = 0.0;
        }
        for l11 in 0..2 {
            self.fRec7[l11 as usize] = 0.0;
        }
        for l12 in 0..2 {
            self.fRec8[l12 as usize] = 0.0;
        }
        for l13 in 0..2 {
            self.fRec9[l13 as usize] = 0.0;
        }
        for l14 in 0..2 {
            self.fRec10[l14 as usize] = 0.0;
        }
        for l15 in 0..2 {
            self.fRec11[l15 as usize] = 0.0;
        }
        for l16 in 0..2 {
            self.fRec12[l16 as usize] = 0.0;
        }
    }
    fn instance_constants(&mut self, sample_rate: i32) {
        self.fSampleRate = sample_rate;
        self.fConst0 = F32::min(1.92e+05, F32::max(1.0, (self.fSampleRate) as F32));
        self.fConst1 = F32::exp(-(44.12234 / self.fConst0));
        self.fConst2 = 1.0 - self.fConst1;
        self.fConst3 = 0.33333334 / self.fConst0;
        self.fConst4 = 1.0 / self.fConst0;
        self.fConst5 = 0.14285715 / self.fConst0;
        self.fConst6 = 0.5 / self.fConst0;
        self.fConst7 = 0.25 / self.fConst0;
        self.fConst8 = 0.16666667 / self.fConst0;
        self.fConst9 = 0.125 / self.fConst0;
    }
    fn instance_init(&mut self, sample_rate: i32) {
        self.instance_constants(sample_rate);
        self.instance_reset_params();
        self.instance_clear();
    }
    fn init(&mut self, sample_rate: i32) {
        Chorus::class_init(sample_rate);
        self.instance_init(sample_rate);
    }

    fn build_user_interface(&self, ui_interface: &mut dyn UI<Self::T>) {
        Self::build_user_interface_static(ui_interface);
    }

    fn build_user_interface_static(ui_interface: &mut dyn UI<Self::T>) {
        ui_interface.open_vertical_box("chorus");
        ui_interface.declare(Some(ParamIndex(0)), "0", "");
        ui_interface.declare(Some(ParamIndex(0)), "midi", "ctrl 4");
        ui_interface.declare(Some(ParamIndex(0)), "style", "knob");
        ui_interface.add_vertical_slider("Delay", ParamIndex(0), 0.5, 0.0, 1.0, 1.0);
        ui_interface.declare(Some(ParamIndex(1)), "0", "");
        ui_interface.declare(Some(ParamIndex(1)), "midi", "ctrl 105");
        ui_interface.declare(Some(ParamIndex(1)), "style", "knob");
        ui_interface.add_vertical_slider("Enable", ParamIndex(1), 0.0, 0.0, 1.0, 1.0);
        ui_interface.declare(Some(ParamIndex(2)), "1", "");
        ui_interface.declare(Some(ParamIndex(2)), "midi", "ctrl 2");
        ui_interface.declare(Some(ParamIndex(2)), "style", "knob");
        ui_interface.declare(Some(ParamIndex(2)), "unit", "Hz");
        ui_interface.add_vertical_slider("Rate", ParamIndex(2), 0.5, 0.01, 7.0, 0.0001);
        ui_interface.declare(Some(ParamIndex(3)), "4", "");
        ui_interface.declare(Some(ParamIndex(3)), "midi", "ctrl 3");
        ui_interface.declare(Some(ParamIndex(3)), "style", "knob");
        ui_interface.add_vertical_slider("Depth", ParamIndex(3), 0.5, 0.0, 1.0, 0.001);
        ui_interface.declare(Some(ParamIndex(4)), "6", "");
        ui_interface.declare(Some(ParamIndex(4)), "midi", "ctrl 58");
        ui_interface.declare(Some(ParamIndex(4)), "style", "knob");
        ui_interface.add_vertical_slider("Deviation", ParamIndex(4), 0.5, 0.0, 1.0, 0.001);
        ui_interface.close_box();
    }

    fn get_param(&self, param: ParamIndex) -> Option<Self::T> {
        match param.0 {
            1 => Some(self.fVslider0),
            3 => Some(self.fVslider1),
            0 => Some(self.fVslider2),
            4 => Some(self.fVslider3),
            2 => Some(self.fVslider4),
            _ => None,
        }
    }

    fn set_param(&mut self, param: ParamIndex, value: Self::T) {
        match param.0 {
            1 => self.fVslider0 = value,
            3 => self.fVslider1 = value,
            0 => self.fVslider2 = value,
            4 => self.fVslider3 = value,
            2 => self.fVslider4 = value,
            _ => {}
        }
    }

    fn compute(&mut self, count: i32, inputs: &[&[Self::T]], outputs: &mut [&mut [Self::T]]) {
        let (inputs0) = if let [inputs0, ..] = inputs {
            let inputs0 = inputs0[..count as usize].iter();
            (inputs0)
        } else {
            panic!("wrong number of inputs");
        };
        let (outputs0, outputs1) = if let [outputs0, outputs1, ..] = outputs {
            let outputs0 = outputs0[..count as usize].iter_mut();
            let outputs1 = outputs1[..count as usize].iter_mut();
            (outputs0, outputs1)
        } else {
            panic!("wrong number of outputs");
        };
        let mut iSlow0: i32 = i32::wrapping_sub(1, (self.fVslider0) as i32);
        let mut fSlow1: F32 = self.fConst2 * self.fVslider1;
        let mut fSlow2: F32 = 4.096 * self.fVslider2;
        let mut fSlow3: F32 = 6.25e-05 * self.fVslider3;
        let mut fSlow4: F32 = self.fConst2 * self.fVslider4;
        let zipped_iterators = inputs0.zip(outputs0).zip(outputs1);
        for ((input0, output0), output1) in zipped_iterators {
            self.iVec0[0] = 1;
            self.fRec0[0] = fSlow1 + self.fConst1 * self.fRec0[1];
            let mut fTemp0: F32 = *input0;
            let mut fTemp1: F32 = if iSlow0 != 0 { 0.0 } else { fTemp0 };
            let mut fTemp2: F32 = self.fRec0[0] * fTemp1;
            self.fVec1[(self.IOTA0 & 8191) as usize] = fTemp2;
            self.fRec1[0] = fSlow2 + 0.999 * self.fRec1[1];
            self.fRec2[0] = fSlow3 * self.fRec1[0] + 0.999 * self.fRec2[1];
            let mut iTemp3: i32 = i32::wrapping_sub(1, self.iVec0[1]);
            self.fRec5[0] = fSlow4 + self.fConst1 * self.fRec5[1];
            let mut fTemp4: F32 = if iTemp3 != 0 {
                0.0
            } else {
                self.fRec4[1] + self.fConst3 * self.fRec5[0]
            };
            self.fRec4[0] = fTemp4 - F32::floor(fTemp4);
            let mut fTemp5: F32 = F32::min(
                4096.0,
                0.375 * self.fRec1[0]
                    + self.fRec2[0]
                        * unsafe {
                            ftbl0ChorusSIG0[(std::cmp::max(
                                0,
                                std::cmp::min((65536.0 * self.fRec4[0]) as i32, 65535),
                            )) as usize]
                        },
            );
            let mut iTemp6: i32 = (fTemp5) as i32;
            let mut fTemp7: F32 = F32::floor(fTemp5);
            let mut fTemp8: F32 = if iTemp3 != 0 {
                0.0
            } else {
                self.fRec7[1] + self.fConst4 * self.fRec5[0]
            };
            self.fRec7[0] = fTemp8 - F32::floor(fTemp8);
            let mut fTemp9: F32 = F32::min(
                4096.0,
                0.125 * self.fRec1[0]
                    + self.fRec2[0]
                        * unsafe {
                            ftbl1ChorusSIG1[(std::cmp::max(
                                0,
                                std::cmp::min((65536.0 * self.fRec7[0]) as i32, 65535),
                            )) as usize]
                        },
            );
            let mut fTemp10: F32 = F32::floor(fTemp9);
            let mut iTemp11: i32 = (fTemp9) as i32;
            let mut fTemp12: F32 = fTemp1 * (1.0 - self.fRec0[0]);
            let mut fTemp13: F32 = if iTemp3 != 0 {
                0.0
            } else {
                self.fRec8[1] + self.fConst5 * self.fRec5[0]
            };
            self.fRec8[0] = fTemp13 - F32::floor(fTemp13);
            let mut fTemp14: F32 = F32::min(
                4096.0,
                0.875 * self.fRec1[0]
                    - self.fRec2[0]
                        * unsafe {
                            ftbl0ChorusSIG0[(std::cmp::max(
                                0,
                                std::cmp::min((65536.0 * self.fRec8[0]) as i32, 65535),
                            )) as usize]
                        },
            );
            let mut iTemp15: i32 = (fTemp14) as i32;
            let mut fTemp16: F32 = F32::floor(fTemp14);
            *output0 = if iSlow0 != 0 {
                fTemp0
            } else {
                0.70710677
                    * (self.fVec1[((i32::wrapping_sub(
                        self.IOTA0,
                        std::cmp::min(4097, std::cmp::max(0, iTemp6)),
                    )) & 8191) as usize]
                        * (fTemp7 + (1.0 - fTemp5))
                        + (fTemp5 - fTemp7)
                            * self.fVec1[((i32::wrapping_sub(
                                self.IOTA0,
                                std::cmp::min(4097, std::cmp::max(0, i32::wrapping_add(iTemp6, 1))),
                            )) & 8191) as usize])
                    + (fTemp9 - fTemp10)
                        * self.fVec1[((i32::wrapping_sub(
                            self.IOTA0,
                            std::cmp::min(4097, std::cmp::max(0, i32::wrapping_add(iTemp11, 1))),
                        )) & 8191) as usize]
                    + fTemp12
                    + self.fVec1[((i32::wrapping_sub(
                        self.IOTA0,
                        std::cmp::min(4097, std::cmp::max(0, iTemp11)),
                    )) & 8191) as usize]
                        * (fTemp10 + (1.0 - fTemp9))
                    - 0.70710677
                        * (self.fVec1[((i32::wrapping_sub(
                            self.IOTA0,
                            std::cmp::min(4097, std::cmp::max(0, iTemp15)),
                        )) & 8191) as usize]
                            * (fTemp16 + (1.0 - fTemp14))
                            + (fTemp14 - fTemp16)
                                * self.fVec1[((i32::wrapping_sub(
                                    self.IOTA0,
                                    std::cmp::min(
                                        4097,
                                        std::cmp::max(0, i32::wrapping_add(iTemp15, 1)),
                                    ),
                                )) & 8191) as usize])
            };
            let mut fTemp17: F32 = if iTemp3 != 0 {
                0.0
            } else {
                self.fRec9[1] + self.fConst6 * self.fRec5[0]
            };
            self.fRec9[0] = fTemp17 - F32::floor(fTemp17);
            let mut iTemp18: i32 =
                std::cmp::max(0, std::cmp::min((65536.0 * self.fRec9[0]) as i32, 65535));
            let mut fTemp19: F32 = F32::min(
                4096.0,
                0.25 * self.fRec1[0]
                    + self.fRec2[0]
                        * (0.70710677 * unsafe { ftbl1ChorusSIG1[iTemp18 as usize] }
                            + 0.70710677 * unsafe { ftbl0ChorusSIG0[iTemp18 as usize] }),
            );
            let mut iTemp20: i32 = (fTemp19) as i32;
            let mut fTemp21: F32 = F32::floor(fTemp19);
            let mut fTemp22: F32 = if iTemp3 != 0 {
                0.0
            } else {
                self.fRec10[1] + self.fConst7 * self.fRec5[0]
            };
            self.fRec10[0] = fTemp22 - F32::floor(fTemp22);
            let mut iTemp23: i32 =
                std::cmp::max(0, std::cmp::min((65536.0 * self.fRec10[0]) as i32, 65535));
            let mut fTemp24: F32 = F32::min(
                4096.0,
                0.5 * self.fRec1[0]
                    + self.fRec2[0]
                        * (0.70710677 * unsafe { ftbl0ChorusSIG0[iTemp23 as usize] }
                            - 0.70710677 * unsafe { ftbl1ChorusSIG1[iTemp23 as usize] }),
            );
            let mut iTemp25: i32 = (fTemp24) as i32;
            let mut fTemp26: F32 = F32::floor(fTemp24);
            let mut fTemp27: F32 = if iTemp3 != 0 {
                0.0
            } else {
                self.fRec11[1] + self.fConst8 * self.fRec5[0]
            };
            self.fRec11[0] = fTemp27 - F32::floor(fTemp27);
            let mut iTemp28: i32 =
                std::cmp::max(0, std::cmp::min((65536.0 * self.fRec11[0]) as i32, 65535));
            let mut fTemp29: F32 = F32::min(
                4096.0,
                0.75 * self.fRec1[0]
                    - self.fRec2[0]
                        * (0.70710677 * unsafe { ftbl1ChorusSIG1[iTemp28 as usize] }
                            + 0.70710677 * unsafe { ftbl0ChorusSIG0[iTemp28 as usize] }),
            );
            let mut iTemp30: i32 = (fTemp29) as i32;
            let mut fTemp31: F32 = F32::floor(fTemp29);
            let mut fTemp32: F32 = if iTemp3 != 0 {
                0.0
            } else {
                self.fRec12[1] + self.fConst9 * self.fRec5[0]
            };
            self.fRec12[0] = fTemp32 - F32::floor(fTemp32);
            let mut iTemp33: i32 =
                std::cmp::max(0, std::cmp::min((65536.0 * self.fRec12[0]) as i32, 65535));
            let mut fTemp34: F32 = F32::min(
                4096.0,
                self.fRec1[0]
                    + self.fRec2[0]
                        * (0.70710677 * unsafe { ftbl1ChorusSIG1[iTemp33 as usize] }
                            - 0.70710677 * unsafe { ftbl0ChorusSIG0[iTemp33 as usize] }),
            );
            let mut iTemp35: i32 = (fTemp34) as i32;
            let mut fTemp36: F32 = F32::floor(fTemp34);
            *output1 = if iSlow0 != 0 {
                fTemp0
            } else {
                fTemp12
                    - (0.38268343
                        * (self.fVec1[((i32::wrapping_sub(
                            self.IOTA0,
                            std::cmp::min(4097, std::cmp::max(0, iTemp20)),
                        )) & 8191) as usize]
                            * (fTemp21 + (1.0 - fTemp19))
                            + (fTemp19 - fTemp21)
                                * self.fVec1[((i32::wrapping_sub(
                                    self.IOTA0,
                                    std::cmp::min(
                                        4097,
                                        std::cmp::max(0, i32::wrapping_add(iTemp20, 1)),
                                    ),
                                )) & 8191) as usize])
                        + 0.9238795
                            * (self.fVec1[((i32::wrapping_sub(
                                self.IOTA0,
                                std::cmp::min(4097, std::cmp::max(0, iTemp25)),
                            )) & 8191) as usize]
                                * (fTemp26 + (1.0 - fTemp24))
                                + (fTemp24 - fTemp26)
                                    * self.fVec1[((i32::wrapping_sub(
                                        self.IOTA0,
                                        std::cmp::min(
                                            4097,
                                            std::cmp::max(0, i32::wrapping_add(iTemp25, 1)),
                                        ),
                                    )) & 8191)
                                        as usize])
                        + 0.9238795
                            * (self.fVec1[((i32::wrapping_sub(
                                self.IOTA0,
                                std::cmp::min(4097, std::cmp::max(0, iTemp30)),
                            )) & 8191) as usize]
                                * (fTemp31 + (1.0 - fTemp29))
                                + (fTemp29 - fTemp31)
                                    * self.fVec1[((i32::wrapping_sub(
                                        self.IOTA0,
                                        std::cmp::min(
                                            4097,
                                            std::cmp::max(0, i32::wrapping_add(iTemp30, 1)),
                                        ),
                                    )) & 8191)
                                        as usize])
                        + 0.38268343
                            * (self.fVec1[((i32::wrapping_sub(
                                self.IOTA0,
                                std::cmp::min(4097, std::cmp::max(0, iTemp35)),
                            )) & 8191) as usize]
                                * (fTemp36 + (1.0 - fTemp34))
                                + (fTemp34 - fTemp36)
                                    * self.fVec1[((i32::wrapping_sub(
                                        self.IOTA0,
                                        std::cmp::min(
                                            4097,
                                            std::cmp::max(0, i32::wrapping_add(iTemp35, 1)),
                                        ),
                                    )) & 8191)
                                        as usize]))
            };
            self.iVec0[1] = self.iVec0[0];
            self.fRec0[1] = self.fRec0[0];
            self.IOTA0 = i32::wrapping_add(self.IOTA0, 1);
            self.fRec1[1] = self.fRec1[0];
            self.fRec2[1] = self.fRec2[0];
            self.fRec5[1] = self.fRec5[0];
            self.fRec4[1] = self.fRec4[0];
            self.fRec7[1] = self.fRec7[0];
            self.fRec8[1] = self.fRec8[0];
            self.fRec9[1] = self.fRec9[0];
            self.fRec10[1] = self.fRec10[0];
            self.fRec11[1] = self.fRec11[0];
            self.fRec12[1] = self.fRec12[0];
        }
    }
}
