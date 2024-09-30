/* ------------------------------------------------------------
name: "oberheim"
Code generated with Faust 2.72.14 (https://faust.grame.fr)
Compilation options: -lang rust -ct 1 -cn Oberheim -es 1 -mcd 16 -mdd 1024 -mdy 33 -single -ftz 0
------------------------------------------------------------ */

fn Oberheim_faustpower2_f(value: F32) -> F32 {
	return value * value;
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
pub struct Oberheim {
	fSampleRate: i32,
	fConst0: F32,
	fConst1: F32,
	fConst2: F32,
	fHslider0: F32,
	fHslider1: F32,
	fRec4: [F32;2],
	fRec5: [F32;2],
}

impl FaustDsp for Oberheim {
	type T = F32;
		
	fn new() -> Oberheim { 
		Oberheim {
			fSampleRate: 0,
			fConst0: 0.0,
			fConst1: 0.0,
			fConst2: 0.0,
			fHslider0: 0.0,
			fHslider1: 0.0,
			fRec4: [0.0;2],
			fRec5: [0.0;2],
		}
	}
	fn metadata(&self, m: &mut dyn Meta) { 
		m.declare("compile_options", r"-lang rust -ct 1 -cn Oberheim -es 1 -mcd 16 -mdd 1024 -mdy 33 -single -ftz 0");
		m.declare("filename", r"oberheim.dsp");
		m.declare("maths.lib/author", r"GRAME");
		m.declare("maths.lib/copyright", r"GRAME");
		m.declare("maths.lib/license", r"LGPL with exception");
		m.declare("maths.lib/name", r"Faust Math Library");
		m.declare("maths.lib/version", r"2.8.0");
		m.declare("misceffects.lib/cubicnl:author", r"Julius O. Smith III");
		m.declare("misceffects.lib/cubicnl:license", r"STK-4.3");
		m.declare("misceffects.lib/name", r"Misc Effects Library");
		m.declare("misceffects.lib/version", r"2.4.0");
		m.declare("name", r"oberheim");
		m.declare("platform.lib/name", r"Generic Platform Library");
		m.declare("platform.lib/version", r"1.3.0");
		m.declare("vaeffects.lib/name", r"Faust Virtual Analog Filter Effect Library");
		m.declare("vaeffects.lib/oberheim:author", r"Eric Tarr");
		m.declare("vaeffects.lib/oberheim:license", r"MIT-style STK-4.3 license");
		m.declare("vaeffects.lib/version", r"1.2.1");
	}

	fn get_sample_rate(&self) -> i32 {
		return self.fSampleRate;
	}
	fn get_num_inputs(&self) -> i32 {
		return 1;
	}
	fn get_num_outputs(&self) -> i32 {
		return 4;
	}
	
	fn class_init(sample_rate: i32) {
	}
	fn instance_reset_params(&mut self) {
		self.fHslider0 = 1e+03;
		self.fHslider1 = 0.5;
	}
	fn instance_clear(&mut self) {
		for l0 in 0..2 {
			self.fRec4[l0 as usize] = 0.0;
		}
		for l1 in 0..2 {
			self.fRec5[l1 as usize] = 0.0;
		}
	}
	fn instance_constants(&mut self, sample_rate: i32) {
		self.fSampleRate = sample_rate;
		self.fConst0 = F32::min(1.92e+05, F32::max(1.0, (self.fSampleRate) as F32));
		self.fConst1 = 6.2831855 / self.fConst0;
		self.fConst2 = 6.0 / self.fConst0;
	}
	fn instance_init(&mut self, sample_rate: i32) {
		self.instance_constants(sample_rate);
		self.instance_reset_params();
		self.instance_clear();
	}
	fn init(&mut self, sample_rate: i32) {
		Oberheim::class_init(sample_rate);
		self.instance_init(sample_rate);
	}
	
	fn build_user_interface(&self, ui_interface: &mut dyn UI<Self::T>) {
		Self::build_user_interface_static(ui_interface);
	}
	
	fn build_user_interface_static(ui_interface: &mut dyn UI<Self::T>) {
		ui_interface.open_vertical_box("oberheim");
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
		let (outputs0, outputs1, outputs2, outputs3) = if let [outputs0, outputs1, outputs2, outputs3, ..] = outputs {
			let outputs0 = outputs0[..count as usize].iter_mut();
			let outputs1 = outputs1[..count as usize].iter_mut();
			let outputs2 = outputs2[..count as usize].iter_mut();
			let outputs3 = outputs3[..count as usize].iter_mut();
			(outputs0, outputs1, outputs2, outputs3)
		} else {
			panic!("wrong number of outputs");
		};
		let mut fSlow0: F32 = F32::tan(self.fConst1 * F32::powf(1e+01, self.fConst2 * self.fHslider0 + 1.0));
		let mut fSlow1: F32 = 1.0 / (29.293 * self.fHslider1 + 0.707) + fSlow0;
		let mut fSlow2: F32 = fSlow0 * fSlow1 + 1.0;
		let mut fSlow3: F32 = fSlow0 / fSlow2;
		let mut fSlow4: F32 = 1.0 / fSlow2;
		let mut fSlow5: F32 = 2.0 * fSlow0;
		let zipped_iterators = inputs0.zip(outputs0).zip(outputs1).zip(outputs2).zip(outputs3);
		for ((((input0, output0), output1), output2), output3) in zipped_iterators {
			let mut fTemp0: F32 = *input0 - (self.fRec4[1] + fSlow1 * self.fRec5[1]);
			let mut fTemp1: F32 = fSlow3 * fTemp0;
			let mut fTemp2: F32 = F32::max(-1.0, F32::min(1.0, self.fRec5[1] + fTemp1));
			let mut fTemp3: F32 = fTemp2 * (1.0 - 0.33333334 * Oberheim_faustpower2_f(fTemp2));
			let mut fTemp4: F32 = fSlow0 * fTemp3;
			let mut fRec0: F32 = self.fRec4[1] + fTemp4;
			let mut fTemp5: F32 = fSlow4 * fTemp0;
			let mut fRec1: F32 = fTemp5;
			let mut fRec2: F32 = fTemp3;
			let mut fRec3: F32 = fTemp4 + self.fRec4[1] + fTemp5;
			self.fRec4[0] = self.fRec4[1] + fSlow5 * fTemp3;
			self.fRec5[0] = fTemp1 + fTemp3;
			*output0 = fRec3;
			*output1 = fRec2;
			*output2 = fRec1;
			*output3 = fRec0;
			self.fRec4[1] = self.fRec4[0];
			self.fRec5[1] = self.fRec5[0];
		}
	}

}

