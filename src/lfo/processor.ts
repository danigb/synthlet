export const PROCESSOR = `(()=>{function y(t){return Object.keys(t).map(e=>{let{min:o,max:r,init:n}=t[e];return{name:e,minValue:o,maxValue:r,defaultValue:n,automationRate:"k-rate"}})}var i=Math.PI,w=2*i,T=i*i;var M=4/i,A=-4/T,R=.225;function S(t){let e=M*t+A*t*Math.abs(t);return R*(e*Math.abs(e)-e)+e}var s=5/12,c=Math.pow(10,-1/s),F=1/(1-c),V=1/(1+s*Math.log10(1+c)),z=1/(1+-Math.pow(10,-1/s)),g=s*Math.log10(1+c),v=1/(-s*Math.log10(c)+g);function p(t){if(t>=1)return 1;if(t<=0)return 0;let e=-s*v*Math.log10(1-t+c)+g;return f(e,0,1)}function f(t,e,o){return Math.max(e,Math.min(o,t))}function a(t){return 2*t-1}function E(t,e){return(e+t%e)%e}function N(t,e,o){return e+E(t-e,o-e)}function O(t,e){return t=f(t,-1,1),Math.floor((t+1)/2*e+.5)/e}var h=class{constructor(e){this.sampleRate=e;this.mcounter=0;this.phaseInc=0;this.phaseOffset=0;this.freqOffset=0;this.freqHz=0;this.mcounter=0,this.phaseOffset=0,this.freqOffset=0}setFrequency(e){this.freqHz=e,this.phaseInc=this.freqHz/this.sampleRate}addPhaseOffset(e,o){this.phaseOffset=e,this.phaseInc>0?this.mcounter+=e:this.mcounter-=e,o&&this.wrapClock()}removePhaseOffset(){this.phaseInc>0?this.mcounter+=-this.phaseOffset:this.mcounter-=-this.phaseOffset}advanceClock(e){this.mcounter+=e*this.phaseInc}wrapClock(){if(this.mcounter>=0&&this.mcounter<=1)return!1;let e=this.mcounter<0;return!e&&this.mcounter<2?this.mcounter-=1:e&&this.mcounter>-1?this.mcounter+=1:this.mcounter=N(this.mcounter,0,1),!0}};var d=class{constructor(e){this.sampleRate=e;this.active=!1;this.value=0}tick(){}};function I(t,e,o,r){let n=Math.sqrt(-2*Math.log(o))*Math.cos(2*Math.PI*r);return t+e*n}function D(t=1234567){let r=Math.pow(2,32);return()=>(t=(1664525*t+1013904223)%r,t/r)}var b=class{constructor(){this.bN=[.99765,-.96362,.46454];this.doWhiteNoise=Math.random}setDeterministicWhiteNoise(e){this.doWhiteNoise=D(e)}doGaussianWhiteNoise(e=0,o=1){return I(e,o,this.doWhiteNoise(),this.doWhiteNoise())}doPinkNoise(){let e=this.doWhiteNoise();return this.bN[0]=.99765*this.bN[0]+e*.099046,this.bN[1]=.963*this.bN[1]+e*.2965164,this.bN[2]=.57*this.bN[2]+e*1.0526913,this.bN[0]+this.bN[1]+this.bN[2]+e*.1848}};var m=class{constructor(){this.counter=0;this.targetValueInSamples=0}resetTimer(){this.counter=0}setExpireSamples(e){this.targetValueInSamples=e}setExpireMilliSec(e,o){this.setExpireSamples(Math.floor(o*(e/1e3)))}getExpireSamples(){return this.targetValueInSamples}timerExpired(){return this.counter>=this.targetValueInSamples}advanceTimer(e=1){this.counter+=e}getTick(){return this.counter}};var u={waveform:0,mode:0,frequency:10,offset:0,gain:10,quantize:0},l={waveform:{min:0,max:9,init:u.waveform},frequency:{min:.001,max:200,init:u.frequency},offset:{min:0,max:1e4,init:u.offset},gain:{min:0,max:1e3,init:u.gain},quantize:{min:0,max:1e3,init:u.quantize}},x=class{constructor(e){this.sampleRate=e;this.rshOutputValue=0;this.renderComplete=!1;this.noiseGen=new b;this.params={...u};switch(this.fadeInModulator=new d(e),this.lfoClock=new h(e),this.sampleHoldTimer=new m,this.delayTimer=new m,this.rshOutputValue=this.noiseGen.doWhiteNoise(),this.renderComplete=!1,this.lfoClock.setFrequency(l.frequency.init),this.params.waveform){case 0:this.lfoClock.addPhaseOffset(.25,!0);break;case 2:case 3:this.lfoClock.addPhaseOffset(.5,!0);break}}fillAudioBuffer(e){for(let o=0;o<e.length;o++)e[o]=this.render(1)}fillControlBuffer(e){let o=this.render(e.length);for(let r=0;r<e.length;r++)e[r]=o}render(e){if(this.renderComplete)return 0;if(!this.delayTimer.timerExpired())return this.delayTimer.advanceTimer(),0;if(this.lfoClock.wrapClock()&&this.params.mode===1)return this.renderComplete=!0,0;let r=0;switch(this.params.waveform){case 0:r=1-2*Math.abs(a(this.lfoClock.mcounter));break;case 1:let n=this.lfoClock.mcounter*w-i;r=S(-n);break;case 2:r=a(this.lfoClock.mcounter);break;case 3:r=-a(this.lfoClock.mcounter);break;case 4:r=a(p(this.lfoClock.mcounter));break;case 5:r=a(p(1-this.lfoClock.mcounter));break;case 6:r=a(p(Math.abs(a(this.lfoClock.mcounter))));break;case 7:r=this.lfoClock.mcounter<=.5?1:-1;break;case 8:this.sampleHoldTimer.timerExpired()?(this.rshOutputValue=this.noiseGen.doWhiteNoise(),this.sampleHoldTimer.resetTimer()):this.sampleHoldTimer.advanceTimer(e),r=this.rshOutputValue;break;case 9:break;default:throw Error("Unknown waveform: "+this.params.waveform)}return this.fadeInModulator.active&&(r*=this.fadeInModulator.value,this.fadeInModulator.tick()),this.params.quantize&&(r=O(r,this.params.quantize)),r*=this.params.gain,this.lfoClock.advanceClock(e),r}setParameters(e,o,r,n){this.params.waveform=f(Math.floor(e),l.waveform.min,l.waveform.max),this.lfoClock.setFrequency(o),this.params.gain=r,this.params.quantize=Math.floor(n),this.params.waveform===8&&this.sampleHoldTimer.setExpireSamples(this.sampleRate/o)}};var q=y(l),C=class extends AudioWorkletProcessor{constructor(){super();this.lfo=new x(sampleRate)}process(o,r,n){this.lfo.setParameters(n.waveform[0],n.frequency[0],n.gain[0],n.quantize[0]);let k=r[0];for(let P=0;P<k.length;P++)this.lfo.fillControlBuffer(k[P]);return!0}static get parameterDescriptors(){return q}};registerProcessor("LfoWorklet",C);})();`;
