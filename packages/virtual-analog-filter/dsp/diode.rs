/* ------------------------------------------------------------
name: "diode"
Code generated with Faust 2.72.14 (https://faust.grame.fr)
Compilation options: -lang rust -ct 1 -cn Diode -es 1 -mcd 16 -mdd 1024 -mdy 33 -single -ftz 0
------------------------------------------------------------ */

fn Diode_faustpower2_f(value: F32) -> F32 {
	return value * value;
}
fn Diode_faustpower4_f(value: F32) -> F32 {
	return value * value * value * value;
}
fn Diode_faustpower3_f(value: F32) -> F32 {
	return value * value * value;
}
mod ffi {
	use std::os::raw::{c_float};
	#[link(name = "m")]
	extern {
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
pub struct Diode {
	fSampleRate: i32,
	fConst0: F32,
	fConst1: F32,
	fConst2: F32,
	fHslider0: F32,
	fConst3: F32,
	fHslider1: F32,
	fRec1: [F32;2],
	fRec2: [F32;2],
	fRec3: [F32;2],
	fRec4: [F32;2],
}

impl FaustDsp for Diode {
	type T = F32;
		
	fn new() -> Diode { 
		Diode {
			fSampleRate: 0,
			fConst0: 0.0,
			fConst1: 0.0,
			fConst2: 0.0,
			fHslider0: 0.0,
			fConst3: 0.0,
			fHslider1: 0.0,
			fRec1: [0.0;2],
			fRec2: [0.0;2],
			fRec3: [0.0;2],
			fRec4: [0.0;2],
		}
	}
	fn metadata(&self, m: &mut dyn Meta) { 
		m.declare("compile_options", r"-lang rust -ct 1 -cn Diode -es 1 -mcd 16 -mdd 1024 -mdy 33 -single -ftz 0");
		m.declare("filename", r"diode.dsp");
		m.declare("maths.lib/author", r"GRAME");
		m.declare("maths.lib/copyright", r"GRAME");
		m.declare("maths.lib/license", r"LGPL with exception");
		m.declare("maths.lib/name", r"Faust Math Library");
		m.declare("maths.lib/version", r"2.8.0");
		m.declare("misceffects.lib/cubicnl:author", r"Julius O. Smith III");
		m.declare("misceffects.lib/cubicnl:license", r"STK-4.3");
		m.declare("misceffects.lib/name", r"Misc Effects Library");
		m.declare("misceffects.lib/version", r"2.4.0");
		m.declare("name", r"diode");
		m.declare("platform.lib/name", r"Generic Platform Library");
		m.declare("platform.lib/version", r"1.3.0");
		m.declare("vaeffects.lib/diodeLadder:author", r"Eric Tarr");
		m.declare("vaeffects.lib/diodeLadder:license", r"MIT-style STK-4.3 license");
		m.declare("vaeffects.lib/name", r"Faust Virtual Analog Filter Effect Library");
		m.declare("vaeffects.lib/version", r"1.2.1");
	}

	fn get_sample_rate(&self) -> i32 {
		return self.fSampleRate;
	}
	fn get_num_inputs(&self) -> i32 {
		return 1;
	}
	fn get_num_outputs(&self) -> i32 {
		return 1;
	}
	
	fn class_init(sample_rate: i32) {
	}
	fn instance_reset_params(&mut self) {
		self.fHslider0 = 1e+03;
		self.fHslider1 = 0.5;
	}
	fn instance_clear(&mut self) {
		for l0 in 0..2 {
			self.fRec1[l0 as usize] = 0.0;
		}
		for l1 in 0..2 {
			self.fRec2[l1 as usize] = 0.0;
		}
		for l2 in 0..2 {
			self.fRec3[l2 as usize] = 0.0;
		}
		for l3 in 0..2 {
			self.fRec4[l3 as usize] = 0.0;
		}
	}
	fn instance_constants(&mut self, sample_rate: i32) {
		self.fSampleRate = sample_rate;
		self.fConst0 = F32::min(1.92e+05, F32::max(1.0, (self.fSampleRate) as F32));
		self.fConst1 = 6.2831855 / self.fConst0;
		self.fConst2 = 6.0 / self.fConst0;
		self.fConst3 = 2.0 / self.fConst0;
	}
	fn instance_init(&mut self, sample_rate: i32) {
		self.instance_constants(sample_rate);
		self.instance_reset_params();
		self.instance_clear();
	}
	fn init(&mut self, sample_rate: i32) {
		Diode::class_init(sample_rate);
		self.instance_init(sample_rate);
	}
	
	fn build_user_interface(&self, ui_interface: &mut dyn UI<Self::T>) {
		Self::build_user_interface_static(ui_interface);
	}
	
	fn build_user_interface_static(ui_interface: &mut dyn UI<Self::T>) {
		ui_interface.open_vertical_box("diode");
		ui_interface.add_horizontal_slider("Cutoff Frequency (Hz)", ParamIndex(0), 1e+03, 2e+01, 2e+04, 1.0);
		ui_interface.add_horizontal_slider("Q", ParamIndex(1), 0.5, 0.0, 1.0, 0.01);
		ui_interface.close_box();
	}
	
	fn get_param(&self, param: ParamIndex) -> Option<Self::T> {
		match param.0 {
			0 => Some(self.fHslider0),
			1 => Some(self.fHslider1),
			_ => None,
		}
	}
	
	fn set_param(&mut self, param: ParamIndex, value: Self::T) {
		match param.0 {
			0 => { self.fHslider0 = value }
			1 => { self.fHslider1 = value }
			_ => {}
		}
	}
	
	fn compute(&mut self, count: i32, inputs: &[&[Self::T]], outputs: &mut[&mut[Self::T]]) {
		let (inputs0) = if let [inputs0, ..] = inputs {
			let inputs0 = inputs0[..count as usize].iter();
			(inputs0)
		} else {
			panic!("wrong number of inputs");
		};
		let (outputs0) = if let [outputs0, ..] = outputs {
			let outputs0 = outputs0[..count as usize].iter_mut();
			(outputs0)
		} else {
			panic!("wrong number of outputs");
		};
		let mut fSlow0: F32 = self.fHslider0;
		let mut fSlow1: F32 = F32::tan(self.fConst1 * F32::powf(1e+01, self.fConst2 * fSlow0 + 1.0));
		let mut fSlow2: F32 = fSlow1 + 1.0;
		let mut fSlow3: F32 = fSlow1 / fSlow2;
		let mut fSlow4: F32 = Diode_faustpower2_f(fSlow1);
		let mut fSlow5: F32 = fSlow1 * (1.0 - 0.25 * fSlow3) + 1.0;
		let mut fSlow6: F32 = fSlow2 * fSlow5;
		let mut fSlow7: F32 = 0.25 * (fSlow4 / fSlow6) + 1.0;
		let mut fSlow8: F32 = fSlow1 / fSlow5;
		let mut fSlow9: F32 = fSlow1 * (1.0 - 0.25 * fSlow8) + 1.0;
		let mut fSlow10: F32 = fSlow5 * fSlow9;
		let mut fSlow11: F32 = 0.25 * (fSlow4 / fSlow10) + 1.0;
		let mut fSlow12: F32 = fSlow1 / fSlow9;
		let mut fSlow13: F32 = 0.5 * fSlow12;
		let mut fSlow14: F32 = fSlow1 * (1.0 - fSlow13) + 1.0;
		let mut fSlow15: F32 = 17.0 - 9.7 * F32::powf(self.fConst3 * fSlow0, 1e+01);
		let mut fSlow16: F32 = 24.293 * self.fHslider1 + -0.00010678119;
		let mut fSlow17: F32 = (0.5 * (fSlow4 / (fSlow9 * fSlow14)) + 1.0) / (0.0051455377 * (Diode_faustpower4_f(fSlow1) * fSlow15 * fSlow16 / (fSlow6 * fSlow9 * fSlow14)) + 1.0);
		let mut fSlow18: F32 = fSlow15 * fSlow16 / fSlow2;
		let mut fSlow19: F32 = 0.02058215 * fSlow8;
		let mut fSlow20: F32 = 0.5 * fSlow3;
		let mut fSlow21: F32 = 0.02058215 * fSlow12;
		let mut fSlow22: F32 = 0.5 * fSlow8;
		let mut fSlow23: F32 = 0.0051455377 * (Diode_faustpower3_f(fSlow1) / (fSlow10 * fSlow14));
		let mut fSlow24: F32 = 1.0 / fSlow9;
		let mut fSlow25: F32 = 0.5 * (fSlow1 / fSlow14);
		let mut fSlow26: F32 = 1.0 / fSlow5;
		let mut fSlow27: F32 = 1.0 / fSlow2;
		let mut fSlow28: F32 = 2.0 * fSlow3;
		let zipped_iterators = inputs0.zip(outputs0);
		for (input0, output0) in zipped_iterators {
			let mut fTemp0: F32 = F32::max(-1.0, F32::min(1.0, 1e+02 * *input0));
			let mut fTemp1: F32 = fSlow20 * self.fRec1[1] + self.fRec2[1];
			let mut fTemp2: F32 = fSlow22 * fTemp1;
			let mut fTemp3: F32 = fTemp2 + self.fRec3[1];
			let mut fTemp4: F32 = fSlow12 * fTemp3 + self.fRec4[1];
			let mut fTemp5: F32 = fSlow17 * (1.5 * fTemp0 * (1.0 - 0.33333334 * Diode_faustpower2_f(fTemp0)) - fSlow18 * (0.0411643 * self.fRec1[1] + fSlow19 * fTemp1 + fSlow21 * fTemp3 + fSlow23 * fTemp4)) + fSlow24 * (fTemp3 + fSlow25 * fTemp4) - self.fRec4[1];
			let mut fTemp6: F32 = 0.5 * (fSlow11 * (self.fRec4[1] + fSlow3 * fTemp5) + fSlow26 * (fTemp1 + fSlow13 * fTemp3)) - self.fRec3[1];
			let mut fTemp7: F32 = 0.5 * (fSlow7 * (self.fRec3[1] + fSlow3 * fTemp6) + fSlow27 * (self.fRec1[1] + fTemp2)) - self.fRec2[1];
			let mut fTemp8: F32 = 0.5 * (self.fRec2[1] + fSlow3 * fTemp7) - self.fRec1[1];
			let mut fRec0: F32 = self.fRec1[1] + fSlow3 * fTemp8;
			self.fRec1[0] = self.fRec1[1] + fSlow28 * fTemp8;
			self.fRec2[0] = self.fRec2[1] + fSlow28 * fTemp7;
			self.fRec3[0] = self.fRec3[1] + fSlow28 * fTemp6;
			self.fRec4[0] = self.fRec4[1] + fSlow28 * fTemp5;
			*output0 = fRec0;
			self.fRec1[1] = self.fRec1[0];
			self.fRec2[1] = self.fRec2[0];
			self.fRec3[1] = self.fRec3[0];
			self.fRec4[1] = self.fRec4[0];
		}
	}

}

