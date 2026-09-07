/* ------------------------------------------------------------
name: "moog"
Code generated with Faust 2.85.9 (https://faust.grame.fr)
Compilation options: -lang rust -fpga-mem-th 4 -ct 1 -cn Moog -es 1 -mcd 16 -mdd 1024 -mdy 33 -single -ftz 0
------------------------------------------------------------ */

#[repr(C)]
pub struct Moog {
	fSampleRate: i32,
	fConst0: F32,
	fHslider0: FaustFloat,
	fHslider1: FaustFloat,
	fRec0: [F32;2],
	fRec1: [F32;2],
	fRec2: [F32;2],
	fRec3: [F32;2],
}


fn Moog_faustpower4_f(value: F32) -> F32 {
	return value * value * value * value;
}
pub const FAUST_INPUTS: usize = 1;
pub const FAUST_OUTPUTS: usize = 1;
pub const FAUST_ACTIVES: usize = 2;
pub const FAUST_PASSIVES: usize = 0;

impl Moog {
		
	pub fn new() -> Moog { 
		Moog {
			fSampleRate: 0,
			fConst0: 0.0,
			fHslider0: 0.0,
			fHslider1: 0.0,
			fRec0: [0.0;2],
			fRec1: [0.0;2],
			fRec2: [0.0;2],
			fRec3: [0.0;2],
		}
	}
	pub fn metadata(&self, m: &mut dyn Meta) { 
		m.declare("compile_options", r"-lang rust -fpga-mem-th 4 -ct 1 -cn Moog -es 1 -mcd 16 -mdd 1024 -mdy 33 -single -ftz 0");
		m.declare("filename", r"moog.dsp");
		m.declare("maths.lib/author", r"GRAME");
		m.declare("maths.lib/copyright", r"GRAME");
		m.declare("maths.lib/license", r"LGPL with exception");
		m.declare("maths.lib/name", r"Faust Math Library");
		m.declare("maths.lib/version", r"2.9.0");
		m.declare("name", r"moog");
		m.declare("platform.lib/name", r"Generic Platform Library");
		m.declare("platform.lib/version", r"1.3.0");
		m.declare("signals.lib/name", r"Faust Routing Library");
		m.declare("signals.lib/version", r"1.6.0");
		m.declare("vaeffects.lib/moogLadder:author", r"Dario Sanfilippo");
		m.declare("vaeffects.lib/moogLadder:license", r"MIT-style STK-4.3 license");
		m.declare("vaeffects.lib/name", r"Faust Virtual Analog Filter Effect Library");
		m.declare("vaeffects.lib/version", r"1.5.0");
	}

	pub fn get_sample_rate(&self) -> i32 { self.fSampleRate as i32}
	
	pub fn class_init(sample_rate: i32) {
		// Obtaining locks on 0 static var(s)
	}
	pub fn instance_reset_params(&mut self) {
		self.fHslider0 = (1e+03) as FaustFloat;
		self.fHslider1 = (0.5) as FaustFloat;
	}
	pub fn instance_clear(&mut self) {
		for l0 in 0..2 {
			self.fRec0[l0 as usize] = 0.0;
		}
		for l1 in 0..2 {
			self.fRec1[l1 as usize] = 0.0;
		}
		for l2 in 0..2 {
			self.fRec2[l2 as usize] = 0.0;
		}
		for l3 in 0..2 {
			self.fRec3[l3 as usize] = 0.0;
		}
	}
	pub fn instance_constants(&mut self, sample_rate: i32) {
		// Obtaining locks on 0 static var(s)
		self.fSampleRate = sample_rate;
		self.fConst0 = 6.2831855 / F32::min(1.92e+05, F32::max(1.0, (self.fSampleRate) as F32));
	}
	pub fn instance_init(&mut self, sample_rate: i32) {
		self.instance_constants(sample_rate);
		self.instance_reset_params();
		self.instance_clear();
	}
	pub fn init(&mut self, sample_rate: i32) {
		Moog::class_init(sample_rate);
		self.instance_init(sample_rate);
	}
	
	pub fn build_user_interface(&self, ui_interface: &mut dyn UI<FaustFloat>) {
		Self::build_user_interface_static(ui_interface);
	}
	
	pub fn build_user_interface_static(ui_interface: &mut dyn UI<FaustFloat>) {
		ui_interface.open_vertical_box("moog");
		ui_interface.add_horizontal_slider("Cutoff Frequency (Hz)", ParamIndex(0), 1e+03, 2e+01, 2e+04, 1.0);
		ui_interface.add_horizontal_slider("Q", ParamIndex(1), 0.5, 0.0, 1.0, 0.01);
		ui_interface.close_box();
	}
	
	pub fn get_param(&self, param: ParamIndex) -> Option<FaustFloat> {
		match param.0 {
			0 => Some(self.fHslider0),
			1 => Some(self.fHslider1),
			_ => None,
		}
	}
	
	pub fn set_param(&mut self, param: ParamIndex, value: FaustFloat) {
		match param.0 {
			0 => { self.fHslider0 = value }
			1 => { self.fHslider1 = value }
			_ => {}
		}
	}
	
	pub fn compute(
		&mut self,
		count: usize,
		inputs: &[impl AsRef<[FaustFloat]>],
		outputs: &mut[impl AsMut<[FaustFloat]>],
	) {
		
		// Obtaining locks on 0 static var(s)
		let [inputs0, .. ] = inputs.as_ref() else { panic!("wrong number of input buffers"); };
		let inputs0 = inputs0.as_ref()[..count].iter();
		let [outputs0, .. ] = outputs.as_mut() else { panic!("wrong number of output buffers"); };
		let outputs0 = outputs0.as_mut()[..count].iter_mut();
		let mut fSlow0: F32 = F32::tan(self.fConst0 * F32::powf(1e+01, 3.0 * F32::max(0.0, F32::min(1.0, 0.33333334 * (F32::log10(0.5 * (self.fHslider0) as F32) + -1.0))) + 1.0));
		let mut fSlow1: F32 = fSlow0 + 1.0;
		let mut fSlow2: F32 = fSlow0 / fSlow1;
		let mut fSlow3: F32 = 2.0 * fSlow2;
		let mut fSlow4: F32 = 24.293 * (self.fHslider1) as F32 + -0.00010678119;
		let mut fSlow5: F32 = 1.0 / (0.1646572 * (Moog_faustpower4_f(fSlow0) * fSlow4 / Moog_faustpower4_f(fSlow1)) + 1.0);
		let mut fSlow6: F32 = 0.1646572 * fSlow4 * (1.0 - fSlow2);
		let zipped_iterators = inputs0.zip(outputs0);
		for (input0, output0) in zipped_iterators {
			let mut fTemp0: F32 = fSlow5 * ((*input0) as F32 - fSlow6 * (self.fRec3[1] + fSlow2 * (self.fRec2[1] + fSlow2 * (self.fRec1[1] + fSlow2 * self.fRec0[1])))) - self.fRec0[1];
			self.fRec0[0] = self.fRec0[1] + fSlow3 * fTemp0;
			let mut fTemp1: F32 = self.fRec0[1] + fSlow2 * fTemp0 - self.fRec1[1];
			self.fRec1[0] = self.fRec1[1] + fSlow3 * fTemp1;
			let mut fTemp2: F32 = self.fRec1[1] + fSlow2 * fTemp1 - self.fRec2[1];
			self.fRec2[0] = self.fRec2[1] + fSlow3 * fTemp2;
			let mut fTemp3: F32 = self.fRec2[1] + fSlow2 * fTemp2 - self.fRec3[1];
			self.fRec3[0] = self.fRec3[1] + fSlow3 * fTemp3;
			let mut fRec4: F32 = self.fRec3[1] + fSlow2 * fTemp3;
			*output0 = (fRec4) as FaustFloat;
			self.fRec0[1] = self.fRec0[0];
			self.fRec1[1] = self.fRec1[0];
			self.fRec2[1] = self.fRec2[0];
			self.fRec3[1] = self.fRec3[0];
		}
		
	}

}

#[cfg(not(target_arch = "wasm32"))] // Compile ffi bindings only on non-wasm targets
mod ffi {
	use core::ffi::c_float;
	// Conditionally compile the link attribute only on non-Windows platforms
	#[cfg_attr(not(target_os = "windows"), link(name = "m"))]
	unsafe extern "C" {
		pub fn remainderf(from: c_float, to: c_float) -> c_float;
		pub fn rintf(val: c_float) -> c_float;
	}
}
fn remainderf(from: f32, to: f32) -> f32 {
	#[cfg(not(target_arch = "wasm32"))] // non-wasm targets use ffi bindings
	unsafe { ffi::remainderf(from, to) }
	#[cfg(target_arch = "wasm32")] // wasm relies on libm
	libm::remainderf(from, to)
}
fn rintf(val: f32) -> f32 {
	#[cfg(not(target_arch = "wasm32"))] // non-wasm targets use ffi bindings
	unsafe { ffi::rintf(val) }
	#[cfg(target_arch = "wasm32")] // wasm relies on libm
	libm::rintf(val)
}

impl FaustDsp for Moog {
	type T = FaustFloat;
	fn new() -> Self where Self: Sized {
		Self::new()
	}
	fn metadata(&self, m: &mut dyn Meta) {
		self.metadata(m)
	}
	fn get_sample_rate(&self) -> i32 {
		self.get_sample_rate()
	}
	fn get_num_inputs(&self) -> i32 {
		FAUST_INPUTS as i32
	}
	fn get_num_outputs(&self) -> i32 {
		FAUST_OUTPUTS as i32
	}
	fn class_init(sample_rate: i32) where Self: Sized {
		Self::class_init(sample_rate);
	}
	fn instance_reset_params(&mut self) {
		self.instance_reset_params()
	}
	fn instance_clear(&mut self) {
		self.instance_clear()
	}
	fn instance_constants(&mut self, sample_rate: i32) {
		self.instance_constants(sample_rate)
	}
	fn instance_init(&mut self, sample_rate: i32) {
		self.instance_init(sample_rate)
	}
	fn init(&mut self, sample_rate: i32) {
		self.init(sample_rate)
	}
	fn build_user_interface(&self, ui_interface: &mut dyn UI<Self::T>) {
		self.build_user_interface(ui_interface)
	}
	fn build_user_interface_static(ui_interface: &mut dyn UI<Self::T>) where Self: Sized {
		Self::build_user_interface_static(ui_interface);
	}
	fn get_param(&self, param: ParamIndex) -> Option<Self::T> {
		self.get_param(param)
	}
	fn set_param(&mut self, param: ParamIndex, value: Self::T) {
		self.set_param(param, value)
	}
	fn compute(&mut self, count: i32, inputs: &[&[Self::T]], outputs: &mut [&mut [Self::T]]) {
		self.compute(count as usize, inputs, outputs)
	}
}
