/* ------------------------------------------------------------
name: "untitled"
Code generated with Faust 2.75.7 (https://faust.grame.fr)
Compilation options: -a /usr/local/share/faust/rust/jack-float.rs -lang rust -ct 1 -es 1 -mcd 16 -mdd 1024 -mdy 33 -single -ftz 0
------------------------------------------------------------ */
/************************************************************************
FAUST Architecture File
Copyright (C) 2003-2024 GRAME, Centre National de Creation Musicale
---------------------------------------------------------------------
This Architecture section is free software; you can redistribute it
and/or modify it under the terms of the GNU General Public License
as published by the Free Software Foundation; either version 3 of
the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program; If not, see <http://www.gnu.org/licenses/>.

EXCEPTION : As a special exception, you may create a larger work
that contains this FAUST architecture section and distribute
that work under terms of your choice, so long as this FAUST
architecture section is not modified.

************************************************************************
************************************************************************/

#![allow(unused_parens)]
#![allow(non_snake_case)]
#![allow(non_camel_case_types)]
#![allow(dead_code)]
#![allow(unused_variables)]
#![allow(unused_mut)]
#![allow(non_upper_case_globals)]

//! Faust JACK architecture file
extern crate jack;
use jack::prelude as j;
use std::io;
extern crate libm;

type F32 = f32;
type F64 = f64;

#[derive(Copy, Clone)]
pub struct ParamIndex(pub i32);

pub struct Soundfile<'a, T> {
    fBuffers: &'a &'a T,
    fLength: &'a i32,
    fSR: &'a i32,
    fOffset: &'a i32,
    fChannels: i32,
}

pub trait FaustDsp {
    type T;

    fn new() -> Self
    where
        Self: Sized;
    fn metadata(&self, m: &mut dyn Meta);
    fn get_sample_rate(&self) -> i32;
    fn get_num_inputs(&self) -> i32;
    fn get_num_outputs(&self) -> i32;
    fn class_init(sample_rate: i32)
    where
        Self: Sized;
    fn instance_reset_params(&mut self);
    fn instance_clear(&mut self);
    fn instance_constants(&mut self, sample_rate: i32);
    fn instance_init(&mut self, sample_rate: i32);
    fn init(&mut self, sample_rate: i32);
    fn build_user_interface(&self, ui_interface: &mut dyn UI<Self::T>);
    fn build_user_interface_static(ui_interface: &mut dyn UI<Self::T>)
    where
        Self: Sized;
    fn get_param(&self, param: ParamIndex) -> Option<Self::T>;
    fn set_param(&mut self, param: ParamIndex, value: Self::T);
    fn compute(&mut self, count: i32, inputs: &[&[Self::T]], outputs: &mut [&mut [Self::T]]);
}

pub trait Meta {
    // -- metadata declarations
    fn declare(&mut self, key: &str, value: &str);
}

pub trait UI<T> {
    // -- widget's layouts
    fn open_tab_box(&mut self, label: &str);
    fn open_horizontal_box(&mut self, label: &str);
    fn open_vertical_box(&mut self, label: &str);
    fn close_box(&mut self);

    // -- active widgets
    fn add_button(&mut self, label: &str, param: ParamIndex);
    fn add_check_button(&mut self, label: &str, param: ParamIndex);
    fn add_vertical_slider(
        &mut self,
        label: &str,
        param: ParamIndex,
        init: T,
        min: T,
        max: T,
        step: T,
    );
    fn add_horizontal_slider(
        &mut self,
        label: &str,
        param: ParamIndex,
        init: T,
        min: T,
        max: T,
        step: T,
    );
    fn add_num_entry(&mut self, label: &str, param: ParamIndex, init: T, min: T, max: T, step: T);

    // -- passive widgets
    fn add_horizontal_bargraph(&mut self, label: &str, param: ParamIndex, min: T, max: T);
    fn add_vertical_bargraph(&mut self, label: &str, param: ParamIndex, min: T, max: T);

    // -- metadata declarations
    fn declare(&mut self, param: Option<ParamIndex>, key: &str, value: &str);
}

static mut imydspSIG0Wave0: [i32; 2048] = [
    2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97,
    101, 103, 107, 109, 113, 127, 131, 137, 139, 149, 151, 157, 163, 167, 173, 179, 181, 191, 193,
    197, 199, 211, 223, 227, 229, 233, 239, 241, 251, 257, 263, 269, 271, 277, 281, 283, 293, 307,
    311, 313, 317, 331, 337, 347, 349, 353, 359, 367, 373, 379, 383, 389, 397, 401, 409, 419, 421,
    431, 433, 439, 443, 449, 457, 461, 463, 467, 479, 487, 491, 499, 503, 509, 521, 523, 541, 547,
    557, 563, 569, 571, 577, 587, 593, 599, 601, 607, 613, 617, 619, 631, 641, 643, 647, 653, 659,
    661, 673, 677, 683, 691, 701, 709, 719, 727, 733, 739, 743, 751, 757, 761, 769, 773, 787, 797,
    809, 811, 821, 823, 827, 829, 839, 853, 857, 859, 863, 877, 881, 883, 887, 907, 911, 919, 929,
    937, 941, 947, 953, 967, 971, 977, 983, 991, 997, 1009, 1013, 1019, 1021, 1031, 1033, 1039,
    1049, 1051, 1061, 1063, 1069, 1087, 1091, 1093, 1097, 1103, 1109, 1117, 1123, 1129, 1151, 1153,
    1163, 1171, 1181, 1187, 1193, 1201, 1213, 1217, 1223, 1229, 1231, 1237, 1249, 1259, 1277, 1279,
    1283, 1289, 1291, 1297, 1301, 1303, 1307, 1319, 1321, 1327, 1361, 1367, 1373, 1381, 1399, 1409,
    1423, 1427, 1429, 1433, 1439, 1447, 1451, 1453, 1459, 1471, 1481, 1483, 1487, 1489, 1493, 1499,
    1511, 1523, 1531, 1543, 1549, 1553, 1559, 1567, 1571, 1579, 1583, 1597, 1601, 1607, 1609, 1613,
    1619, 1621, 1627, 1637, 1657, 1663, 1667, 1669, 1693, 1697, 1699, 1709, 1721, 1723, 1733, 1741,
    1747, 1753, 1759, 1777, 1783, 1787, 1789, 1801, 1811, 1823, 1831, 1847, 1861, 1867, 1871, 1873,
    1877, 1879, 1889, 1901, 1907, 1913, 1931, 1933, 1949, 1951, 1973, 1979, 1987, 1993, 1997, 1999,
    2003, 2011, 2017, 2027, 2029, 2039, 2053, 2063, 2069, 2081, 2083, 2087, 2089, 2099, 2111, 2113,
    2129, 2131, 2137, 2141, 2143, 2153, 2161, 2179, 2203, 2207, 2213, 2221, 2237, 2239, 2243, 2251,
    2267, 2269, 2273, 2281, 2287, 2293, 2297, 2309, 2311, 2333, 2339, 2341, 2347, 2351, 2357, 2371,
    2377, 2381, 2383, 2389, 2393, 2399, 2411, 2417, 2423, 2437, 2441, 2447, 2459, 2467, 2473, 2477,
    2503, 2521, 2531, 2539, 2543, 2549, 2551, 2557, 2579, 2591, 2593, 2609, 2617, 2621, 2633, 2647,
    2657, 2659, 2663, 2671, 2677, 2683, 2687, 2689, 2693, 2699, 2707, 2711, 2713, 2719, 2729, 2731,
    2741, 2749, 2753, 2767, 2777, 2789, 2791, 2797, 2801, 2803, 2819, 2833, 2837, 2843, 2851, 2857,
    2861, 2879, 2887, 2897, 2903, 2909, 2917, 2927, 2939, 2953, 2957, 2963, 2969, 2971, 2999, 3001,
    3011, 3019, 3023, 3037, 3041, 3049, 3061, 3067, 3079, 3083, 3089, 3109, 3119, 3121, 3137, 3163,
    3167, 3169, 3181, 3187, 3191, 3203, 3209, 3217, 3221, 3229, 3251, 3253, 3257, 3259, 3271, 3299,
    3301, 3307, 3313, 3319, 3323, 3329, 3331, 3343, 3347, 3359, 3361, 3371, 3373, 3389, 3391, 3407,
    3413, 3433, 3449, 3457, 3461, 3463, 3467, 3469, 3491, 3499, 3511, 3517, 3527, 3529, 3533, 3539,
    3541, 3547, 3557, 3559, 3571, 3581, 3583, 3593, 3607, 3613, 3617, 3623, 3631, 3637, 3643, 3659,
    3671, 3673, 3677, 3691, 3697, 3701, 3709, 3719, 3727, 3733, 3739, 3761, 3767, 3769, 3779, 3793,
    3797, 3803, 3821, 3823, 3833, 3847, 3851, 3853, 3863, 3877, 3881, 3889, 3907, 3911, 3917, 3919,
    3923, 3929, 3931, 3943, 3947, 3967, 3989, 4001, 4003, 4007, 4013, 4019, 4021, 4027, 4049, 4051,
    4057, 4073, 4079, 4091, 4093, 4099, 4111, 4127, 4129, 4133, 4139, 4153, 4157, 4159, 4177, 4201,
    4211, 4217, 4219, 4229, 4231, 4241, 4243, 4253, 4259, 4261, 4271, 4273, 4283, 4289, 4297, 4327,
    4337, 4339, 4349, 4357, 4363, 4373, 4391, 4397, 4409, 4421, 4423, 4441, 4447, 4451, 4457, 4463,
    4481, 4483, 4493, 4507, 4513, 4517, 4519, 4523, 4547, 4549, 4561, 4567, 4583, 4591, 4597, 4603,
    4621, 4637, 4639, 4643, 4649, 4651, 4657, 4663, 4673, 4679, 4691, 4703, 4721, 4723, 4729, 4733,
    4751, 4759, 4783, 4787, 4789, 4793, 4799, 4801, 4813, 4817, 4831, 4861, 4871, 4877, 4889, 4903,
    4909, 4919, 4931, 4933, 4937, 4943, 4951, 4957, 4967, 4969, 4973, 4987, 4993, 4999, 5003, 5009,
    5011, 5021, 5023, 5039, 5051, 5059, 5077, 5081, 5087, 5099, 5101, 5107, 5113, 5119, 5147, 5153,
    5167, 5171, 5179, 5189, 5197, 5209, 5227, 5231, 5233, 5237, 5261, 5273, 5279, 5281, 5297, 5303,
    5309, 5323, 5333, 5347, 5351, 5381, 5387, 5393, 5399, 5407, 5413, 5417, 5419, 5431, 5437, 5441,
    5443, 5449, 5471, 5477, 5479, 5483, 5501, 5503, 5507, 5519, 5521, 5527, 5531, 5557, 5563, 5569,
    5573, 5581, 5591, 5623, 5639, 5641, 5647, 5651, 5653, 5657, 5659, 5669, 5683, 5689, 5693, 5701,
    5711, 5717, 5737, 5741, 5743, 5749, 5779, 5783, 5791, 5801, 5807, 5813, 5821, 5827, 5839, 5843,
    5849, 5851, 5857, 5861, 5867, 5869, 5879, 5881, 5897, 5903, 5923, 5927, 5939, 5953, 5981, 5987,
    6007, 6011, 6029, 6037, 6043, 6047, 6053, 6067, 6073, 6079, 6089, 6091, 6101, 6113, 6121, 6131,
    6133, 6143, 6151, 6163, 6173, 6197, 6199, 6203, 6211, 6217, 6221, 6229, 6247, 6257, 6263, 6269,
    6271, 6277, 6287, 6299, 6301, 6311, 6317, 6323, 6329, 6337, 6343, 6353, 6359, 6361, 6367, 6373,
    6379, 6389, 6397, 6421, 6427, 6449, 6451, 6469, 6473, 6481, 6491, 6521, 6529, 6547, 6551, 6553,
    6563, 6569, 6571, 6577, 6581, 6599, 6607, 6619, 6637, 6653, 6659, 6661, 6673, 6679, 6689, 6691,
    6701, 6703, 6709, 6719, 6733, 6737, 6761, 6763, 6779, 6781, 6791, 6793, 6803, 6823, 6827, 6829,
    6833, 6841, 6857, 6863, 6869, 6871, 6883, 6899, 6907, 6911, 6917, 6947, 6949, 6959, 6961, 6967,
    6971, 6977, 6983, 6991, 6997, 7001, 7013, 7019, 7027, 7039, 7043, 7057, 7069, 7079, 7103, 7109,
    7121, 7127, 7129, 7151, 7159, 7177, 7187, 7193, 7207, 7211, 7213, 7219, 7229, 7237, 7243, 7247,
    7253, 7283, 7297, 7307, 7309, 7321, 7331, 7333, 7349, 7351, 7369, 7393, 7411, 7417, 7433, 7451,
    7457, 7459, 7477, 7481, 7487, 7489, 7499, 7507, 7517, 7523, 7529, 7537, 7541, 7547, 7549, 7559,
    7561, 7573, 7577, 7583, 7589, 7591, 7603, 7607, 7621, 7639, 7643, 7649, 7669, 7673, 7681, 7687,
    7691, 7699, 7703, 7717, 7723, 7727, 7741, 7753, 7757, 7759, 7789, 7793, 7817, 7823, 7829, 7841,
    7853, 7867, 7873, 7877, 7879, 7883, 7901, 7907, 7919, 7927, 7933, 7937, 7949, 7951, 7963, 7993,
    8009, 8011, 8017, 8039, 8053, 8059, 8069, 8081, 8087, 8089, 8093, 8101, 8111, 8117, 8123, 8147,
    8161, 8167, 8171, 8179, 8191, 8209, 8219, 8221, 8231, 8233, 8237, 8243, 8263, 8269, 8273, 8287,
    8291, 8293, 8297, 8311, 8317, 8329, 8353, 8363, 8369, 8377, 8387, 8389, 8419, 8423, 8429, 8431,
    8443, 8447, 8461, 8467, 8501, 8513, 8521, 8527, 8537, 8539, 8543, 8563, 8573, 8581, 8597, 8599,
    8609, 8623, 8627, 8629, 8641, 8647, 8663, 8669, 8677, 8681, 8689, 8693, 8699, 8707, 8713, 8719,
    8731, 8737, 8741, 8747, 8753, 8761, 8779, 8783, 8803, 8807, 8819, 8821, 8831, 8837, 8839, 8849,
    8861, 8863, 8867, 8887, 8893, 8923, 8929, 8933, 8941, 8951, 8963, 8969, 8971, 8999, 9001, 9007,
    9011, 9013, 9029, 9041, 9043, 9049, 9059, 9067, 9091, 9103, 9109, 9127, 9133, 9137, 9151, 9157,
    9161, 9173, 9181, 9187, 9199, 9203, 9209, 9221, 9227, 9239, 9241, 9257, 9277, 9281, 9283, 9293,
    9311, 9319, 9323, 9337, 9341, 9343, 9349, 9371, 9377, 9391, 9397, 9403, 9413, 9419, 9421, 9431,
    9433, 9437, 9439, 9461, 9463, 9467, 9473, 9479, 9491, 9497, 9511, 9521, 9533, 9539, 9547, 9551,
    9587, 9601, 9613, 9619, 9623, 9629, 9631, 9643, 9649, 9661, 9677, 9679, 9689, 9697, 9719, 9721,
    9733, 9739, 9743, 9749, 9767, 9769, 9781, 9787, 9791, 9803, 9811, 9817, 9829, 9833, 9839, 9851,
    9857, 9859, 9871, 9883, 9887, 9901, 9907, 9923, 9929, 9931, 9941, 9949, 9967, 9973, 10007,
    10009, 10037, 10039, 10061, 10067, 10069, 10079, 10091, 10093, 10099, 10103, 10111, 10133,
    10139, 10141, 10151, 10159, 10163, 10169, 10177, 10181, 10193, 10211, 10223, 10243, 10247,
    10253, 10259, 10267, 10271, 10273, 10289, 10301, 10303, 10313, 10321, 10331, 10333, 10337,
    10343, 10357, 10369, 10391, 10399, 10427, 10429, 10433, 10453, 10457, 10459, 10463, 10477,
    10487, 10499, 10501, 10513, 10529, 10531, 10559, 10567, 10589, 10597, 10601, 10607, 10613,
    10627, 10631, 10639, 10651, 10657, 10663, 10667, 10687, 10691, 10709, 10711, 10723, 10729,
    10733, 10739, 10753, 10771, 10781, 10789, 10799, 10831, 10837, 10847, 10853, 10859, 10861,
    10867, 10883, 10889, 10891, 10903, 10909, 10937, 10939, 10949, 10957, 10973, 10979, 10987,
    10993, 11003, 11027, 11047, 11057, 11059, 11069, 11071, 11083, 11087, 11093, 11113, 11117,
    11119, 11131, 11149, 11159, 11161, 11171, 11173, 11177, 11197, 11213, 11239, 11243, 11251,
    11257, 11261, 11273, 11279, 11287, 11299, 11311, 11317, 11321, 11329, 11351, 11353, 11369,
    11383, 11393, 11399, 11411, 11423, 11437, 11443, 11447, 11467, 11471, 11483, 11489, 11491,
    11497, 11503, 11519, 11527, 11549, 11551, 11579, 11587, 11593, 11597, 11617, 11621, 11633,
    11657, 11677, 11681, 11689, 11699, 11701, 11717, 11719, 11731, 11743, 11777, 11779, 11783,
    11789, 11801, 11807, 11813, 11821, 11827, 11831, 11833, 11839, 11863, 11867, 11887, 11897,
    11903, 11909, 11923, 11927, 11933, 11939, 11941, 11953, 11959, 11969, 11971, 11981, 11987,
    12007, 12011, 12037, 12041, 12043, 12049, 12071, 12073, 12097, 12101, 12107, 12109, 12113,
    12119, 12143, 12149, 12157, 12161, 12163, 12197, 12203, 12211, 12227, 12239, 12241, 12251,
    12253, 12263, 12269, 12277, 12281, 12289, 12301, 12323, 12329, 12343, 12347, 12373, 12377,
    12379, 12391, 12401, 12409, 12413, 12421, 12433, 12437, 12451, 12457, 12473, 12479, 12487,
    12491, 12497, 12503, 12511, 12517, 12527, 12539, 12541, 12547, 12553, 12569, 12577, 12583,
    12589, 12601, 12611, 12613, 12619, 12637, 12641, 12647, 12653, 12659, 12671, 12689, 12697,
    12703, 12713, 12721, 12739, 12743, 12757, 12763, 12781, 12791, 12799, 12809, 12821, 12823,
    12829, 12841, 12853, 12889, 12893, 12899, 12907, 12911, 12917, 12919, 12923, 12941, 12953,
    12959, 12967, 12973, 12979, 12983, 13001, 13003, 13007, 13009, 13033, 13037, 13043, 13049,
    13063, 13093, 13099, 13103, 13109, 13121, 13127, 13147, 13151, 13159, 13163, 13171, 13177,
    13183, 13187, 13217, 13219, 13229, 13241, 13249, 13259, 13267, 13291, 13297, 13309, 13313,
    13327, 13331, 13337, 13339, 13367, 13381, 13397, 13399, 13411, 13417, 13421, 13441, 13451,
    13457, 13463, 13469, 13477, 13487, 13499, 13513, 13523, 13537, 13553, 13567, 13577, 13591,
    13597, 13613, 13619, 13627, 13633, 13649, 13669, 13679, 13681, 13687, 13691, 13693, 13697,
    13709, 13711, 13721, 13723, 13729, 13751, 13757, 13759, 13763, 13781, 13789, 13799, 13807,
    13829, 13831, 13841, 13859, 13873, 13877, 13879, 13883, 13901, 13903, 13907, 13913, 13921,
    13931, 13933, 13963, 13967, 13997, 13999, 14009, 14011, 14029, 14033, 14051, 14057, 14071,
    14081, 14083, 14087, 14107, 14143, 14149, 14153, 14159, 14173, 14177, 14197, 14207, 14221,
    14243, 14249, 14251, 14281, 14293, 14303, 14321, 14323, 14327, 14341, 14347, 14369, 14387,
    14389, 14401, 14407, 14411, 14419, 14423, 14431, 14437, 14447, 14449, 14461, 14479, 14489,
    14503, 14519, 14533, 14537, 14543, 14549, 14551, 14557, 14561, 14563, 14591, 14593, 14621,
    14627, 14629, 14633, 14639, 14653, 14657, 14669, 14683, 14699, 14713, 14717, 14723, 14731,
    14737, 14741, 14747, 14753, 14759, 14767, 14771, 14779, 14783, 14797, 14813, 14821, 14827,
    14831, 14843, 14851, 14867, 14869, 14879, 14887, 14891, 14897, 14923, 14929, 14939, 14947,
    14951, 14957, 14969, 14983, 15013, 15017, 15031, 15053, 15061, 15073, 15077, 15083, 15091,
    15101, 15107, 15121, 15131, 15137, 15139, 15149, 15161, 15173, 15187, 15193, 15199, 15217,
    15227, 15233, 15241, 15259, 15263, 15269, 15271, 15277, 15287, 15289, 15299, 15307, 15313,
    15319, 15329, 15331, 15349, 15359, 15361, 15373, 15377, 15383, 15391, 15401, 15413, 15427,
    15439, 15443, 15451, 15461, 15467, 15473, 15493, 15497, 15511, 15527, 15541, 15551, 15559,
    15569, 15581, 15583, 15601, 15607, 15619, 15629, 15641, 15643, 15647, 15649, 15661, 15667,
    15671, 15679, 15683, 15727, 15731, 15733, 15737, 15739, 15749, 15761, 15767, 15773, 15787,
    15791, 15797, 15803, 15809, 15817, 15823, 15859, 15877, 15881, 15887, 15889, 15901, 15907,
    15913, 15919, 15923, 15937, 15959, 15971, 15973, 15991, 16001, 16007, 16033, 16057, 16061,
    16063, 16067, 16069, 16073, 16087, 16091, 16097, 16103, 16111, 16127, 16139, 16141, 16183,
    16187, 16189, 16193, 16217, 16223, 16229, 16231, 16249, 16253, 16267, 16273, 16301, 16319,
    16333, 16339, 16349, 16361, 16363, 16369, 16381, 16411, 16417, 16421, 16427, 16433, 16447,
    16451, 16453, 16477, 16481, 16487, 16493, 16519, 16529, 16547, 16553, 16561, 16567, 16573,
    16603, 16607, 16619, 16631, 16633, 16649, 16651, 16657, 16661, 16673, 16691, 16693, 16699,
    16703, 16729, 16741, 16747, 16759, 16763, 16787, 16811, 16823, 16829, 16831, 16843, 16871,
    16879, 16883, 16889, 16901, 16903, 16921, 16927, 16931, 16937, 16943, 16963, 16979, 16981,
    16987, 16993, 17011, 17021, 17027, 17029, 17033, 17041, 17047, 17053, 17077, 17093, 17099,
    17107, 17117, 17123, 17137, 17159, 17167, 17183, 17189, 17191, 17203, 17207, 17209, 17231,
    17239, 17257, 17291, 17293, 17299, 17317, 17321, 17327, 17333, 17341, 17351, 17359, 17377,
    17383, 17387, 17389, 17393, 17401, 17417, 17419, 17431, 17443, 17449, 17467, 17471, 17477,
    17483, 17489, 17491, 17497, 17509, 17519, 17539, 17551, 17569, 17573, 17579, 17581, 17597,
    17599, 17609, 17623, 17627, 17657, 17659, 17669, 17681, 17683, 17707, 17713, 17729, 17737,
    17747, 17749, 17761, 17783, 17789, 17791, 17807, 17827, 17837, 17839, 17851, 17863,
];

pub struct mydspSIG0 {
    imydspSIG0Wave0_idx: i32,
}

impl mydspSIG0 {
    fn get_num_inputsmydspSIG0(&self) -> i32 {
        return 0;
    }
    fn get_num_outputsmydspSIG0(&self) -> i32 {
        return 1;
    }

    fn instance_initmydspSIG0(&mut self, sample_rate: i32) {
        self.imydspSIG0Wave0_idx = 0;
    }

    fn fillmydspSIG0(&mut self, count: i32, table: &mut [i32]) {
        for i1 in 0..count {
            table[i1 as usize] = unsafe { imydspSIG0Wave0[self.imydspSIG0Wave0_idx as usize] };
            self.imydspSIG0Wave0_idx = (i32::wrapping_add(1, self.imydspSIG0Wave0_idx)) % 2048;
        }
    }
}

pub fn newmydspSIG0() -> mydspSIG0 {
    mydspSIG0 {
        imydspSIG0Wave0_idx: 0,
    }
}
static mut itbl0mydspSIG0: [i32; 2048] = [0; 2048];
mod ffi {
    use std::os::raw::c_float;
    // Conditionally compile the link attribute only on non-Windows platforms
    #[cfg_attr(not(target_os = "windows"), link(name = "m"))]
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
pub struct mydsp {
    iVec0: [i32; 2],
    fHslider0: F32,
    fVec1: [F32; 2],
    fHslider1: F32,
    fVec2: [F32; 2],
    IOTA0: i32,
    fHslider2: F32,
    fVec3: [F32; 2],
    fSampleRate: i32,
    fConst0: F32,
    fConst1: F32,
    fRec3: [F32; 2],
    fRec4: [F32; 2],
    fHslider3: F32,
    fVec4: [F32; 2],
    fConst2: F32,
    fVec5: [F32; 131072],
    fHslider4: F32,
    fRec5: [F32; 2],
    fRec6: [F32; 2],
    fRec7: [F32; 2],
    fRec8: [F32; 2],
    fHslider5: F32,
    fVec6: [F32; 2],
    fVec7: [F32; 131072],
    fHslider6: F32,
    fRec21: [F32; 2],
    fVec8: [F32; 16384],
    fVec9: [F32; 2],
    fRec20: [F32; 2],
    fRec18: [F32; 2],
    fRec23: [F32; 2],
    fVec10: [F32; 16384],
    fVec11: [F32; 2],
    fRec22: [F32; 2],
    fRec19: [F32; 2],
    fVec12: [F32; 16384],
    fRec24: [F32; 2],
    fVec13: [F32; 2],
    fRec17: [F32; 2],
    fRec15: [F32; 2],
    fRec26: [F32; 2],
    fVec14: [F32; 16384],
    fVec15: [F32; 2],
    fRec25: [F32; 2],
    fRec16: [F32; 2],
    fVec16: [F32; 16384],
    fRec27: [F32; 2],
    fVec17: [F32; 2],
    fRec14: [F32; 2],
    fRec12: [F32; 2],
    fRec29: [F32; 2],
    fVec18: [F32; 16384],
    fVec19: [F32; 2],
    fRec28: [F32; 2],
    fRec13: [F32; 2],
    fVec20: [F32; 16384],
    fRec30: [F32; 2],
    fVec21: [F32; 2],
    fRec11: [F32; 2],
    fRec9: [F32; 2],
    fRec32: [F32; 2],
    fVec22: [F32; 16384],
    fVec23: [F32; 2],
    fRec31: [F32; 2],
    fRec10: [F32; 2],
    fRec45: [F32; 2],
    fVec24: [F32; 16384],
    fVec25: [F32; 2],
    fRec44: [F32; 2],
    fRec42: [F32; 2],
    fRec47: [F32; 2],
    fVec26: [F32; 16384],
    fVec27: [F32; 2],
    fRec46: [F32; 2],
    fRec43: [F32; 2],
    fVec28: [F32; 16384],
    fRec48: [F32; 2],
    fVec29: [F32; 2],
    fRec41: [F32; 2],
    fRec39: [F32; 2],
    fRec50: [F32; 2],
    fVec30: [F32; 16384],
    fVec31: [F32; 2],
    fRec49: [F32; 2],
    fRec40: [F32; 2],
    fVec32: [F32; 16384],
    fRec51: [F32; 2],
    fVec33: [F32; 2],
    fRec38: [F32; 2],
    fRec36: [F32; 2],
    fRec53: [F32; 2],
    fVec34: [F32; 16384],
    fVec35: [F32; 2],
    fRec52: [F32; 2],
    fRec37: [F32; 2],
    fVec36: [F32; 16384],
    fRec54: [F32; 2],
    fVec37: [F32; 2],
    fRec35: [F32; 2],
    fRec33: [F32; 2],
    fRec56: [F32; 2],
    fVec38: [F32; 16384],
    fVec39: [F32; 2],
    fRec55: [F32; 2],
    fRec34: [F32; 2],
    fRec69: [F32; 2],
    fVec40: [F32; 16384],
    fVec41: [F32; 2],
    fRec68: [F32; 2],
    fRec66: [F32; 2],
    fRec71: [F32; 2],
    fVec42: [F32; 16384],
    fVec43: [F32; 2],
    fRec70: [F32; 2],
    fRec67: [F32; 2],
    fVec44: [F32; 16384],
    fRec72: [F32; 2],
    fVec45: [F32; 2],
    fRec65: [F32; 2],
    fRec63: [F32; 2],
    fRec74: [F32; 2],
    fVec46: [F32; 16384],
    fVec47: [F32; 2],
    fRec73: [F32; 2],
    fRec64: [F32; 2],
    fVec48: [F32; 16384],
    fRec75: [F32; 2],
    fVec49: [F32; 2],
    fRec62: [F32; 2],
    fRec60: [F32; 2],
    fRec77: [F32; 2],
    fVec50: [F32; 16384],
    fVec51: [F32; 2],
    fRec76: [F32; 2],
    fRec61: [F32; 2],
    fVec52: [F32; 16384],
    fRec78: [F32; 2],
    fVec53: [F32; 2],
    fRec59: [F32; 2],
    fRec57: [F32; 2],
    fRec80: [F32; 2],
    fVec54: [F32; 16384],
    fVec55: [F32; 2],
    fRec79: [F32; 2],
    fRec58: [F32; 2],
    fRec2: [F32; 2],
    fRec0: [F32; 1024],
    fRec81: [F32; 2],
    fRec1: [F32; 1024],
}

impl FaustDsp for mydsp {
    type T = F32;

    fn new() -> mydsp {
        mydsp {
            fConst0: 0.0,
            fConst1: 0.0,
            fConst2: 0.0,
            fHslider0: 0.0,
            fHslider1: 0.0,
            fHslider2: 0.0,
            fHslider3: 0.0,
            fHslider4: 0.0,
            fHslider5: 0.0,
            fHslider6: 0.0,
            fRec0: [0.0; 1024],
            fRec1: [0.0; 1024],
            fRec10: [0.0; 2],
            fRec11: [0.0; 2],
            fRec12: [0.0; 2],
            fRec13: [0.0; 2],
            fRec14: [0.0; 2],
            fRec15: [0.0; 2],
            fRec16: [0.0; 2],
            fRec17: [0.0; 2],
            fRec18: [0.0; 2],
            fRec19: [0.0; 2],
            fRec2: [0.0; 2],
            fRec20: [0.0; 2],
            fRec21: [0.0; 2],
            fRec22: [0.0; 2],
            fRec23: [0.0; 2],
            fRec24: [0.0; 2],
            fRec25: [0.0; 2],
            fRec26: [0.0; 2],
            fRec27: [0.0; 2],
            fRec28: [0.0; 2],
            fRec29: [0.0; 2],
            fRec3: [0.0; 2],
            fRec30: [0.0; 2],
            fRec31: [0.0; 2],
            fRec32: [0.0; 2],
            fRec33: [0.0; 2],
            fRec34: [0.0; 2],
            fRec35: [0.0; 2],
            fRec36: [0.0; 2],
            fRec37: [0.0; 2],
            fRec38: [0.0; 2],
            fRec39: [0.0; 2],
            fRec4: [0.0; 2],
            fRec40: [0.0; 2],
            fRec41: [0.0; 2],
            fRec42: [0.0; 2],
            fRec43: [0.0; 2],
            fRec44: [0.0; 2],
            fRec45: [0.0; 2],
            fRec46: [0.0; 2],
            fRec47: [0.0; 2],
            fRec48: [0.0; 2],
            fRec49: [0.0; 2],
            fRec5: [0.0; 2],
            fRec50: [0.0; 2],
            fRec51: [0.0; 2],
            fRec52: [0.0; 2],
            fRec53: [0.0; 2],
            fRec54: [0.0; 2],
            fRec55: [0.0; 2],
            fRec56: [0.0; 2],
            fRec57: [0.0; 2],
            fRec58: [0.0; 2],
            fRec59: [0.0; 2],
            fRec6: [0.0; 2],
            fRec60: [0.0; 2],
            fRec61: [0.0; 2],
            fRec62: [0.0; 2],
            fRec63: [0.0; 2],
            fRec64: [0.0; 2],
            fRec65: [0.0; 2],
            fRec66: [0.0; 2],
            fRec67: [0.0; 2],
            fRec68: [0.0; 2],
            fRec69: [0.0; 2],
            fRec7: [0.0; 2],
            fRec70: [0.0; 2],
            fRec71: [0.0; 2],
            fRec72: [0.0; 2],
            fRec73: [0.0; 2],
            fRec74: [0.0; 2],
            fRec75: [0.0; 2],
            fRec76: [0.0; 2],
            fRec77: [0.0; 2],
            fRec78: [0.0; 2],
            fRec79: [0.0; 2],
            fRec8: [0.0; 2],
            fRec80: [0.0; 2],
            fRec81: [0.0; 2],
            fRec9: [0.0; 2],
            fSampleRate: 0,
            fVec1: [0.0; 2],
            fVec10: [0.0; 16384],
            fVec11: [0.0; 2],
            fVec12: [0.0; 16384],
            fVec13: [0.0; 2],
            fVec14: [0.0; 16384],
            fVec15: [0.0; 2],
            fVec16: [0.0; 16384],
            fVec17: [0.0; 2],
            fVec18: [0.0; 16384],
            fVec19: [0.0; 2],
            fVec2: [0.0; 2],
            fVec20: [0.0; 16384],
            fVec21: [0.0; 2],
            fVec22: [0.0; 16384],
            fVec23: [0.0; 2],
            fVec24: [0.0; 16384],
            fVec25: [0.0; 2],
            fVec26: [0.0; 16384],
            fVec27: [0.0; 2],
            fVec28: [0.0; 16384],
            fVec29: [0.0; 2],
            fVec3: [0.0; 2],
            fVec30: [0.0; 16384],
            fVec31: [0.0; 2],
            fVec32: [0.0; 16384],
            fVec33: [0.0; 2],
            fVec34: [0.0; 16384],
            fVec35: [0.0; 2],
            fVec36: [0.0; 16384],
            fVec37: [0.0; 2],
            fVec38: [0.0; 16384],
            fVec39: [0.0; 2],
            fVec4: [0.0; 2],
            fVec40: [0.0; 16384],
            fVec41: [0.0; 2],
            fVec42: [0.0; 16384],
            fVec43: [0.0; 2],
            fVec44: [0.0; 16384],
            fVec45: [0.0; 2],
            fVec46: [0.0; 16384],
            fVec47: [0.0; 2],
            fVec48: [0.0; 16384],
            fVec49: [0.0; 2],
            fVec5: [0.0; 131072],
            fVec50: [0.0; 16384],
            fVec51: [0.0; 2],
            fVec52: [0.0; 16384],
            fVec53: [0.0; 2],
            fVec54: [0.0; 16384],
            fVec55: [0.0; 2],
            fVec6: [0.0; 2],
            fVec7: [0.0; 131072],
            fVec8: [0.0; 16384],
            fVec9: [0.0; 2],
            IOTA0: 0,
            iVec0: [0; 2],
        }
    }
    fn metadata(&self, m: &mut dyn Meta) {
        m.declare("basics.lib/name", r"Faust Basic Element Library");
        m.declare(
            "basics.lib/tabulateNd",
            r"Copyright (C) 2023 Bart Brouns <bart@magnetophon.nl>",
        );
        m.declare("basics.lib/version", r"1.19.1");
        m.declare("compile_options", r"-a /usr/local/share/faust/rust/jack-float.rs -lang rust -ct 1 -es 1 -mcd 16 -mdd 1024 -mdy 33 -single -ftz 0");
        m.declare("delays.lib/fdelay1a:author", r"Julius O. Smith III");
        m.declare("delays.lib/fdelay4:author", r"Julius O. Smith III");
        m.declare("delays.lib/fdelayltv:author", r"Julius O. Smith III");
        m.declare("delays.lib/name", r"Faust Delay Library");
        m.declare("delays.lib/version", r"1.1.0");
        m.declare("filename", r"untitled.dsp");
        m.declare(
            "filters.lib/lowpass0_highpass1",
            r"MIT-style STK-4.3 license",
        );
        m.declare("filters.lib/name", r"Faust Filters Library");
        m.declare("filters.lib/nlf2:author", r"Julius O. Smith III");
        m.declare(
            "filters.lib/nlf2:copyright",
            r"Copyright (C) 2003-2019 by Julius O. Smith III <jos@ccrma.stanford.edu>",
        );
        m.declare("filters.lib/nlf2:license", r"MIT-style STK-4.3 license");
        m.declare("filters.lib/tf1:author", r"Julius O. Smith III");
        m.declare(
            "filters.lib/tf1:copyright",
            r"Copyright (C) 2003-2019 by Julius O. Smith III <jos@ccrma.stanford.edu>",
        );
        m.declare("filters.lib/tf1:license", r"MIT-style STK-4.3 license");
        m.declare("filters.lib/version", r"1.3.0");
        m.declare("maths.lib/author", r"GRAME");
        m.declare("maths.lib/copyright", r"GRAME");
        m.declare("maths.lib/license", r"LGPL with exception");
        m.declare("maths.lib/name", r"Faust Math Library");
        m.declare("maths.lib/version", r"2.8.0");
        m.declare("name", r"untitled");
        m.declare("oscillators.lib/name", r"Faust Oscillator Library");
        m.declare("oscillators.lib/version", r"1.5.1");
        m.declare("platform.lib/name", r"Generic Platform Library");
        m.declare("platform.lib/version", r"1.3.0");
        m.declare(
            "reverbs.lib/greyhole:author",
            r"Julian Parker, bug fixes and minor interface changes by Till Bovermann",
        );
        m.declare("reverbs.lib/greyhole:license", r"GPL2+");
        m.declare("reverbs.lib/name", r"Faust Reverb Library");
        m.declare("reverbs.lib/version", r"1.3.0");
        m.declare("signals.lib/name", r"Faust Signal Routing Library");
        m.declare("signals.lib/version", r"1.6.0");
    }

    fn get_sample_rate(&self) -> i32 {
        return self.fSampleRate;
    }
    fn get_num_inputs(&self) -> i32 {
        return 2;
    }
    fn get_num_outputs(&self) -> i32 {
        return 2;
    }

    fn class_init(sample_rate: i32) {
        let mut sig0: mydspSIG0 = newmydspSIG0();
        sig0.instance_initmydspSIG0(sample_rate);
        sig0.fillmydspSIG0(2048, unsafe { &mut itbl0mydspSIG0 });
    }
    fn instance_constants(&mut self, sample_rate: i32) {
        self.fSampleRate = sample_rate;
        self.fConst0 = F32::min(1.92e+05, F32::max(1.0, (self.fSampleRate) as F32));
        self.fConst1 = 3.1415927 / self.fConst0;
        self.fConst2 = 0.00056689343 * self.fConst0;
    }
    fn instance_init(&mut self, sample_rate: i32) {
        self.instance_constants(sample_rate);
        self.instance_reset_params();
        self.instance_clear();
    }
    fn init(&mut self, sample_rate: i32) {
        mydsp::class_init(sample_rate);
        self.instance_init(sample_rate);
    }

    fn build_user_interface(&self, ui_interface: &mut dyn UI<Self::T>) {
        Self::build_user_interface_static(ui_interface);
    }

    fn build_user_interface_static(ui_interface: &mut dyn UI<Self::T>) {
        ui_interface.declare(None, "0", "");
        ui_interface.open_vertical_box("Greyhole");
        ui_interface.declare(None, "0", "");
        ui_interface.open_horizontal_box("Mix");
        ui_interface.declare(Some(ParamIndex(0)), "01", "");
        ui_interface.declare(Some(ParamIndex(0)), "style", "knob");
        ui_interface.add_horizontal_slider("delayTime", ParamIndex(0), 0.2, 0.001, 1.45, 0.0001);
        ui_interface.declare(Some(ParamIndex(1)), "02", "");
        ui_interface.declare(Some(ParamIndex(1)), "style", "knob");
        ui_interface.add_horizontal_slider("damping", ParamIndex(1), 0.0, 0.0, 0.99, 0.001);
        ui_interface.declare(Some(ParamIndex(2)), "03", "");
        ui_interface.declare(Some(ParamIndex(2)), "style", "knob");
        ui_interface.add_horizontal_slider("size", ParamIndex(2), 1.0, 0.5, 3.0, 0.0001);
        ui_interface.declare(Some(ParamIndex(3)), "04", "");
        ui_interface.declare(Some(ParamIndex(3)), "style", "knob");
        ui_interface.add_horizontal_slider("diffusion", ParamIndex(3), 0.5, 0.0, 0.99, 0.0001);
        ui_interface.declare(Some(ParamIndex(4)), "05", "");
        ui_interface.declare(Some(ParamIndex(4)), "style", "knob");
        ui_interface.add_horizontal_slider("feedback", ParamIndex(4), 0.9, 0.0, 1.0, 0.01);
        ui_interface.close_box();
        ui_interface.declare(None, "1", "");
        ui_interface.open_horizontal_box("Mod");
        ui_interface.declare(Some(ParamIndex(5)), "06", "");
        ui_interface.declare(Some(ParamIndex(5)), "style", "knob");
        ui_interface.add_horizontal_slider("modDepth", ParamIndex(5), 0.1, 0.0, 1.0, 0.001);
        ui_interface.declare(Some(ParamIndex(6)), "07", "");
        ui_interface.declare(Some(ParamIndex(6)), "style", "knob");
        ui_interface.add_horizontal_slider("modFreq", ParamIndex(6), 2.0, 0.0, 1e+01, 0.01);
        ui_interface.close_box();
        ui_interface.close_box();
    }

    fn get_param(&self, param: ParamIndex) -> Option<Self::T> {
        match param.0 {
            1 => Some(self.fHslider0),
            4 => Some(self.fHslider1),
            6 => Some(self.fHslider2),
            5 => Some(self.fHslider3),
            0 => Some(self.fHslider4),
            3 => Some(self.fHslider5),
            2 => Some(self.fHslider6),
            _ => None,
        }
    }

    fn set_param(&mut self, param: ParamIndex, value: Self::T) {
        match param.0 {
            1 => self.fHslider0 = value,
            4 => self.fHslider1 = value,
            6 => self.fHslider2 = value,
            5 => self.fHslider3 = value,
            0 => self.fHslider4 = value,
            3 => self.fHslider5 = value,
            2 => self.fHslider6 = value,
            _ => {}
        }
    }

    fn compute(&mut self, count: i32, inputs: &[&[Self::T]], outputs: &mut [&mut [Self::T]]) {
        let (inputs0, inputs1) = if let [inputs0, inputs1, ..] = inputs {
            let inputs0 = inputs0[..count as usize].iter();
            let inputs1 = inputs1[..count as usize].iter();
            (inputs0, inputs1)
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
        let mut fSlow0: F32 = self.fHslider0;
        let mut fSlow1: F32 = self.fHslider1;
        let mut fSlow2: F32 = self.fHslider2;
        let mut fSlow3: F32 = self.fHslider3;
        let mut fSlow4: F32 = F32::floor(F32::min(65533.0, self.fConst0 * self.fHslider4));
        let mut fSlow5: F32 = self.fHslider5;
        let mut fSlow6: F32 = self.fHslider6;
        let mut iSlow7: i32 = unsafe { itbl0mydspSIG0[((49.0 * fSlow6) as i32) as usize] };
        let mut fSlow8: F32 = 0.0001 * (iSlow7) as F32;
        let mut iSlow9: i32 = unsafe { itbl0mydspSIG0[((59.0 * fSlow6) as i32) as usize] };
        let mut fSlow10: F32 = 0.0001 * (iSlow9) as F32;
        let mut iSlow11: i32 = unsafe { itbl0mydspSIG0[((36.0 * fSlow6) as i32) as usize] };
        let mut fSlow12: F32 = 0.0001 * (iSlow11) as F32;
        let mut iSlow13: i32 = unsafe { itbl0mydspSIG0[((46.0 * fSlow6) as i32) as usize] };
        let mut fSlow14: F32 = 0.0001 * (iSlow13) as F32;
        let mut iSlow15: i32 = unsafe { itbl0mydspSIG0[((23.0 * fSlow6) as i32) as usize] };
        let mut fSlow16: F32 = 0.0001 * (iSlow15) as F32;
        let mut iSlow17: i32 = unsafe { itbl0mydspSIG0[((33.0 * fSlow6) as i32) as usize] };
        let mut fSlow18: F32 = 0.0001 * (iSlow17) as F32;
        let mut iSlow19: i32 = unsafe { itbl0mydspSIG0[((1e+01 * fSlow6) as i32) as usize] };
        let mut fSlow20: F32 = 0.0001 * (iSlow19) as F32;
        let mut iSlow21: i32 = unsafe { itbl0mydspSIG0[((2e+01 * fSlow6) as i32) as usize] };
        let mut fSlow22: F32 = 0.0001 * (iSlow21) as F32;
        let mut iSlow23: i32 = unsafe { itbl0mydspSIG0[((68.0 * fSlow6) as i32) as usize] };
        let mut fSlow24: F32 = 0.0001 * (iSlow23) as F32;
        let mut iSlow25: i32 = unsafe { itbl0mydspSIG0[((78.0 * fSlow6) as i32) as usize] };
        let mut fSlow26: F32 = 0.0001 * (iSlow25) as F32;
        let mut iSlow27: i32 = unsafe { itbl0mydspSIG0[((55.0 * fSlow6) as i32) as usize] };
        let mut fSlow28: F32 = 0.0001 * (iSlow27) as F32;
        let mut iSlow29: i32 = unsafe { itbl0mydspSIG0[((65.0 * fSlow6) as i32) as usize] };
        let mut fSlow30: F32 = 0.0001 * (iSlow29) as F32;
        let mut iSlow31: i32 = unsafe { itbl0mydspSIG0[((42.0 * fSlow6) as i32) as usize] };
        let mut fSlow32: F32 = 0.0001 * (iSlow31) as F32;
        let mut iSlow33: i32 = unsafe { itbl0mydspSIG0[((52.0 * fSlow6) as i32) as usize] };
        let mut fSlow34: F32 = 0.0001 * (iSlow33) as F32;
        let mut iSlow35: i32 = unsafe { itbl0mydspSIG0[((29.0 * fSlow6) as i32) as usize] };
        let mut fSlow36: F32 = 0.0001 * (iSlow35) as F32;
        let mut iSlow37: i32 = unsafe { itbl0mydspSIG0[((39.0 * fSlow6) as i32) as usize] };
        let mut fSlow38: F32 = 0.0001 * (iSlow37) as F32;
        let mut iSlow39: i32 = unsafe { itbl0mydspSIG0[((87.0 * fSlow6) as i32) as usize] };
        let mut fSlow40: F32 = 0.0001 * (iSlow39) as F32;
        let mut iSlow41: i32 = unsafe { itbl0mydspSIG0[((97.0 * fSlow6) as i32) as usize] };
        let mut fSlow42: F32 = 0.0001 * (iSlow41) as F32;
        let mut iSlow43: i32 = unsafe { itbl0mydspSIG0[((74.0 * fSlow6) as i32) as usize] };
        let mut fSlow44: F32 = 0.0001 * (iSlow43) as F32;
        let mut iSlow45: i32 = unsafe { itbl0mydspSIG0[((84.0 * fSlow6) as i32) as usize] };
        let mut fSlow46: F32 = 0.0001 * (iSlow45) as F32;
        let mut iSlow47: i32 = unsafe { itbl0mydspSIG0[((61.0 * fSlow6) as i32) as usize] };
        let mut fSlow48: F32 = 0.0001 * (iSlow47) as F32;
        let mut iSlow49: i32 = unsafe { itbl0mydspSIG0[((71.0 * fSlow6) as i32) as usize] };
        let mut fSlow50: F32 = 0.0001 * (iSlow49) as F32;
        let mut iSlow51: i32 = unsafe { itbl0mydspSIG0[((48.0 * fSlow6) as i32) as usize] };
        let mut fSlow52: F32 = 0.0001 * (iSlow51) as F32;
        let mut iSlow53: i32 = unsafe { itbl0mydspSIG0[((58.0 * fSlow6) as i32) as usize] };
        let mut fSlow54: F32 = 0.0001 * (iSlow53) as F32;
        let zipped_iterators = inputs0.zip(inputs1).zip(outputs0).zip(outputs1);
        for (((input0, input1), output0), output1) in zipped_iterators {
            self.iVec0[0] = 1;
            self.fVec1[0] = fSlow0;
            let mut fTemp0: F32 = fSlow0 + self.fVec1[1];
            self.fVec2[0] = fSlow1;
            let mut fTemp1: F32 = fSlow1 + self.fVec2[1];
            self.fVec3[0] = fSlow2;
            let mut fTemp2: F32 = self.fConst1 * (fSlow2 + self.fVec3[1]);
            let mut fTemp3: F32 = F32::cos(fTemp2);
            let mut fTemp4: F32 = F32::sin(fTemp2);
            self.fRec3[0] = self.fRec4[1] * fTemp4 + self.fRec3[1] * fTemp3;
            let mut iTemp5: i32 = i32::wrapping_sub(1, self.iVec0[1]);
            self.fRec4[0] = (iTemp5) as F32 + self.fRec4[1] * fTemp3 - fTemp4 * self.fRec3[1];
            self.fVec4[0] = fSlow3;
            let mut fTemp6: F32 = fSlow3 + self.fVec4[1];
            let mut fTemp7: F32 = self.fConst2 * fTemp6 * (self.fRec4[0] + 1.0);
            let mut fTemp8: F32 = fTemp7 + 8.500005;
            let mut iTemp9: i32 = (fTemp8) as i32;
            let mut fTemp10: F32 = F32::floor(fTemp8);
            let mut fTemp11: F32 = fTemp7 + (7.0 - fTemp10);
            let mut fTemp12: F32 = fTemp7 + (8.0 - fTemp10);
            let mut fTemp13: F32 = fTemp7 + (9.0 - fTemp10);
            let mut fTemp14: F32 = fTemp7 + (1e+01 - fTemp10);
            let mut fTemp15: F32 = fTemp14 * fTemp13;
            let mut fTemp16: F32 = fTemp15 * fTemp12;
            let mut fTemp17: F32 = (fTemp7 + (6.0 - fTemp10))
                * (fTemp11
                    * (fTemp12
                        * (0.041666668
                            * self.fRec0[((i32::wrapping_sub(
                                self.IOTA0,
                                i32::wrapping_add(std::cmp::min(512, std::cmp::max(0, iTemp9)), 1),
                            )) & 1023) as usize]
                            * fTemp13
                            - 0.16666667
                                * fTemp14
                                * self.fRec0[((i32::wrapping_sub(
                                    self.IOTA0,
                                    i32::wrapping_add(
                                        std::cmp::min(
                                            512,
                                            std::cmp::max(0, i32::wrapping_add(iTemp9, 1)),
                                        ),
                                        1,
                                    ),
                                )) & 1023)
                                    as usize])
                        + 0.25
                            * fTemp15
                            * self.fRec0[((i32::wrapping_sub(
                                self.IOTA0,
                                i32::wrapping_add(
                                    std::cmp::min(
                                        512,
                                        std::cmp::max(0, i32::wrapping_add(iTemp9, 2)),
                                    ),
                                    1,
                                ),
                            )) & 1023) as usize])
                    - 0.16666667
                        * fTemp16
                        * self.fRec0[((i32::wrapping_sub(
                            self.IOTA0,
                            i32::wrapping_add(
                                std::cmp::min(512, std::cmp::max(0, i32::wrapping_add(iTemp9, 3))),
                                1,
                            ),
                        )) & 1023) as usize])
                + 0.041666668
                    * fTemp16
                    * fTemp11
                    * self.fRec0[((i32::wrapping_sub(
                        self.IOTA0,
                        i32::wrapping_add(
                            std::cmp::min(512, std::cmp::max(0, i32::wrapping_add(iTemp9, 4))),
                            1,
                        ),
                    )) & 1023) as usize];
            self.fVec5[(self.IOTA0 & 131071) as usize] = fTemp17;
            let mut fTemp18: F32 = if (self.fRec5[1] != 0.0) as i32 != 0 {
                if ((self.fRec6[1] > 0.0) as i32) & ((self.fRec6[1] < 1.0) as i32) != 0 {
                    self.fRec5[1]
                } else {
                    0.0
                }
            } else {
                if ((self.fRec6[1] == 0.0) as i32) & ((fSlow4 != self.fRec7[1]) as i32) != 0 {
                    4.5351473e-05
                } else {
                    if ((self.fRec6[1] == 1.0) as i32) & ((fSlow4 != self.fRec8[1]) as i32) != 0 {
                        -4.5351473e-05
                    } else {
                        0.0
                    }
                }
            };
            self.fRec5[0] = fTemp18;
            self.fRec6[0] = F32::max(0.0, F32::min(1.0, self.fRec6[1] + fTemp18));
            self.fRec7[0] =
                if ((self.fRec6[1] >= 1.0) as i32) & ((self.fRec8[1] != fSlow4) as i32) != 0 {
                    fSlow4
                } else {
                    self.fRec7[1]
                };
            self.fRec8[0] =
                if ((self.fRec6[1] <= 0.0) as i32) & ((self.fRec7[1] != fSlow4) as i32) != 0 {
                    fSlow4
                } else {
                    self.fRec8[1]
                };
            let mut iTemp19: i32 = (F32::min(65536.0, F32::max(0.0, self.fRec7[0]))) as i32;
            let mut fTemp20: F32 =
                self.fVec5[((i32::wrapping_sub(self.IOTA0, iTemp19)) & 131071) as usize];
            let mut iTemp21: i32 = (F32::min(65536.0, F32::max(0.0, self.fRec8[0]))) as i32;
            let mut fTemp22: F32 = *input0
                + 0.5
                    * (fTemp20
                        + self.fRec6[0]
                            * (self.fVec5
                                [((i32::wrapping_sub(self.IOTA0, iTemp21)) & 131071) as usize]
                                - fTemp20))
                    * fTemp1;
            self.fVec6[0] = fSlow5;
            let mut fTemp23: F32 = fSlow5 + self.fVec6[1];
            let mut fTemp24: F32 = 0.5 * fTemp23;
            let mut fTemp25: F32 = F32::sin(fTemp24);
            let mut fTemp26: F32 = F32::cos(fTemp24);
            let mut fTemp27: F32 = self.fConst2 * fTemp6 * (self.fRec3[0] + 1.0);
            let mut fTemp28: F32 = fTemp27 + 8.500005;
            let mut iTemp29: i32 = (fTemp28) as i32;
            let mut fTemp30: F32 = F32::floor(fTemp28);
            let mut fTemp31: F32 = fTemp27 + (7.0 - fTemp30);
            let mut fTemp32: F32 = fTemp27 + (8.0 - fTemp30);
            let mut fTemp33: F32 = fTemp27 + (9.0 - fTemp30);
            let mut fTemp34: F32 = fTemp27 + (1e+01 - fTemp30);
            let mut fTemp35: F32 = fTemp34 * fTemp33;
            let mut fTemp36: F32 = fTemp35 * fTemp32;
            let mut fTemp37: F32 = (fTemp27 + (6.0 - fTemp30))
                * (fTemp31
                    * (fTemp32
                        * (0.041666668
                            * self.fRec1[((i32::wrapping_sub(
                                self.IOTA0,
                                i32::wrapping_add(std::cmp::min(512, std::cmp::max(0, iTemp29)), 1),
                            )) & 1023) as usize]
                            * fTemp33
                            - 0.16666667
                                * fTemp34
                                * self.fRec1[((i32::wrapping_sub(
                                    self.IOTA0,
                                    i32::wrapping_add(
                                        std::cmp::min(
                                            512,
                                            std::cmp::max(0, i32::wrapping_add(iTemp29, 1)),
                                        ),
                                        1,
                                    ),
                                )) & 1023)
                                    as usize])
                        + 0.25
                            * fTemp35
                            * self.fRec1[((i32::wrapping_sub(
                                self.IOTA0,
                                i32::wrapping_add(
                                    std::cmp::min(
                                        512,
                                        std::cmp::max(0, i32::wrapping_add(iTemp29, 2)),
                                    ),
                                    1,
                                ),
                            )) & 1023) as usize])
                    - 0.16666667
                        * fTemp36
                        * self.fRec1[((i32::wrapping_sub(
                            self.IOTA0,
                            i32::wrapping_add(
                                std::cmp::min(512, std::cmp::max(0, i32::wrapping_add(iTemp29, 3))),
                                1,
                            ),
                        )) & 1023) as usize])
                + 0.041666668
                    * fTemp36
                    * fTemp31
                    * self.fRec1[((i32::wrapping_sub(
                        self.IOTA0,
                        i32::wrapping_add(
                            std::cmp::min(512, std::cmp::max(0, i32::wrapping_add(iTemp29, 4))),
                            1,
                        ),
                    )) & 1023) as usize];
            self.fVec7[(self.IOTA0 & 131071) as usize] = fTemp37;
            let mut fTemp38: F32 =
                self.fVec7[((i32::wrapping_sub(self.IOTA0, iTemp19)) & 131071) as usize];
            let mut fTemp39: F32 = *input1
                + 0.5
                    * fTemp1
                    * (fTemp38
                        + self.fRec6[0]
                            * (self.fVec7
                                [((i32::wrapping_sub(self.IOTA0, iTemp21)) & 131071) as usize]
                                - fTemp38));
            let mut fTemp40: F32 = fTemp26 * fTemp39 - fTemp25 * self.fRec10[1];
            let mut fTemp41: F32 = fTemp26 * fTemp40 - fTemp25 * self.fRec13[1];
            let mut fTemp42: F32 = fTemp26 * fTemp41 - fTemp25 * self.fRec16[1];
            self.fRec21[0] =
                0.9999 * (self.fRec21[1] + (i32::wrapping_mul(iTemp5, iSlow7)) as F32) + fSlow8;
            let mut fTemp43: F32 = self.fRec21[0] + -1.49999;
            let mut fTemp44: F32 = F32::floor(fTemp43);
            self.fVec8[(self.IOTA0 & 16383) as usize] =
                fTemp25 * self.fRec19[1] - fTemp26 * fTemp42;
            let mut fTemp45: F32 = self.fVec8[((i32::wrapping_sub(
                self.IOTA0,
                std::cmp::min(8192, std::cmp::max(0, (fTemp43) as i32)),
            )) & 16383) as usize];
            self.fVec9[0] = fTemp45;
            self.fRec20[0] = self.fVec9[1]
                - (fTemp44 + (2.0 - self.fRec21[0])) * (self.fRec20[1] - fTemp45)
                    / (self.fRec21[0] - fTemp44);
            self.fRec18[0] = self.fRec20[0];
            self.fRec23[0] =
                0.9999 * (self.fRec23[1] + (i32::wrapping_mul(iTemp5, iSlow9)) as F32) + fSlow10;
            let mut fTemp46: F32 = self.fRec23[0] + -1.49999;
            let mut fTemp47: F32 = F32::floor(fTemp46);
            let mut fTemp48: F32 = fTemp22 * fTemp26 - fTemp25 * self.fRec9[1];
            let mut fTemp49: F32 = fTemp26 * fTemp48 - fTemp25 * self.fRec12[1];
            let mut fTemp50: F32 = fTemp26 * fTemp49 - fTemp25 * self.fRec15[1];
            self.fVec10[(self.IOTA0 & 16383) as usize] =
                fTemp26 * fTemp50 - fTemp25 * self.fRec18[1];
            let mut fTemp51: F32 = self.fVec10[((i32::wrapping_sub(
                self.IOTA0,
                std::cmp::min(8192, std::cmp::max(0, (fTemp46) as i32)),
            )) & 16383) as usize];
            self.fVec11[0] = fTemp51;
            self.fRec22[0] = self.fVec11[1]
                - (fTemp47 + (2.0 - self.fRec23[0])) * (self.fRec22[1] - fTemp51)
                    / (self.fRec23[0] - fTemp47);
            self.fRec19[0] = self.fRec22[0];
            self.fVec12[(self.IOTA0 & 16383) as usize] =
                fTemp26 * self.fRec19[1] + fTemp25 * fTemp42;
            self.fRec24[0] =
                0.9999 * (self.fRec24[1] + (i32::wrapping_mul(iTemp5, iSlow11)) as F32) + fSlow12;
            let mut fTemp52: F32 = self.fRec24[0] + -1.49999;
            let mut fTemp53: F32 = self.fVec12[((i32::wrapping_sub(
                self.IOTA0,
                std::cmp::min(8192, std::cmp::max(0, (fTemp52) as i32)),
            )) & 16383) as usize];
            self.fVec13[0] = fTemp53;
            let mut fTemp54: F32 = F32::floor(fTemp52);
            let mut fTemp55: F32 = self.fRec24[0] - fTemp54;
            let mut fTemp56: F32 = fTemp54 + (2.0 - self.fRec24[0]);
            self.fRec17[0] = -(self.fRec17[1] * fTemp56 / fTemp55
                + fTemp56 * fTemp53 / fTemp55
                + self.fVec13[1]);
            self.fRec15[0] = self.fRec17[0];
            self.fRec26[0] =
                0.9999 * (self.fRec26[1] + (i32::wrapping_mul(iTemp5, iSlow13)) as F32) + fSlow14;
            let mut fTemp57: F32 = self.fRec26[0] + -1.49999;
            let mut fTemp58: F32 = F32::floor(fTemp57);
            self.fVec14[(self.IOTA0 & 16383) as usize] =
                self.fRec18[1] * fTemp26 + fTemp25 * fTemp50;
            let mut fTemp59: F32 = self.fVec14[((i32::wrapping_sub(
                self.IOTA0,
                std::cmp::min(8192, std::cmp::max(0, (fTemp57) as i32)),
            )) & 16383) as usize];
            self.fVec15[0] = fTemp59;
            self.fRec25[0] = self.fVec15[1]
                - (fTemp58 + (2.0 - self.fRec26[0])) * (self.fRec25[1] - fTemp59)
                    / (self.fRec26[0] - fTemp58);
            self.fRec16[0] = self.fRec25[0];
            self.fVec16[(self.IOTA0 & 16383) as usize] =
                fTemp26 * self.fRec16[1] + fTemp25 * fTemp41;
            self.fRec27[0] =
                0.9999 * (self.fRec27[1] + (i32::wrapping_mul(iTemp5, iSlow15)) as F32) + fSlow16;
            let mut fTemp60: F32 = self.fRec27[0] + -1.49999;
            let mut fTemp61: F32 = self.fVec16[((i32::wrapping_sub(
                self.IOTA0,
                std::cmp::min(8192, std::cmp::max(0, (fTemp60) as i32)),
            )) & 16383) as usize];
            self.fVec17[0] = fTemp61;
            let mut fTemp62: F32 = F32::floor(fTemp60);
            let mut fTemp63: F32 = self.fRec27[0] - fTemp62;
            let mut fTemp64: F32 = fTemp62 + (2.0 - self.fRec27[0]);
            self.fRec14[0] = -(self.fRec14[1] * fTemp64 / fTemp63
                + fTemp64 * fTemp61 / fTemp63
                + self.fVec17[1]);
            self.fRec12[0] = self.fRec14[0];
            self.fRec29[0] =
                0.9999 * (self.fRec29[1] + (i32::wrapping_mul(iTemp5, iSlow17)) as F32) + fSlow18;
            let mut fTemp65: F32 = self.fRec29[0] + -1.49999;
            let mut fTemp66: F32 = F32::floor(fTemp65);
            self.fVec18[(self.IOTA0 & 16383) as usize] =
                self.fRec15[1] * fTemp26 + fTemp25 * fTemp49;
            let mut fTemp67: F32 = self.fVec18[((i32::wrapping_sub(
                self.IOTA0,
                std::cmp::min(8192, std::cmp::max(0, (fTemp65) as i32)),
            )) & 16383) as usize];
            self.fVec19[0] = fTemp67;
            self.fRec28[0] = self.fVec19[1]
                - (fTemp66 + (2.0 - self.fRec29[0])) * (self.fRec28[1] - fTemp67)
                    / (self.fRec29[0] - fTemp66);
            self.fRec13[0] = self.fRec28[0];
            self.fVec20[(self.IOTA0 & 16383) as usize] =
                fTemp26 * self.fRec13[1] + fTemp25 * fTemp40;
            self.fRec30[0] =
                0.9999 * (self.fRec30[1] + (i32::wrapping_mul(iTemp5, iSlow19)) as F32) + fSlow20;
            let mut fTemp68: F32 = self.fRec30[0] + -1.49999;
            let mut fTemp69: F32 = self.fVec20[((i32::wrapping_sub(
                self.IOTA0,
                std::cmp::min(8192, std::cmp::max(0, (fTemp68) as i32)),
            )) & 16383) as usize];
            self.fVec21[0] = fTemp69;
            let mut fTemp70: F32 = F32::floor(fTemp68);
            let mut fTemp71: F32 = self.fRec30[0] - fTemp70;
            let mut fTemp72: F32 = fTemp70 + (2.0 - self.fRec30[0]);
            self.fRec11[0] = -(self.fRec11[1] * fTemp72 / fTemp71
                + fTemp72 * fTemp69 / fTemp71
                + self.fVec21[1]);
            self.fRec9[0] = self.fRec11[0];
            self.fRec32[0] =
                0.9999 * (self.fRec32[1] + (i32::wrapping_mul(iTemp5, iSlow21)) as F32) + fSlow22;
            let mut fTemp73: F32 = self.fRec32[0] + -1.49999;
            let mut fTemp74: F32 = F32::floor(fTemp73);
            self.fVec22[(self.IOTA0 & 16383) as usize] =
                self.fRec12[1] * fTemp26 + fTemp25 * fTemp48;
            let mut fTemp75: F32 = self.fVec22[((i32::wrapping_sub(
                self.IOTA0,
                std::cmp::min(8192, std::cmp::max(0, (fTemp73) as i32)),
            )) & 16383) as usize];
            self.fVec23[0] = fTemp75;
            self.fRec31[0] = self.fVec23[1]
                - (fTemp74 + (2.0 - self.fRec32[0])) * (self.fRec31[1] - fTemp75)
                    / (self.fRec32[0] - fTemp74);
            self.fRec10[0] = self.fRec31[0];
            let mut fTemp76: F32 = self.fRec9[1] * fTemp26 + fTemp25 * fTemp22;
            let mut fTemp77: F32 = -0.5 * fTemp23;
            let mut fTemp78: F32 = F32::sin(fTemp77);
            let mut fTemp79: F32 = F32::cos(fTemp77);
            let mut fTemp80: F32 = fTemp26 * self.fRec10[1] + fTemp25 * fTemp39;
            let mut fTemp81: F32 = fTemp79 * fTemp80 - fTemp78 * self.fRec34[1];
            let mut fTemp82: F32 = fTemp79 * fTemp81 - fTemp78 * self.fRec37[1];
            let mut fTemp83: F32 = fTemp79 * fTemp82 - fTemp78 * self.fRec40[1];
            self.fRec45[0] =
                0.9999 * (self.fRec45[1] + (i32::wrapping_mul(iTemp5, iSlow23)) as F32) + fSlow24;
            let mut fTemp84: F32 = self.fRec45[0] + -1.49999;
            let mut fTemp85: F32 = F32::floor(fTemp84);
            self.fVec24[(self.IOTA0 & 16383) as usize] =
                fTemp78 * self.fRec43[1] - fTemp79 * fTemp83;
            let mut fTemp86: F32 = self.fVec24[((i32::wrapping_sub(
                self.IOTA0,
                std::cmp::min(8192, std::cmp::max(0, (fTemp84) as i32)),
            )) & 16383) as usize];
            self.fVec25[0] = fTemp86;
            self.fRec44[0] = self.fVec25[1]
                - (fTemp85 + (2.0 - self.fRec45[0])) * (self.fRec44[1] - fTemp86)
                    / (self.fRec45[0] - fTemp85);
            self.fRec42[0] = self.fRec44[0];
            self.fRec47[0] =
                0.9999 * (self.fRec47[1] + (i32::wrapping_mul(iTemp5, iSlow25)) as F32) + fSlow26;
            let mut fTemp87: F32 = self.fRec47[0] + -1.49999;
            let mut fTemp88: F32 = F32::floor(fTemp87);
            let mut fTemp89: F32 = fTemp76 * fTemp79 - fTemp78 * self.fRec33[1];
            let mut fTemp90: F32 = fTemp79 * fTemp89 - fTemp78 * self.fRec36[1];
            let mut fTemp91: F32 = fTemp79 * fTemp90 - fTemp78 * self.fRec39[1];
            self.fVec26[(self.IOTA0 & 16383) as usize] =
                fTemp79 * fTemp91 - self.fRec42[1] * fTemp78;
            let mut fTemp92: F32 = self.fVec26[((i32::wrapping_sub(
                self.IOTA0,
                std::cmp::min(8192, std::cmp::max(0, (fTemp87) as i32)),
            )) & 16383) as usize];
            self.fVec27[0] = fTemp92;
            self.fRec46[0] = self.fVec27[1]
                - (fTemp88 + (2.0 - self.fRec47[0])) * (self.fRec46[1] - fTemp92)
                    / (self.fRec47[0] - fTemp88);
            self.fRec43[0] = self.fRec46[0];
            self.fVec28[(self.IOTA0 & 16383) as usize] =
                fTemp79 * self.fRec43[1] + fTemp78 * fTemp83;
            self.fRec48[0] =
                0.9999 * (self.fRec48[1] + (i32::wrapping_mul(iTemp5, iSlow27)) as F32) + fSlow28;
            let mut fTemp93: F32 = self.fRec48[0] + -1.49999;
            let mut fTemp94: F32 = self.fVec28[((i32::wrapping_sub(
                self.IOTA0,
                std::cmp::min(8192, std::cmp::max(0, (fTemp93) as i32)),
            )) & 16383) as usize];
            self.fVec29[0] = fTemp94;
            let mut fTemp95: F32 = F32::floor(fTemp93);
            let mut fTemp96: F32 = self.fRec48[0] - fTemp95;
            let mut fTemp97: F32 = fTemp95 + (2.0 - self.fRec48[0]);
            self.fRec41[0] = -(self.fRec41[1] * fTemp97 / fTemp96
                + fTemp97 * fTemp94 / fTemp96
                + self.fVec29[1]);
            self.fRec39[0] = self.fRec41[0];
            self.fRec50[0] =
                0.9999 * (self.fRec50[1] + (i32::wrapping_mul(iTemp5, iSlow29)) as F32) + fSlow30;
            let mut fTemp98: F32 = self.fRec50[0] + -1.49999;
            let mut fTemp99: F32 = F32::floor(fTemp98);
            self.fVec30[(self.IOTA0 & 16383) as usize] =
                self.fRec42[1] * fTemp79 + fTemp78 * fTemp91;
            let mut fTemp100: F32 = self.fVec30[((i32::wrapping_sub(
                self.IOTA0,
                std::cmp::min(8192, std::cmp::max(0, (fTemp98) as i32)),
            )) & 16383) as usize];
            self.fVec31[0] = fTemp100;
            self.fRec49[0] = self.fVec31[1]
                - (fTemp99 + (2.0 - self.fRec50[0])) * (self.fRec49[1] - fTemp100)
                    / (self.fRec50[0] - fTemp99);
            self.fRec40[0] = self.fRec49[0];
            self.fVec32[(self.IOTA0 & 16383) as usize] =
                fTemp79 * self.fRec40[1] + fTemp78 * fTemp82;
            self.fRec51[0] =
                0.9999 * (self.fRec51[1] + (i32::wrapping_mul(iTemp5, iSlow31)) as F32) + fSlow32;
            let mut fTemp101: F32 = self.fRec51[0] + -1.49999;
            let mut fTemp102: F32 = self.fVec32[((i32::wrapping_sub(
                self.IOTA0,
                std::cmp::min(8192, std::cmp::max(0, (fTemp101) as i32)),
            )) & 16383) as usize];
            self.fVec33[0] = fTemp102;
            let mut fTemp103: F32 = F32::floor(fTemp101);
            let mut fTemp104: F32 = self.fRec51[0] - fTemp103;
            let mut fTemp105: F32 = fTemp103 + (2.0 - self.fRec51[0]);
            self.fRec38[0] = -(self.fRec38[1] * fTemp105 / fTemp104
                + fTemp105 * fTemp102 / fTemp104
                + self.fVec33[1]);
            self.fRec36[0] = self.fRec38[0];
            self.fRec53[0] =
                0.9999 * (self.fRec53[1] + (i32::wrapping_mul(iTemp5, iSlow33)) as F32) + fSlow34;
            let mut fTemp106: F32 = self.fRec53[0] + -1.49999;
            let mut fTemp107: F32 = F32::floor(fTemp106);
            self.fVec34[(self.IOTA0 & 16383) as usize] =
                self.fRec39[1] * fTemp79 + fTemp78 * fTemp90;
            let mut fTemp108: F32 = self.fVec34[((i32::wrapping_sub(
                self.IOTA0,
                std::cmp::min(8192, std::cmp::max(0, (fTemp106) as i32)),
            )) & 16383) as usize];
            self.fVec35[0] = fTemp108;
            self.fRec52[0] = self.fVec35[1]
                - (fTemp107 + (2.0 - self.fRec53[0])) * (self.fRec52[1] - fTemp108)
                    / (self.fRec53[0] - fTemp107);
            self.fRec37[0] = self.fRec52[0];
            self.fVec36[(self.IOTA0 & 16383) as usize] =
                fTemp79 * self.fRec37[1] + fTemp78 * fTemp81;
            self.fRec54[0] =
                0.9999 * (self.fRec54[1] + (i32::wrapping_mul(iTemp5, iSlow35)) as F32) + fSlow36;
            let mut fTemp109: F32 = self.fRec54[0] + -1.49999;
            let mut fTemp110: F32 = self.fVec36[((i32::wrapping_sub(
                self.IOTA0,
                std::cmp::min(8192, std::cmp::max(0, (fTemp109) as i32)),
            )) & 16383) as usize];
            self.fVec37[0] = fTemp110;
            let mut fTemp111: F32 = F32::floor(fTemp109);
            let mut fTemp112: F32 = self.fRec54[0] - fTemp111;
            let mut fTemp113: F32 = fTemp111 + (2.0 - self.fRec54[0]);
            self.fRec35[0] = -(self.fRec35[1] * fTemp113 / fTemp112
                + fTemp113 * fTemp110 / fTemp112
                + self.fVec37[1]);
            self.fRec33[0] = self.fRec35[0];
            self.fRec56[0] =
                0.9999 * (self.fRec56[1] + (i32::wrapping_mul(iTemp5, iSlow37)) as F32) + fSlow38;
            let mut fTemp114: F32 = self.fRec56[0] + -1.49999;
            let mut fTemp115: F32 = F32::floor(fTemp114);
            self.fVec38[(self.IOTA0 & 16383) as usize] =
                self.fRec36[1] * fTemp79 + fTemp78 * fTemp89;
            let mut fTemp116: F32 = self.fVec38[((i32::wrapping_sub(
                self.IOTA0,
                std::cmp::min(8192, std::cmp::max(0, (fTemp114) as i32)),
            )) & 16383) as usize];
            self.fVec39[0] = fTemp116;
            self.fRec55[0] = self.fVec39[1]
                - (fTemp115 + (2.0 - self.fRec56[0])) * (self.fRec55[1] - fTemp116)
                    / (self.fRec56[0] - fTemp115);
            self.fRec34[0] = self.fRec55[0];
            let mut fTemp117: F32 = self.fRec33[1] * fTemp79 + fTemp78 * fTemp76;
            let mut fTemp118: F32 = fTemp79 * self.fRec34[1] + fTemp78 * fTemp80;
            let mut fTemp119: F32 = fTemp26 * fTemp118 - fTemp25 * self.fRec58[1];
            let mut fTemp120: F32 = fTemp26 * fTemp119 - fTemp25 * self.fRec61[1];
            let mut fTemp121: F32 = fTemp26 * fTemp120 - fTemp25 * self.fRec64[1];
            self.fRec69[0] =
                0.9999 * (self.fRec69[1] + (i32::wrapping_mul(iTemp5, iSlow39)) as F32) + fSlow40;
            let mut fTemp122: F32 = self.fRec69[0] + -1.49999;
            let mut fTemp123: F32 = F32::floor(fTemp122);
            self.fVec40[(self.IOTA0 & 16383) as usize] =
                fTemp25 * self.fRec67[1] - fTemp26 * fTemp121;
            let mut fTemp124: F32 = self.fVec40[((i32::wrapping_sub(
                self.IOTA0,
                std::cmp::min(8192, std::cmp::max(0, (fTemp122) as i32)),
            )) & 16383) as usize];
            self.fVec41[0] = fTemp124;
            self.fRec68[0] = self.fVec41[1]
                - (fTemp123 + (2.0 - self.fRec69[0])) * (self.fRec68[1] - fTemp124)
                    / (self.fRec69[0] - fTemp123);
            self.fRec66[0] = self.fRec68[0];
            self.fRec71[0] =
                0.9999 * (self.fRec71[1] + (i32::wrapping_mul(iTemp5, iSlow41)) as F32) + fSlow42;
            let mut fTemp125: F32 = self.fRec71[0] + -1.49999;
            let mut fTemp126: F32 = F32::floor(fTemp125);
            let mut fTemp127: F32 = fTemp26 * fTemp117 - fTemp25 * self.fRec57[1];
            let mut fTemp128: F32 = fTemp26 * fTemp127 - fTemp25 * self.fRec60[1];
            let mut fTemp129: F32 = fTemp26 * fTemp128 - fTemp25 * self.fRec63[1];
            self.fVec42[(self.IOTA0 & 16383) as usize] =
                fTemp26 * fTemp129 - self.fRec66[1] * fTemp25;
            let mut fTemp130: F32 = self.fVec42[((i32::wrapping_sub(
                self.IOTA0,
                std::cmp::min(8192, std::cmp::max(0, (fTemp125) as i32)),
            )) & 16383) as usize];
            self.fVec43[0] = fTemp130;
            self.fRec70[0] = self.fVec43[1]
                - (fTemp126 + (2.0 - self.fRec71[0])) * (self.fRec70[1] - fTemp130)
                    / (self.fRec71[0] - fTemp126);
            self.fRec67[0] = self.fRec70[0];
            self.fVec44[(self.IOTA0 & 16383) as usize] =
                fTemp26 * self.fRec67[1] + fTemp25 * fTemp121;
            self.fRec72[0] =
                0.9999 * (self.fRec72[1] + (i32::wrapping_mul(iTemp5, iSlow43)) as F32) + fSlow44;
            let mut fTemp131: F32 = self.fRec72[0] + -1.49999;
            let mut fTemp132: F32 = self.fVec44[((i32::wrapping_sub(
                self.IOTA0,
                std::cmp::min(8192, std::cmp::max(0, (fTemp131) as i32)),
            )) & 16383) as usize];
            self.fVec45[0] = fTemp132;
            let mut fTemp133: F32 = F32::floor(fTemp131);
            let mut fTemp134: F32 = self.fRec72[0] - fTemp133;
            let mut fTemp135: F32 = fTemp133 + (2.0 - self.fRec72[0]);
            self.fRec65[0] = -(self.fRec65[1] * fTemp135 / fTemp134
                + fTemp135 * fTemp132 / fTemp134
                + self.fVec45[1]);
            self.fRec63[0] = self.fRec65[0];
            self.fRec74[0] =
                0.9999 * (self.fRec74[1] + (i32::wrapping_mul(iTemp5, iSlow45)) as F32) + fSlow46;
            let mut fTemp136: F32 = self.fRec74[0] + -1.49999;
            let mut fTemp137: F32 = F32::floor(fTemp136);
            self.fVec46[(self.IOTA0 & 16383) as usize] =
                self.fRec66[1] * fTemp26 + fTemp25 * fTemp129;
            let mut fTemp138: F32 = self.fVec46[((i32::wrapping_sub(
                self.IOTA0,
                std::cmp::min(8192, std::cmp::max(0, (fTemp136) as i32)),
            )) & 16383) as usize];
            self.fVec47[0] = fTemp138;
            self.fRec73[0] = self.fVec47[1]
                - (fTemp137 + (2.0 - self.fRec74[0])) * (self.fRec73[1] - fTemp138)
                    / (self.fRec74[0] - fTemp137);
            self.fRec64[0] = self.fRec73[0];
            self.fVec48[(self.IOTA0 & 16383) as usize] =
                fTemp26 * self.fRec64[1] + fTemp25 * fTemp120;
            self.fRec75[0] =
                0.9999 * (self.fRec75[1] + (i32::wrapping_mul(iTemp5, iSlow47)) as F32) + fSlow48;
            let mut fTemp139: F32 = self.fRec75[0] + -1.49999;
            let mut fTemp140: F32 = self.fVec48[((i32::wrapping_sub(
                self.IOTA0,
                std::cmp::min(8192, std::cmp::max(0, (fTemp139) as i32)),
            )) & 16383) as usize];
            self.fVec49[0] = fTemp140;
            let mut fTemp141: F32 = F32::floor(fTemp139);
            let mut fTemp142: F32 = self.fRec75[0] - fTemp141;
            let mut fTemp143: F32 = fTemp141 + (2.0 - self.fRec75[0]);
            self.fRec62[0] = -(self.fRec62[1] * fTemp143 / fTemp142
                + fTemp143 * fTemp140 / fTemp142
                + self.fVec49[1]);
            self.fRec60[0] = self.fRec62[0];
            self.fRec77[0] =
                0.9999 * (self.fRec77[1] + (i32::wrapping_mul(iTemp5, iSlow49)) as F32) + fSlow50;
            let mut fTemp144: F32 = self.fRec77[0] + -1.49999;
            let mut fTemp145: F32 = F32::floor(fTemp144);
            self.fVec50[(self.IOTA0 & 16383) as usize] =
                self.fRec63[1] * fTemp26 + fTemp25 * fTemp128;
            let mut fTemp146: F32 = self.fVec50[((i32::wrapping_sub(
                self.IOTA0,
                std::cmp::min(8192, std::cmp::max(0, (fTemp144) as i32)),
            )) & 16383) as usize];
            self.fVec51[0] = fTemp146;
            self.fRec76[0] = self.fVec51[1]
                - (fTemp145 + (2.0 - self.fRec77[0])) * (self.fRec76[1] - fTemp146)
                    / (self.fRec77[0] - fTemp145);
            self.fRec61[0] = self.fRec76[0];
            self.fVec52[(self.IOTA0 & 16383) as usize] =
                fTemp26 * self.fRec61[1] + fTemp25 * fTemp119;
            self.fRec78[0] =
                0.9999 * (self.fRec78[1] + (i32::wrapping_mul(iTemp5, iSlow51)) as F32) + fSlow52;
            let mut fTemp147: F32 = self.fRec78[0] + -1.49999;
            let mut fTemp148: F32 = self.fVec52[((i32::wrapping_sub(
                self.IOTA0,
                std::cmp::min(8192, std::cmp::max(0, (fTemp147) as i32)),
            )) & 16383) as usize];
            self.fVec53[0] = fTemp148;
            let mut fTemp149: F32 = F32::floor(fTemp147);
            let mut fTemp150: F32 = self.fRec78[0] - fTemp149;
            let mut fTemp151: F32 = fTemp149 + (2.0 - self.fRec78[0]);
            self.fRec59[0] = -(self.fRec59[1] * fTemp151 / fTemp150
                + fTemp151 * fTemp148 / fTemp150
                + self.fVec53[1]);
            self.fRec57[0] = self.fRec59[0];
            self.fRec80[0] =
                0.9999 * (self.fRec80[1] + (i32::wrapping_mul(iTemp5, iSlow53)) as F32) + fSlow54;
            let mut fTemp152: F32 = self.fRec80[0] + -1.49999;
            let mut fTemp153: F32 = F32::floor(fTemp152);
            self.fVec54[(self.IOTA0 & 16383) as usize] =
                self.fRec60[1] * fTemp26 + fTemp25 * fTemp127;
            let mut fTemp154: F32 = self.fVec54[((i32::wrapping_sub(
                self.IOTA0,
                std::cmp::min(8192, std::cmp::max(0, (fTemp152) as i32)),
            )) & 16383) as usize];
            self.fVec55[0] = fTemp154;
            self.fRec79[0] = self.fVec55[1]
                - (fTemp153 + (2.0 - self.fRec80[0])) * (self.fRec79[1] - fTemp154)
                    / (self.fRec80[0] - fTemp153);
            self.fRec58[0] = self.fRec79[0];
            let mut fTemp155: F32 = 1.0 - 0.5 * fTemp0;
            self.fRec2[0] = fTemp155 * (self.fRec57[1] * fTemp26 + fTemp25 * fTemp117)
                + 0.5 * fTemp0 * self.fRec2[1];
            self.fRec0[(self.IOTA0 & 1023) as usize] = self.fRec2[0];
            self.fRec81[0] = fTemp155 * (fTemp26 * self.fRec58[1] + fTemp25 * fTemp118)
                + 0.5 * fTemp0 * self.fRec81[1];
            self.fRec1[(self.IOTA0 & 1023) as usize] = self.fRec81[0];
            *output0 = self.fRec0[(self.IOTA0 & 1023) as usize];
            *output1 = self.fRec1[(self.IOTA0 & 1023) as usize];
            self.iVec0[1] = self.iVec0[0];
            self.fVec1[1] = self.fVec1[0];
            self.fVec2[1] = self.fVec2[0];
            self.IOTA0 = i32::wrapping_add(self.IOTA0, 1);
            self.fVec3[1] = self.fVec3[0];
            self.fRec3[1] = self.fRec3[0];
            self.fRec4[1] = self.fRec4[0];
            self.fVec4[1] = self.fVec4[0];
            self.fRec5[1] = self.fRec5[0];
            self.fRec6[1] = self.fRec6[0];
            self.fRec7[1] = self.fRec7[0];
            self.fRec8[1] = self.fRec8[0];
            self.fVec6[1] = self.fVec6[0];
            self.fRec21[1] = self.fRec21[0];
            self.fVec9[1] = self.fVec9[0];
            self.fRec20[1] = self.fRec20[0];
            self.fRec18[1] = self.fRec18[0];
            self.fRec23[1] = self.fRec23[0];
            self.fVec11[1] = self.fVec11[0];
            self.fRec22[1] = self.fRec22[0];
            self.fRec19[1] = self.fRec19[0];
            self.fRec24[1] = self.fRec24[0];
            self.fVec13[1] = self.fVec13[0];
            self.fRec17[1] = self.fRec17[0];
            self.fRec15[1] = self.fRec15[0];
            self.fRec26[1] = self.fRec26[0];
            self.fVec15[1] = self.fVec15[0];
            self.fRec25[1] = self.fRec25[0];
            self.fRec16[1] = self.fRec16[0];
            self.fRec27[1] = self.fRec27[0];
            self.fVec17[1] = self.fVec17[0];
            self.fRec14[1] = self.fRec14[0];
            self.fRec12[1] = self.fRec12[0];
            self.fRec29[1] = self.fRec29[0];
            self.fVec19[1] = self.fVec19[0];
            self.fRec28[1] = self.fRec28[0];
            self.fRec13[1] = self.fRec13[0];
            self.fRec30[1] = self.fRec30[0];
            self.fVec21[1] = self.fVec21[0];
            self.fRec11[1] = self.fRec11[0];
            self.fRec9[1] = self.fRec9[0];
            self.fRec32[1] = self.fRec32[0];
            self.fVec23[1] = self.fVec23[0];
            self.fRec31[1] = self.fRec31[0];
            self.fRec10[1] = self.fRec10[0];
            self.fRec45[1] = self.fRec45[0];
            self.fVec25[1] = self.fVec25[0];
            self.fRec44[1] = self.fRec44[0];
            self.fRec42[1] = self.fRec42[0];
            self.fRec47[1] = self.fRec47[0];
            self.fVec27[1] = self.fVec27[0];
            self.fRec46[1] = self.fRec46[0];
            self.fRec43[1] = self.fRec43[0];
            self.fRec48[1] = self.fRec48[0];
            self.fVec29[1] = self.fVec29[0];
            self.fRec41[1] = self.fRec41[0];
            self.fRec39[1] = self.fRec39[0];
            self.fRec50[1] = self.fRec50[0];
            self.fVec31[1] = self.fVec31[0];
            self.fRec49[1] = self.fRec49[0];
            self.fRec40[1] = self.fRec40[0];
            self.fRec51[1] = self.fRec51[0];
            self.fVec33[1] = self.fVec33[0];
            self.fRec38[1] = self.fRec38[0];
            self.fRec36[1] = self.fRec36[0];
            self.fRec53[1] = self.fRec53[0];
            self.fVec35[1] = self.fVec35[0];
            self.fRec52[1] = self.fRec52[0];
            self.fRec37[1] = self.fRec37[0];
            self.fRec54[1] = self.fRec54[0];
            self.fVec37[1] = self.fVec37[0];
            self.fRec35[1] = self.fRec35[0];
            self.fRec33[1] = self.fRec33[0];
            self.fRec56[1] = self.fRec56[0];
            self.fVec39[1] = self.fVec39[0];
            self.fRec55[1] = self.fRec55[0];
            self.fRec34[1] = self.fRec34[0];
            self.fRec69[1] = self.fRec69[0];
            self.fVec41[1] = self.fVec41[0];
            self.fRec68[1] = self.fRec68[0];
            self.fRec66[1] = self.fRec66[0];
            self.fRec71[1] = self.fRec71[0];
            self.fVec43[1] = self.fVec43[0];
            self.fRec70[1] = self.fRec70[0];
            self.fRec67[1] = self.fRec67[0];
            self.fRec72[1] = self.fRec72[0];
            self.fVec45[1] = self.fVec45[0];
            self.fRec65[1] = self.fRec65[0];
            self.fRec63[1] = self.fRec63[0];
            self.fRec74[1] = self.fRec74[0];
            self.fVec47[1] = self.fVec47[0];
            self.fRec73[1] = self.fRec73[0];
            self.fRec64[1] = self.fRec64[0];
            self.fRec75[1] = self.fRec75[0];
            self.fVec49[1] = self.fVec49[0];
            self.fRec62[1] = self.fRec62[0];
            self.fRec60[1] = self.fRec60[0];
            self.fRec77[1] = self.fRec77[0];
            self.fVec51[1] = self.fVec51[0];
            self.fRec76[1] = self.fRec76[0];
            self.fRec61[1] = self.fRec61[0];
            self.fRec78[1] = self.fRec78[0];
            self.fVec53[1] = self.fVec53[0];
            self.fRec59[1] = self.fRec59[0];
            self.fRec57[1] = self.fRec57[0];
            self.fRec80[1] = self.fRec80[0];
            self.fVec55[1] = self.fVec55[0];
            self.fRec79[1] = self.fRec79[0];
            self.fRec58[1] = self.fRec58[0];
            self.fRec2[1] = self.fRec2[0];
            self.fRec81[1] = self.fRec81[0];
        }
    }
}
